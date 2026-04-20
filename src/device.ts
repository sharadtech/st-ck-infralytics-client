/**
 * Detects the device type from the User-Agent string.
 */
export function getDeviceType(): string {
  const ua = navigator.userAgent || '';
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Returns the browser language ISO code (e.g. "en-US", "fr").
 */
export function getLanguage(): string {
  return navigator.language || (navigator as any).userLanguage || '';
}

/**
 * Returns country code from the browser language tag if available.
 * This is a best-effort approximation; server-side GeoIP is more accurate.
 */
export function getCountryFromLanguage(): string {
  const lang = navigator.language || '';
  const parts = lang.split('-');
  return parts.length > 1 ? parts[1].toUpperCase() : '';
}
