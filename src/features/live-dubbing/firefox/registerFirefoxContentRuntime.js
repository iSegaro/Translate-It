/**
 * Content-script registration for the Firefox Live Dubbing runtime host.
 *
 * Installs a narrowly-scoped runtime.onMessage listener that answers only
 * the closed Live Dubbing Firefox content vocabulary from the Background
 * service worker. All other traffic returns undefined so unrelated listeners
 * are unaffected. The host instance is per-document and host-owned — never
 * the production offscreen singleton — and navigation invalidates it.
 *
 * No site logic, no capture, no provider execution, no media handling, and
 * no page-world API (no window globals, DOM queries, or script bridging).
 */

import {
  FIREFOX_CONTENT_ACTIONS,
  FIREFOX_CONTENT_TARGET,
} from './firefoxContentContract.js';
import { FirefoxLiveDubbingContentHost } from './FirefoxContentRuntimeHost.js';

const supportedActions = new Set(FIREFOX_CONTENT_ACTIONS);

function resolveRuntime(browserAPI) {
  try {
    return browserAPI?.runtime
      || globalThis.browser?.runtime
      || globalThis.chrome?.runtime
      || null;
  } catch {
    return null;
  }
}

/**
 * Register the per-document Firefox Live Dubbing content host.
 * @param {{browserAPI?: object|null, host?: FirefoxLiveDubbingContentHost|null}} options
 * @returns {() => void} unregister function
 */
export function registerFirefoxLiveDubbingContentRuntime(options = {}) {
  const browserAPI = options.browserAPI
    || globalThis.browser
    || globalThis.chrome
    || null;
  const host = options.host || new FirefoxLiveDubbingContentHost({ browserAPI });
  const runtime = resolveRuntime(browserAPI);
  if (!runtime?.onMessage?.addListener) return () => {};

  const listener = (message, sender) => {
    if (!message || typeof message !== 'object') return undefined;
    if (message.target !== FIREFOX_CONTENT_TARGET) return undefined;
    if (!supportedActions.has(message.action)) return undefined;
    // The host resolves asynchronously (PREPARE awaits lazy feature
    // activation); a rejected settlement still fails closed and scalar.
    try {
      return Promise.resolve(host.handle(message, sender)).catch(() => ({
        success: false,
        error: 'LIVE_DUBBING_ACTION_UNSUPPORTED',
        sessionId: null,
        providerId: null,
      }));
    } catch {
      return Promise.resolve({
        success: false,
        error: 'LIVE_DUBBING_ACTION_UNSUPPORTED',
        sessionId: null,
        providerId: null,
      });
    }
  };

  runtime.onMessage.addListener(listener);

  // Navigation invalidates the old host: a stale document must never answer
  // for a session it no longer owns. Full navigations also discard this
  // compartment; this covers same-compartment teardown ordering.
  let pageHideListener = null;
  try {
    if (typeof globalThis.window?.addEventListener === 'function') {
      pageHideListener = () => host.invalidate('NAVIGATION');
      globalThis.window.addEventListener('pagehide', pageHideListener);
    }
  } catch {
    pageHideListener = null;
  }

  let unregistered = false;
  return () => {
    if (unregistered) return;
    unregistered = true;
    try {
      runtime.onMessage.removeListener?.(listener);
    } catch { /* best effort */ }
    try {
      if (pageHideListener) globalThis.window?.removeEventListener?.('pagehide', pageHideListener);
    } catch { /* best effort */ }
  };
}
