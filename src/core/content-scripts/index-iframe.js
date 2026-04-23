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
      { checkUrlExclusionAsync }
    ] = await Promise.all([
      import('webextension-polyfill'),
      import('@/shared/vue/vue-utils.js'),
      import('@/features/exclusion/utils/exclusion-utils.js')
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

      // Load Lite Features
      const LITE_FEATURES = ['messaging', 'extensionContext', 'contentMessageHandler'];
      for (const feature of LITE_FEATURES) {
        await contentScriptCore.loadFeature(feature);
      }

      // 8. INITIALIZE MESSAGE LISTENERS (Modular)
      setupIFrameMessageListeners(contentScriptCore);

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
async function setupIFrameMessageListeners(contentScriptCore) {
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

  // --- PAGE TRANSLATION COORDINATOR (IFRAME) ---
  window.addEventListener('message', async (event) => {
    if (event.data?.source === 'translate-it-main' && event.data?.type === 'TRANSLATE_IT_PAGE_ACTION') {
      const { action, data } = event.data;
      const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js');
      
      const manager = await contentScriptCore.loadFeature('pageTranslation');
      if (!manager) return;

      switch (action) {
        case MessageActions.PAGE_TRANSLATE:
          if (!window._translateItProgressForwarderSet) {
            setupProgressForwarder(window.pageEventBus);
            window._translateItProgressForwarderSet = true;
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
  });
}

/**
 * Handles forwarding page translation progress to the top frame
 */
async function setupProgressForwarder(bus) {
  if (!bus) return;
  const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js');

  const forwardToTop = (type, data) => {
    try {
      window.top.postMessage({
        type,
        source: 'translate-it-iframe',
        frameUrl: window.location.href,
        data: {
          translatedCount: data.translatedCount || 0,
          totalCount: data.totalCount || 0,
          isTranslated: data.isTranslated,
          isAutoTranslating: data.isAutoTranslating,
          isTranslating: data.isTranslating,
          status: data.status
        }
      }, '*');
    } catch { /* ignore */ }
  };

  bus.on(MessageActions.PAGE_TRANSLATE_PROGRESS, (data) => forwardToTop('TRANSLATE_IT_PAGE_PROGRESS', data));
  bus.on(MessageActions.PAGE_TRANSLATE_COMPLETE, (data) => forwardToTop('TRANSLATE_IT_PAGE_COMPLETE', data));
  bus.on(MessageActions.PAGE_AUTO_RESTORE_COMPLETE, (data) => forwardToTop('TRANSLATE_IT_PAGE_STOPPED', data));
}
