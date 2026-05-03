/**
 * Infralytiqs Client SDK — Entry Point
 *
 * Usage:
 *
 * 1. Include the built script in the page <head>:
 *      <script src="https://cdn.example.com/infralytiqs.min.js"></script>
 *
 * 2. Bootstrap in the <body> with a <script> block:
 *      <script>
 *        Infralytiqs.init({
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
 *        Infralytiqs.track('search', { search_term: 'blue widget' });
 *        Infralytiqs.track('login',  { method: 'google' });
 *        Infralytiqs.identify('user-123');
 *      </script>
 */

import { InfralytiqsTracker } from './tracker';
import type { InfralytiqsConfig } from './types';

export { LICENSE_MODULE_ID } from './licenseModuleId';
export type { InfralytiqsConfig };

const tracker = new InfralytiqsTracker();

const Infralytiqs = {
  /**
   * Initialize the tracker. Call once per page load.
   */
  init(config: InfralytiqsConfig): void {
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

export default Infralytiqs;

