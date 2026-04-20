import { ENV } from './envConfig';
import type { AnalyticsEventPayload } from './types';

export interface TransportConfig {
  serverUrl: string;
  tenantId: string;
  siteId: string;
  debug: boolean;
}

function buildUrl(cfg: TransportConfig): string {
  const base = cfg.serverUrl.replace(/\/+$/, '');
  const path = ENV.INGEST_PATH
    .replace(':tenant_id', encodeURIComponent(cfg.tenantId))
    .replace(':site_id', encodeURIComponent(cfg.siteId));
  return `${base}${path}`;
}

function log(debug: boolean, ...args: unknown[]): void {
  if (debug && typeof console !== 'undefined') {
    console.log('[Infralytics]', ...args);
  }
}

/**
 * Sends events via `fetch`. Returns true on success.
 */
export async function sendViaFetch(
  cfg: TransportConfig,
  events: AnalyticsEventPayload[],
  retries = ENV.MAX_RETRIES,
): Promise<boolean> {
  const url = buildUrl(cfg);
  const body = JSON.stringify(events.length === 1 ? events[0] : events);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });

      if (res.ok) {
        log(cfg.debug, `Flushed ${events.length} event(s) — HTTP ${res.status}`);
        return true;
      }

      log(cfg.debug, `Flush attempt ${attempt + 1} failed — HTTP ${res.status}`);
    } catch (err) {
      log(cfg.debug, `Flush attempt ${attempt + 1} error`, err);
    }
  }

  return false;
}

/**
 * Sends events via `navigator.sendBeacon` — fire-and-forget, best for page unload.
 * Returns true if the browser accepted the beacon.
 */
export function sendViaBeacon(
  cfg: TransportConfig,
  events: AnalyticsEventPayload[],
): boolean {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;

  const url = buildUrl(cfg);
  const body = JSON.stringify(events.length === 1 ? events[0] : events);
  const blob = new Blob([body], { type: 'application/json' });
  const ok = navigator.sendBeacon(url, blob);
  log(cfg.debug, `Beacon ${ok ? 'accepted' : 'rejected'} ${events.length} event(s)`);
  return ok;
}
