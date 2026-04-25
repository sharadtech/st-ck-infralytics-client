/**
 * Detects the device form factor from the User-Agent string.
 * One of: 'mobile' | 'tablet' | 'desktop'.
 */
export function getDeviceType(): string {
  const ua = navigator.userAgent || '';
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Detects the operating-system family from the User-Agent string.
 *
 * Returns one of:
 *   'iOS' | 'Android' | 'Windows' | 'macOS' | 'Linux' | 'ChromeOS' | 'Other'
 *
 * Order matters — iPadOS still reports `Macintosh` in the UA but exposes
 * touch points, so we check that ahead of macOS.
 */
export function getDeviceOS(): string {
  const ua = navigator.userAgent || '';
  const platform = (navigator as unknown as { platform?: string }).platform || '';
  const maxTouch = (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints || 0;

  if (/iPhone|iPod/i.test(ua)) return 'iOS';
  // iPadOS 13+ reports as Mac with touch — disambiguate via maxTouchPoints.
  if (/iPad/i.test(ua) || (/Mac/.test(platform) && maxTouch > 1)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Other';
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
