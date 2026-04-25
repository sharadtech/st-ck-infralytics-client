import { ENV } from './envConfig';
import type { InfralyticsConfig, AnalyticsEventPayload } from './types';
import { getAnonymousId, getSessionId, getUserId, setUserId } from './identity';
import { getDeviceOS, getDeviceType, getLanguage, getCountryFromLanguage } from './device';
import { getUtmParams } from './utm';
import { sendViaFetch, sendViaBeacon, TransportConfig } from './transport';
import { installAutoCapture } from './autocapture';
import { requestLocation, getCachedCoords } from './location';

/**
 * Pre-init buffer entry for a `track()` call that arrived before the SDK
 * was initialized. Typical case: the host SPA needs to asynchronously
 * fetch `/system/client/config` to know which tenant/site/db to target,
 * but early user actions must not be lost.
 */
interface BufferedTrack {
  eventType: string;
  eventSubtype: string | null;
  dims: Record<string, string>;
  metrics: Record<string, number>;
}

/** Hard cap on the pre-init buffer to avoid unbounded memory growth. */
const PRE_INIT_BUFFER_LIMIT = 100;

/**
 * Computes the effective page URL for analytics.
 *
 * For hash-router SPAs (e.g. `https://site/#/infralytics/reports/abc`) the
 * browser's `location.pathname` is always `/` and the real logical route
 * lives in `location.hash`. The ClickHouse backend stores `page_path` as
 *     page_path String ALIAS path(page_url)
 * which strips the `#…` fragment — so every event would be recorded under
 * the root path and reports like "Pages Visited" collapse to a single row.
 *
 * To keep the SDK zero-config for SPAs, when a hash-router pattern (`#/…`)
 * is detected we promote the hash content into the URL path portion of
 * `page_url` (and merge any query strings from either side). Non-hash
 * sites are untouched, so traditional multi-page apps are unaffected.
 *
 * Examples
 *   in : https://x.com/#/foo/bar?q=1
 *   out: https://x.com/foo/bar?q=1
 *
 *   in : https://x.com/page?a=1#/foo/bar?b=2
 *   out: https://x.com/foo/bar?a=1&b=2
 */
function buildPageUrl(): string {
  try {
    const loc = window.location;
    const hash = loc.hash || '';
    if (!hash.startsWith('#/')) {
      return loc.href;
    }
    const hashContent = hash.slice(1); // "/foo/bar" or "/foo/bar?x=1"
    const qIdx = hashContent.indexOf('?');
    const hashPath = qIdx >= 0 ? hashContent.slice(0, qIdx) : hashContent;
    const hashQuery = qIdx >= 0 ? hashContent.slice(qIdx + 1) : '';
    const outerQuery = (loc.search || '').replace(/^\?/, '');
    const mergedQuery = [outerQuery, hashQuery].filter(Boolean).join('&');
    return loc.origin + hashPath + (mergedQuery ? '?' + mergedQuery : '');
  } catch {
    // Any unusual runtime (SSR, worker, deeply frozen window) — fall back
    // to the browser's native href. Never throw out of event capture.
    return typeof window !== 'undefined' && window.location ? window.location.href : '';
  }
}

