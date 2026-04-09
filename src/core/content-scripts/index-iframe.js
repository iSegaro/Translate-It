// Lite Content script entry point - Iframe/Proxy only
// Ultra-minimal footprint for third-party or same-origin iframes.

import browser from 'webextension-polyfill';
window.browser = browser;
import { setupTrustedTypesCompatibility } from '@/shared/vue/vue-utils.js';
setupTrustedTypesCompatibility();

// --- CRITICAL PRE-INITIALIZATION ---
if (!window.translateItContentCore) {
  window.translateItContentCore = { initialized: false, vueLoaded: false };
}
if (!window.translateItContentScriptCore) {
  window.translateItContentScriptCore = window.translateItContentCore;
}

(async () => {
  // 1. SELF-DETECTION: Never run in the top frame
  if (window === window.top) return;

  // 2. SMART FILTER: Ignore tiny iframes (ads, trackers, etc.)
  const MIN_FRAME_SIZE = 80;
  const isTinyFrame = window.innerWidth > 0 && window.innerHeight > 0 && 
                      (window.innerWidth < MIN_FRAME_SIZE || window.innerHeight < MIN_FRAME_SIZE);

  if (isTinyFrame) return;

  // 3. PREVENT RE-INJECTION
  const isExtensionFrame = window.location.protocol.endsWith('-extension:') || 
                           window.location.href.startsWith(browser.runtime.getURL(''));

  if (isExtensionFrame || window.translateItContentScriptLoaded) return;

  try {
    const { ContentScriptCore } = await import('./ContentScriptCore.js');
    const { checkUrlExclusionAsync } = await import('@/features/exclusion/utils/exclusion-utils.js');

    // 4. FAST FAIL
    if (await checkUrlExclusionAsync()) return;

    // 5. Initialize Core
    const contentScriptCore = new ContentScriptCore();
    window.translateItContentCore = contentScriptCore;
    window.translateItContentScriptCore = contentScriptCore;
    
    const initialized = await contentScriptCore.initializeCritical();

    if (initialized) {
      // 6. Inject Styles
      await contentScriptCore.injectMainDOMStyles();

      // 7. Interaction Coordinator
      try {
        const { interactionCoordinator } = await import('./InteractionCoordinator.js');
        await interactionCoordinator.initialize();
      } catch (e) {}

      // 8. Load Lite Features
      // contentMessageHandler will automatically register all needed handlers including SelectElement
      const LITE_FEATURES = ['messaging', 'extensionContext', 'textSelection', 'contentMessageHandler'];
      
      for (const feature of LITE_FEATURES) {
        await contentScriptCore.loadFeature(feature);
      }

      // --- PAGE TRANSLATION COORDINATOR (IFRAME) ---
      // Listen for page-level actions from the top frame
      window.addEventListener('message', async (event) => {
        if (event.data?.source === 'translate-it-main' && event.data?.type === 'TRANSLATE_IT_PAGE_ACTION') {
          const { action, data } = event.data;
          const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js');
          
          // Only load pageTranslation feature if we actually need to translate/restore
          const manager = await contentScriptCore.loadFeature('pageTranslation');
          
          if (manager) {
            switch (action) {
              case MessageActions.PAGE_TRANSLATE:
                if (process.env.NODE_ENV === 'development') {
                  console.log('[IFrame] Starting page translation', window.location.href);
                }
                
                // Set up one-time listener for progress reporting if not already set
                if (!window._translateItProgressForwarderSet) {
                  const bus = window.pageEventBus;
                  if (bus) {
                    bus.on(MessageActions.PAGE_TRANSLATE_PROGRESS, (data) => {
                      try {
                        window.top.postMessage({
                          type: 'TRANSLATE_IT_PAGE_PROGRESS',
                          source: 'translate-it-iframe',
                          frameUrl: window.location.href,
                          data: {
                            translatedCount: data.translatedCount || 0,
                            totalCount: data.totalCount || 0
                          }
                        }, '*');
                      } catch (e) { /* ignore cross-origin */ }
                    });
                    window._translateItProgressForwarderSet = true;
                  }
                }

                manager.translatePage(data || {}).catch(() => {});
                break;
              case MessageActions.PAGE_RESTORE:
                manager.restorePage().catch(() => {});
                break;
              case MessageActions.PAGE_TRANSLATE_STOP_AUTO:
                manager.stopAutoTranslation().catch(() => {});
                break;
            }
          }
        }
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('[IFrame] Lite mode content script initialized', window.location.href);
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[IFrame] Initialization error:', error);
    }
  }
})();
