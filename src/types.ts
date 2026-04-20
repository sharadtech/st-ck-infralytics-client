/**
 * Configuration object passed to `Infralytics.init()`.
 */
export interface InfralyticsConfig {
  /** st-ck-server base URL, e.g. "https://api.example.com" */
  serverUrl: string;

  /** Tenant ID assigned in the Infralytics settings */
  tenantId: string;

  /** Site ID assigned in the Infralytics settings */
  siteId: string;

  /**
   * Map of custom dimension keys to CSS selectors or extractor functions.
   * When an auto-captured click/form event matches, the SDK populates
   * `custom_dimensions[key]` with the resolved value.
   *
   * Example:
   *   evarMap: {
   *     'product_id':    '[data-product-id]',
   *     'button_label':  (el) => el.textContent?.trim() ?? '',
   *   }
   */
  evarMap?: Record<string, string | ((el: Element) => string)>;

  /**
   * Map of custom metric keys to extractor functions.
   * Populates `custom_metrics[key]` as a number.
   */
  propMap?: Record<string, (el: Element) => number>;

  /** Override batch size (default 20) */
  batchSize?: number;

  /** Override flush interval in ms (default 5000) */
  flushIntervalMs?: number;

  /** Override session timeout in ms (default 30 min) */
  sessionTimeoutMs?: number;

  /** Enable console debug logging */
  debug?: boolean;

  /** Known user ID — same as calling `Infralytics.identify(userId)` */
  userId?: string;

  /** Additional custom dimensions sent with every event */
  globalDimensions?: Record<string, string>;

  /** CSS selector for elements that should trigger click tracking. Default: 'a, button, [data-il-track]' */
  clickSelector?: string;

  /** Disable automatic page-view tracking */
  disableAutoPageView?: boolean;

  /** Disable automatic click tracking */
  disableAutoClick?: boolean;

  /** Disable automatic page-leave / unload tracking */
  disableAutoPageLeave?: boolean;
}

/**
 * Payload shape matching the st-ck-server AnalyticsEvent ingest contract.
 * `tenant_id` and `site_id` are injected from the URL by the server, but we
 * still send them in the body for transparency — the server ignores them.
 */
export interface AnalyticsEventPayload {
  language_iso_code: string;
  user_id: string;
  anonymous_id: string;
  session_id: string;
  event_type: string;
  event_subtype?: string | null;
  custom_dimensions: Record<string, string>;
  custom_metrics: Record<string, number>;
  page_url: string;
  country_code: string;
  device_type: string;
  utm_source: string | null;
}
