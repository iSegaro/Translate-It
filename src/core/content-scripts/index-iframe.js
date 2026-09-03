// Lite Content script entry point - Iframe/Proxy only
// Ultra-minimal footprint for third-party or same-origin iframes.

// --- CRITICAL PRE-INITIALIZATION ---
if (!window.translateItContentCore) {
  window.translateItContentCore = { initialized: false, vueLoaded: false };
}
if (!window.translateItContentScriptCore) {
  window.translateItContentScriptCore = window.translateItContentCore;
}

(async () => {
  // 1. FAST FAIL: Never run in the top frame
  if (window === window.top) return;

  // 2. SMART FILTER: Ignore tiny iframes (ads, trackers, etc.)
  const MIN_FRAME_SIZE = 80;
  const isTinyFrame = window.innerWidth > 0 && window.innerHeight > 0 && 
                      (window.innerWidth < MIN_FRAME_SIZE || window.innerHeight < MIN_FRAME_SIZE);

  if (isTinyFrame) return;

  // 3. PREVENT RE-INJECTION
  if (window.translateItContentScriptLoaded) return;

  try {
    // 4. LAZY LOAD POLYFILL & UTILS
    // We only load these if the frame passed the size check
    const [
      { default: browser },
      { setupTrustedTypesCompatibility },
      { checkUrlExclusionAsync },
      { MessageActions },
    ] = await Promise.all([
      import('webextension-polyfill'),
      import('@/shared/vue/vue-utils.js'),
      import('@/features/exclusion/utils/exclusion-utils.js'),
      import('@/shared/messaging/core/MessageActions.js'),
    ]);

    window.browser = browser;
    setupTrustedTypesCompatibility();

    // 5. EXTENSION FRAME CHECK
    const isExtensionFrame = window.location.protocol.endsWith('-extension:') || 
                             window.location.href.startsWith(browser.runtime.getURL(''));
    if (isExtensionFrame) return;

    // 6. FAST FAIL (Exclusion)
    if (await checkUrlExclusionAsync()) return;

    // 7. Initialize Core (Lite version)
    const { IFrameContentScriptCore } = await import('./IFrameContentScriptCore.js');
    const contentScriptCore = new IFrameContentScriptCore();
    window.translateItContentCore = contentScriptCore;
    window.translateItContentScriptCore = contentScriptCore;
    
    const initialized = await contentScriptCore.initializeCritical();

    if (initialized) {
      // Inject Styles
      await contentScriptCore.injectMainDOMStyles();

      // Interaction Coordinator (Lazy)
      try {
        const { interactionCoordinator } = await import('./InteractionCoordinator.js');
        await interactionCoordinator.initialize();
      } catch { /* ignore */ }

      // Text selection window relay: single-owner upward routing for translation
      // windows (installed before any windows manager can be activated).
      try {
        const { getTextSelectionWindowRelay } = await import('@/features/windows/managers/crossframe/TextSelectionWindowRelay.js');
        getTextSelectionWindowRelay();
      } catch { /* ignore */ }

      // Load Lite Features
      const LITE_FEATURES = ['messaging', 'extensionContext', 'contentMessageHandler', 'mouseHover'];
      for (const feature of LITE_FEATURES) {
        await contentScriptCore.loadFeature(feature);
      }

      // 8. INITIALIZE MESSAGE LISTENERS (Modular)
      setupIFrameMessageListeners();

      // 9. NOTIFY BACKGROUND THAT FRAME IS READY FOR SELECT ELEMENT RECONCILIATION (F3)
      try {
        void browser.runtime.sendMessage({ action: MessageActions.SELECT_ELEMENT_FRAME_READY, data: {} }).catch(() => {});
      } catch { /* ignore */ }

      if (process.env.NODE_ENV === 'development') {
        console.log('[IFrame] Lite mode initialized', window.location.href);
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[IFrame] Init error:', error);
    }
  }
})();

/**
 * Encapsulated message listeners for subframes
 */
function setupIFrameMessageListeners() {
  // --- CROSS-FRAME CLICK SYNC (IFRAME) ---
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'translateit-activate-click-listeners') {
      const handleInternalClick = () => {
        try {
          window.top.postMessage({ 
            type: 'TRANSLATE_IT_IFRAME_CLICK_DETECTED', 
            source: 'translate-it-iframe' 
          }, '*');
        } catch { /* ignore */ }
        window.removeEventListener('click', handleInternalClick, { capture: true });
      };
      
      window.addEventListener('click', handleInternalClick, { 
        capture: true, once: true, passive: true 
      });
    }
  });

}
