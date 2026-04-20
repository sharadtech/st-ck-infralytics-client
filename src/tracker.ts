import { ENV } from './envConfig';
import type { InfralyticsConfig, AnalyticsEventPayload } from './types';
import { getAnonymousId, getSessionId, getUserId, setUserId } from './identity';
import { getDeviceType, getLanguage, getCountryFromLanguage } from './device';
import { getUtmParams } from './utm';
import { sendViaFetch, sendViaBeacon, TransportConfig } from './transport';
import { installAutoCapture } from './autocapture';

export class InfralyticsTracker {
  private config!: InfralyticsConfig;
  private transportCfg!: TransportConfig;
  private queue: AnalyticsEventPayload[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private teardownAutoCapture: (() => void) | null = null;
  private initialized = false;

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

    this.config = {
      batchSize: ENV.BATCH_SIZE,
      flushIntervalMs: ENV.FLUSH_INTERVAL_MS,
      sessionTimeoutMs: ENV.SESSION_TIMEOUT_MS,
      debug: ENV.DEBUG,
      clickSelector: 'a, button, [data-il-track], input[type="submit"]',
      ...config,
    };

    this.transportCfg = {
      serverUrl: this.config.serverUrl,
      tenantId: this.config.tenantId,
      siteId: this.config.siteId,
      debug: this.config.debug ?? false,
    };

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
    this.log('Initialized', { tenantId: config.tenantId, siteId: config.siteId });
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
      console.warn('[Infralytics] track() called before init()');
      return;
    }
    this.trackRaw(eventType, eventSubtype ?? null, customDimensions ?? {}, customMetrics ?? {});
  }

  /**
   * Identifies the current user. Subsequent events will include this user_id.
   */
  identify(userId: string): void {
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
      page_url: window.location.href,
      country_code: getCountryFromLanguage(),
      device_type: getDeviceType(),
      utm_source: utm.utm_source ?? null,
    };

    if (utm.utm_medium) payload.custom_dimensions['utm_medium'] = utm.utm_medium;
    if (utm.utm_campaign) payload.custom_dimensions['utm_campaign'] = utm.utm_campaign;
    if (utm.utm_term) payload.custom_dimensions['utm_term'] = utm.utm_term;
    if (utm.utm_content) payload.custom_dimensions['utm_content'] = utm.utm_content;

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
