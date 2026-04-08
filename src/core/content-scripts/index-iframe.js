// Lite Content script entry point - Iframe/Proxy only
// Ultra-minimal footprint for third-party or same-origin iframes.

import browser from 'webextension-polyfill';
window.browser = browser;
import { setupTrustedTypesCompatibility } from '@/shared/vue/vue-utils.js';
setupTrustedTypesCompatibility();

(async () => {
  // 1. SELF-DETECTION: Never run in the top frame (handled by index-main)
  if (window === window.top) {
    return;
  }

  // 2. SMART FILTER: Ignore tiny iframes (ads, trackers, etc.) to save resources
  // This is the most critical performance optimization for pages with many iframes.
  const MIN_FRAME_SIZE = 80;
  const isTinyFrame = window.innerWidth > 0 && window.innerHeight > 0 && 
                      (window.innerWidth < MIN_FRAME_SIZE || window.innerHeight < MIN_FRAME_SIZE);

  if (isTinyFrame) {
    // Silent exit for tiny frames like ads or trackers
    return;
  }

  // 3. PREVENT RE-INJECTION: Check if already loaded or if it's our own UI frame
  const isExtensionFrame = window.location.protocol.endsWith('-extension:') || 
                           window.location.href.startsWith(browser.runtime.getURL(''));

  if (isExtensionFrame || window.translateItContentScriptLoaded) {
    return;
  }

  try {
    // Dynamic imports for core logic to keep the initial parsing overhead low
    const { ContentScriptCore } = await import('./ContentScriptCore.js');
    const { checkUrlExclusionAsync } = await import('@/features/exclusion/utils/exclusion-utils.js');

    // 4. FAST FAIL: Check exclusion and extension status
    if (await checkUrlExclusionAsync()) {
      return;
    }

    // 5. Initialize Core in Lite Mode
    const contentScriptCore = new ContentScriptCore();
    const initialized = await contentScriptCore.initializeCritical();

    if (initialized) {
      // 6. Interaction Coordinator (Only for text selection detection)
      try {
        const { interactionCoordinator } = await import('./InteractionCoordinator.js');
        await interactionCoordinator.initialize();
      } catch (e) {
        // Non-critical error for iframe
      }

      // 7. Load Lite Features (Messaging & Text Selection)
      // We explicitly skip 'vue' and other heavy features in iframes.
      const LITE_FEATURES = ['messaging', 'extensionContext', 'textSelection', 'contentMessageHandler'];
      
      for (const feature of LITE_FEATURES) {
        await contentScriptCore.loadFeature(feature);
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('[IFrame] Lite mode content script initialized', window.location.href);
      }
    }
  } catch (error) {
    // Silent error for iframes to prevent console noise on third-party sites
  }
})();
