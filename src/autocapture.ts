import type { InfralyticsConfig } from './types';

export type EventCallback = (
  eventType: string,
  eventSubtype: string | null,
  dims: Record<string, string>,
  metrics: Record<string, number>,
) => void;

/**
 * Resolves evarMap values from an element.
 */
function resolveEvars(
  el: Element,
  evarMap: InfralyticsConfig['evarMap'],
): Record<string, string> {
  const dims: Record<string, string> = {};
  if (!evarMap) return dims;

  for (const [key, resolver] of Object.entries(evarMap)) {
    if (typeof resolver === 'function') {
      dims[key] = resolver(el);
    } else if (typeof resolver === 'string') {
      const target = el.closest(resolver) || el.querySelector(resolver);
      if (target) {
        dims[key] = target.getAttribute(`data-${key}`) || target.textContent?.trim() || '';
      }
    }
  }
  return dims;
}

/**
 * Resolves propMap numeric values from an element.
 */
function resolveProps(
  el: Element,
  propMap: InfralyticsConfig['propMap'],
): Record<string, number> {
  const metrics: Record<string, number> = {};
  if (!propMap) return metrics;

  for (const [key, fn] of Object.entries(propMap)) {
    metrics[key] = fn(el);
  }
  return metrics;
}

/**
 * Returns human-readable element descriptor for click tracking.
 */
function describeElement(el: Element): Record<string, string> {
  const dims: Record<string, string> = {};
  const tag = el.tagName?.toLowerCase() || '';
  dims['element_tag'] = tag;

  if (el.id) dims['element_id'] = el.id;
  const cls = el.className;
  if (typeof cls === 'string' && cls) dims['element_class'] = cls.split(/\s+/).slice(0, 3).join(' ');

  if (tag === 'a') {
    const href = (el as HTMLAnchorElement).href;
    if (href) dims['link_url'] = href;
    const text = el.textContent?.trim();
    if (text) dims['link_text'] = text.substring(0, 120);
  } else if (tag === 'button' || el.getAttribute('role') === 'button') {
    const text = el.textContent?.trim();
    if (text) dims['button_text'] = text.substring(0, 120);
  }

  const trackLabel = el.getAttribute('data-il-track');
  if (trackLabel) dims['track_label'] = trackLabel;

  return dims;
}

/**
 * Installs auto-capture listeners. Returns a teardown function.
 */
export function installAutoCapture(
  config: InfralyticsConfig,
  emit: EventCallback,
): () => void {
  const teardowns: Array<() => void> = [];

  if (!config.disableAutoPageView) {
    emit('page_view', null, { referrer: document.referrer || '' }, {});

    if (typeof window !== 'undefined' && 'navigation' in window) {
      // SPA: listen for History pushState / replaceState via popstate
    }
    const onPopState = () => {
      emit('page_view', 'spa_navigation', { referrer: document.referrer || '' }, {});
    };
    window.addEventListener('popstate', onPopState);
    teardowns.push(() => window.removeEventListener('popstate', onPopState));

    const origPushState = history.pushState.bind(history);
    history.pushState = function (...args) {
      origPushState(...args);
      emit('page_view', 'spa_navigation', { referrer: document.referrer || '' }, {});
    };
    teardowns.push(() => { history.pushState = origPushState; });
  }

  if (!config.disableAutoClick) {
    const selector = config.clickSelector || 'a, button, [data-il-track], input[type="submit"]';

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const matched = target.closest(selector);
      if (!matched) return;

      const dims = {
        ...describeElement(matched),
        ...resolveEvars(matched, config.evarMap),
      };
      const metrics = resolveProps(matched, config.propMap);

      emit('click', null, dims, metrics);
    };

    document.addEventListener('click', onClick, { capture: true, passive: true });
    teardowns.push(() => document.removeEventListener('click', onClick, true));
  }

  if (!config.disableAutoPageLeave) {
    let pageEnteredAt = Date.now();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const timeSpent = Math.round((Date.now() - pageEnteredAt) / 1000);
        emit('page_leave', null, {}, { time_on_page_sec: timeSpent });
      } else {
        pageEnteredAt = Date.now();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    teardowns.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));

    const onBeforeUnload = () => {
      const timeSpent = Math.round((Date.now() - pageEnteredAt) / 1000);
      emit('page_leave', 'unload', {}, { time_on_page_sec: timeSpent });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    teardowns.push(() => window.removeEventListener('beforeunload', onBeforeUnload));
  }

  return () => teardowns.forEach((fn) => fn());
}
