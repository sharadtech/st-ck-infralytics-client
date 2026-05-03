/**
 * Central environment configuration for the Infralytiqs tracker SDK.
 *
 * These defaults are compile-time constants. They are overridden at runtime
 * via the `Infralytiqs.init({ ... })` bootstrap call on each website.
 */

export const ENV = {
  /** Default analytics API base URL (st-ck-server). Override per-site. */
  ANALYTICS_API_BASE_URL: '',

  /** Ingest endpoint pattern. :tenant_id and :site_id are replaced at runtime. */
  INGEST_PATH: '/il/analytics/:tenant_id/:site_id/events',

  /** Max events to hold before auto-flushing the queue */
  BATCH_SIZE: 20,

  /** Interval (ms) between automatic queue flushes */
  FLUSH_INTERVAL_MS: 5_000,

  /** Session inactivity timeout (ms) — 30 minutes */
  SESSION_TIMEOUT_MS: 30 * 60 * 1000,

  /** LocalStorage key prefix for tracker state */
  STORAGE_PREFIX: '_il_',

  /** SDK version — injected into every event payload for debugging */
  SDK_VERSION: '1.0.0',

  /** Maximum retry attempts for failed flushes */
  MAX_RETRIES: 2,

  /** Enable debug logging to browser console (overridden by init config) */
  DEBUG: false,
} as const;
