/**
 * Infralytics Client SDK — Entry Point
 *
 * Usage:
 *
 * 1. Include the built script in the page <head>:
 *      <script src="https://cdn.example.com/infralytics.min.js"></script>
 *
 * 2. Bootstrap in the <body> with a <script> block:
 *      <script>
 *        Infralytics.init({
 *          serverUrl:  'https://api.example.com',
 *          tenantId:   'my-tenant',
 *          siteId:     'my-site',
 *          debug:      true,
 *          evarMap: {
 *            product_id: '[data-product-id]',
 *            button_label: function(el) { return el.textContent.trim(); }
 *          },
 *          propMap: {
 *            price: function(el) { return parseFloat(el.getAttribute('data-price') || '0'); }
 *          }
 *        });
 *      </script>
 *
 * 3. Track custom events anywhere:
 *      <script>
 *        Infralytics.track('search', { search_term: 'blue widget' });
 *        Infralytics.track('login',  { method: 'google' });
 *        Infralytics.identify('user-123');
 *      </script>
 */

import { InfralyticsTracker } from './tracker';
import type { InfralyticsConfig } from './types';

const tracker = new InfralyticsTracker();

const Infralytics = {
  /**
   * Initialize the tracker. Call once per page load.
   */
  init(config: InfralyticsConfig): void {
    tracker.init(config);
  },

  /**
   * Track a custom event.
   *
   * @param eventType        - e.g. 'login', 'search', 'purchase', 'share'
   * @param customDimensions - key/value string pairs (eVars)
   * @param customMetrics    - key/value numeric pairs (props)
   * @param eventSubtype     - optional subcategory
   */
  track(
    eventType: string,
    customDimensions?: Record<string, string>,
    customMetrics?: Record<string, number>,
    eventSubtype?: string,
  ): void {
    tracker.track(eventType, customDimensions, customMetrics, eventSubtype);
  },

  /**
   * Identify the current user (e.g. after login).
   * All subsequent events will carry this user_id.
   */
  identify(userId: string): void {
    tracker.identify(userId);
  },

  /**
   * Force-flush the event queue immediately.
   */
  flush(): Promise<void> {
    return tracker.flush();
  },

  /**
   * Tear down listeners and stop the flush timer.
   */
  destroy(): void {
    tracker.destroy();
  },
};

export default Infralytics;
