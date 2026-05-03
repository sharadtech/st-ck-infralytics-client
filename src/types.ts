/**
 * Configuration object passed to `Infralytiqs.init()`.
 */
export interface InfralytiqsConfig {
  /** st-ck-server base URL, e.g. "https://api.example.com" */
  serverUrl: string;

  /** Tenant ID assigned in the Infralytiqs settings */
  tenantId: string;

  /** Site ID assigned in the Infralytiqs settings */
  siteId: string;

  /**
   * Optional ClickHouse database name for this tenant/site.
   *
   * The server authoritatively resolves the DB from the matched ClickHouse
   * module configuration (by tenantId + siteId), so the SDK does NOT need
   * to send this — but keeping it in config is useful for debugging and
   * allows the SDK to pass it as a custom dimension so events can be
   * filtered post-hoc by the intended destination DB.
   */
  dbName?: string;

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

  /** Known user ID — same as calling `Infralytiqs.identify(userId)` */
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

	/**
	 * Opt-in flag for precise browser geolocation.
	 *
	 * When `true`, `init()` will call `navigator.geolocation.getCurrentPosition`
	 * which triggers the browser's location-permission prompt. On grant, all
	 * subsequent events include `latitude` / `longitude` / `location_accuracy`
	 * in their payload and are plotted as precise points on the Reports
	 * heatmap. On deny or unavailable, the server-side IP-based country
	 * fallback still populates the map — so it is always safe to leave off.
	 *
	 * Coords are cached in `localStorage` for 7 days; denials are cached for
	 * 24 hours so we don't re-prompt on every page load.
	 *
	 * Default: `false`. Configured per-domain in the Domain admin UI and
	 * delivered to the SDK via `/system/client/config?domainKey=…`.
	 */
	captureLocation?: boolean;
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
	/**
	 * Operating-system family (iOS / Android / Windows / macOS / Linux /
	 * ChromeOS / Other). Captured separately from `device_type` (which is
	 * just form factor) so reports can break traffic down by OS.
	 */
	device_os: string;
	utm_source: string | null;
	/**
	 * Precise geolocation — only populated when the user has granted
	 * `navigator.geolocation` consent (see `InfralytiqsConfig.captureLocation`).
	 * Missing fields default to 0 server-side and are excluded from the
	 * precise-point heatmap (country centroids still apply via IP geo).
	 */
	latitude?: number;
	longitude?: number;
	location_accuracy?: number;
}
