// Main Content script entry point - Top Frame only
// Manages the complete Vue application, features, and UI.

// --- CRITICAL PRE-INITIALIZATION ---
// Create placeholder objects for core infrastructure to prevent messaging errors
// during the asynchronous boot process.
if (!window.translateItContentCore) {
  window.translateItContentCore = { initialized: false, vueLoaded: false };
}
if (!window.translateItContentScriptCore) {
  window.translateItContentScriptCore = window.translateItContentCore;
}

// Global reference for the core instance
let contentScriptCore = null;

// Logging state
let logger = null;
let getScopedLogger = null;
let LOG_COMPONENTS = null;

/**
 * Lazy load logging dependencies to reduce initial bundle size.
 */
async function initializeLogger() {
  if (logger) return logger;
  try {
    const [{ getScopedLogger: scopedLogger }, { LOG_COMPONENTS: logComponents }] = await Promise.all([
      import('@/shared/logging/logger.js'),
      import('@/shared/logging/logConstants.js')
    ]);
    getScopedLogger = scopedLogger;
    LOG_COMPONENTS = logComponents;
    logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ContentScriptIndex');
    return logger;
  } catch {
    // Fallback logger if loading fails
    return {
      debug: () => {},
      info: (...args) => console.log('[ContentScriptIndex]', ...args),
      warn: (...args) => console.warn('[ContentScriptIndex]', ...args),
      error: (...args) => console.error('[ContentScriptIndex]', ...args)
    };
  }
}

// Initialize the content script with ultra-minimal footprint
(async () => {
  // 1. FAST FAIL: Only run in the top frame for this script
  if (window !== window.top) {
    return;
  }

  try {
    // 2. LAZY LOAD CORE UTILS & POLYFILL
    // We load these first to perform essential checks
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

    // 3. FAST FAIL: Check exclusion before heavy architecture loading
    if (await checkUrlExclusionAsync()) {
      return;
    }

    // 4. SELF-DETECTION: Never run content script inside our own UI frames
    const isExtensionFrame = window.location.protocol.endsWith('-extension:') || 
                             window.location.href.startsWith(browser.runtime.getURL('')) ||
                             document.documentElement.classList.contains('translate-it-ui-frame');
    
    if (isExtensionFrame) {
      return;
    }

    // 5. LOAD MODULAR ARCHITECTURE COMPONENTS
    // These are only loaded if the script is cleared for execution
    const [
      { ContentScriptCore },
      { MainFrameAggregator },
      { MainFrameCoordinator },
      { MainFeatureLoader },
      { MessageActions }
    ] = await Promise.all([
      import('./ContentScriptCore.js'),
      import('./main/MainFrameAggregator.js'),
      import('./main/MainFrameCoordinator.js'),
      import('./main/MainFeatureLoader.js'),
      import('@/shared/messaging/core/MessageActions.js')
    ]);

    const scriptLogger = await initializeLogger();

    if (process.env.NODE_ENV === 'development') {
      scriptLogger.debug('Initializing main frame content script (Modular mode)');
    }

    // 6. INITIALIZE CORE
    try {
      contentScriptCore = new ContentScriptCore();
      
      // Update global references with the real instance
      window.translateItContentCore = contentScriptCore;
      window.translateItContentScriptCore = contentScriptCore;
      
      const initialized = await contentScriptCore.initializeCritical();
      
      if (initialized) {
        // --- MODULAR ARCHITECTURE SETUP ---

        // 1. Aggregator: Handles stats and unified progress
        const aggregator = new MainFrameAggregator(MessageActions);
        window.getGlobalPageTranslationStatus = aggregator.getGlobalPageTranslationStatus;

        // 2. Feature Loader: Handles prioritised loading sequence
        const featureLoader = new MainFeatureLoader(contentScriptCore, initializeLogger);
        // Expose loadFeature for compatibility with InteractionCoordinator or other modules
        contentScriptCore.loadFeatureFromMain = featureLoader.loadFeature.bind(featureLoader);

        // 3. Coordinator: Handles cross-frame and bus synchronization
        new MainFrameCoordinator(aggregator, MessageActions, contentScriptCore);

        // --- IDENTITY & CORE BOOT ---
        await featureLoader.loadFeature('extensionContext', 'CRITICAL');

        try {
          const { interactionCoordinator } = await import('./InteractionCoordinator.js');
          await interactionCoordinator.initialize();
        } catch (coordError) {
          scriptLogger.error('Failed to initialize InteractionCoordinator:', coordError);
        }

        // Start the multi-stage loading sequence (Interaction-driven lazy loading)
        featureLoader.startIntelligentLoading();

        if (process.env.NODE_ENV === 'development') {
          scriptLogger.info('Main frame content script initialized (Modular mode)');
        }
      }
    } catch (error) {
      scriptLogger.error('Failed to initialize ContentScriptCore instance:', error);
    }
  } catch (error) {
    const errorLogger = await initializeLogger();
    errorLogger.error('Critical initialization error:', error);
  }
})();

// Export for debugging purposes
window.translateItContentScriptCore = contentScriptCore;
