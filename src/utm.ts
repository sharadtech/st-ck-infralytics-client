const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export type UtmData = Partial<Record<(typeof UTM_PARAMS)[number], string>>;

/**
 * Extracts UTM parameters from the current URL's query string.
 * Results are cached in sessionStorage so they persist across SPA navigations.
 */
export function getUtmParams(): UtmData {
  const data: UtmData = {};
  const prefix = '_il_utm_';

  try {
    const params = new URLSearchParams(window.location.search);
    let hasNew = false;
    for (const key of UTM_PARAMS) {
      const val = params.get(key);
      if (val) {
        data[key] = val;
        sessionStorage.setItem(`${prefix}${key}`, val);
        hasNew = true;
      }
    }

    if (!hasNew) {
      for (const key of UTM_PARAMS) {
        const cached = sessionStorage.getItem(`${prefix}${key}`);
        if (cached) data[key] = cached;
      }
    }
  } catch { /* noop */ }

  return data;
}