export class InfralyticsTracker {
  private config!: InfralyticsConfig;
  private transportCfg!: TransportConfig;
  private queue: AnalyticsEventPayload[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private teardownAutoCapture: (() => void) | null = null;
  private initialized = false;
  /** Buffers track() calls made before init() so early events aren't lost. */
  private preInitBuffer: BufferedTrack[] = [];
  private preInitUserId: string | null = null;

  /**
   * Initializes the tracker. Must be called once before any tracking occurs.
   */
  init(config: InfralyticsConfig): void {
    if (this.initialized) {
      this.log('Already initialized — ignoring duplicate init()');
      return;
    }

    if (!config.serverUrl || !config.tenantId || !config.siteId) {
      console.error('[Infralytics] init() requires serverUrl, tenantId, and siteId');
      return;
    }

    // Merge dbName into globalDimensions so every event is tagged with the
    // ClickHouse DB it was intended for (purely informational — the server
    // resolves the real DB from the moduleConfig matching tenantId+siteId).
    const globalDimensions = {
      ...(config.dbName ? { ch_db_name: config.dbName } : {}),
      ...(config.globalDimensions ?? {}),
    };

    this.config = {
      batchSize: ENV.BATCH_SIZE,
      flushIntervalMs: ENV.FLUSH_INTERVAL_MS,
      sessionTimeoutMs: ENV.SESSION_TIMEOUT_MS,
      debug: ENV.DEBUG,
      clickSelector: 'a, button, [data-il-track], input[type="submit"]',
      ...config,
      globalDimensions,
    };

    this.transportCfg = {
      serverUrl: this.config.serverUrl,
      tenantId: this.config.tenantId,
      siteId: this.config.siteId,
      debug: this.config.debug ?? false,
    };

    // A deferred identify() that ran before init still needs to stick.
    if (this.preInitUserId) {
      setUserId(this.preInitUserId);
      this.preInitUserId = null;
    }
    if (this.config.userId) {
      setUserId(this.config.userId);
    }

    this.startFlushTimer();

    this.teardownAutoCapture = installAutoCapture(
      this.config,
      (eventType, eventSubtype, dims, metrics) => {
        this.trackRaw(eventType, eventSubtype, dims, metrics);
      },
    );

    this.initialized = true;

    // Fire-and-forget geolocation consent prompt. The promise is NOT awaited
    // — any events queued before the user responds go out with no precise
    // coords (server still resolves country via IP geo), and once consent
    // lands, every subsequent event picks up the cached lat/lng from
    // localStorage. We explicitly pass `debug` through so granted/denied
    // transitions show up in the browser console when debug mode is on.
    if (this.config.captureLocation) {
      requestLocation(this.config.debug).catch(() => { /* never throws */ });
    }

    // Drain anything that arrived during the async bootstrap window.
    if (this.preInitBuffer.length > 0) {
      const buffered = this.preInitBuffer.splice(0);
      this.log(`Draining pre-init buffer (${buffered.length} event(s))`);
      for (const b of buffered) {
        this.trackRaw(b.eventType, b.eventSubtype, b.dims, b.metrics);
      }
    }

    this.log('Initialized', {
      tenantId: config.tenantId,
      siteId: config.siteId,
      dbName: config.dbName,
      captureLocation: !!config.captureLocation,
    });
  }

  /**
   * Manually track a named event.
   *
   * @example
   *   Infralytics.track('search', { search_term: 'blue widget' });
   *   Infralytics.track('login', { method: 'google' });
   */
  track(
    eventType: string,
    customDimensions?: Record<string, string>,
    customMetrics?: Record<string, number>,
    eventSubtype?: string,
  ): void {
    if (!this.initialized) {
      // Buffer until init() drains us. Capped so a misconfigured page
      // can't OOM the browser.
      if (this.preInitBuffer.length >= PRE_INIT_BUFFER_LIMIT) {
        this.preInitBuffer.shift();
      }
      this.preInitBuffer.push({
        eventType,
        eventSubtype: eventSubtype ?? null,
        dims: customDimensions ?? {},
        metrics: customMetrics ?? {},
      });
      return;
    }
    this.trackRaw(eventType, eventSubtype ?? null, customDimensions ?? {}, customMetrics ?? {});
  }

  /**
   * Identifies the current user. Subsequent events will include this user_id.
   * Safe to call before init() — the id is cached and applied on init.
   */
  identify(userId: string): void {
    if (!this.initialized) {
      this.preInitUserId = userId;
      return;
    }
    setUserId(userId);
    this.log('User identified', userId);
  }

  /**
   * Forces an immediate flush of the event queue.
   */
  async flush(): Promise<void> {
    await this.flushQueue(false);
  }

  /**
   * Tears down listeners and stops the flush timer.
   */
  destroy(): void {
    this.flushQueue(true);

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.teardownAutoCapture) {
      this.teardownAutoCapture();
      this.teardownAutoCapture = null;
    }
    this.initialized = false;
    this.log('Destroyed');
  }

  // ─── internal helpers ─────────────────────────────────

  private trackRaw(
    eventType: string,
    eventSubtype: string | null,
    dims: Record<string, string>,
    metrics: Record<string, number>,
  ): void {
    const utm = getUtmParams();

    const payload: AnalyticsEventPayload = {
      language_iso_code: getLanguage(),
      user_id: getUserId(),
      anonymous_id: getAnonymousId(),
      session_id: getSessionId(this.config.sessionTimeoutMs ?? ENV.SESSION_TIMEOUT_MS),
      event_type: eventType,
      event_subtype: eventSubtype,
      custom_dimensions: {
        ...(this.config.globalDimensions ?? {}),
        ...dims,
        sdk_version: ENV.SDK_VERSION,
      },
      custom_metrics: metrics,
      page_url: buildPageUrl(),
      country_code: getCountryFromLanguage(),
      device_type: getDeviceType(),
      device_os: getDeviceOS(),
      utm_source: utm.utm_source ?? null,
    };

    if (utm.utm_medium) payload.custom_dimensions['utm_medium'] = utm.utm_medium;
    if (utm.utm_campaign) payload.custom_dimensions['utm_campaign'] = utm.utm_campaign;
    if (utm.utm_term) payload.custom_dimensions['utm_term'] = utm.utm_term;
    if (utm.utm_content) payload.custom_dimensions['utm_content'] = utm.utm_content;

    // Attach cached precise coords when the site opted in and the user
    // granted consent. Absent on the pre-consent window and for users who
    // denied — in those cases the server-side IP geo still provides a
    // country-level signal for the heatmap.
    if (this.config.captureLocation) {
      const geo = getCachedCoords();
      if (geo) {
        payload.latitude = geo.latitude;
        payload.longitude = geo.longitude;
        payload.location_accuracy = geo.accuracy;
      }
    }

    this.queue.push(payload);
    this.log('Queued', eventType, eventSubtype, `(${this.queue.length}/${this.config.batchSize})`);

    if (this.queue.length >= (this.config.batchSize ?? ENV.BATCH_SIZE)) {
      this.flushQueue(false);
    }
  }

  private startFlushTimer(): void {
    const interval = this.config.flushIntervalMs ?? ENV.FLUSH_INTERVAL_MS;
    this.flushTimer = setInterval(() => this.flushQueue(false), interval);
  }

  /**
   * Flushes the queue. Uses beacon for unload scenarios, fetch otherwise.
   */
  private async flushQueue(useBeacon: boolean): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length);

    if (useBeacon) {
      sendViaBeacon(this.transportCfg, batch);
      return;
    }

    const ok = await sendViaFetch(this.transportCfg, batch);
    if (!ok) {
      this.log('Flush failed — events dropped', batch.length);
    }
  }

  private log(...args: unknown[]): void {
    if (this.config?.debug && typeof console !== 'undefined') {
      console.log('[Infralytics]', ...args);
    }
  }
}
