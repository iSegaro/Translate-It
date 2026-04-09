// Main Content script entry point - Top Frame only
// Manages the complete Vue application, features, and UI.

// Early Trusted Types setup - must run BEFORE any Vue code
import browser from 'webextension-polyfill';
window.browser = browser;
import { setupTrustedTypesCompatibility } from '@/shared/vue/vue-utils.js';
setupTrustedTypesCompatibility();

// --- CRITICAL PRE-INITIALIZATION ---
// Create placeholder objects for core infrastructure to prevent messaging errors
// during the asynchronous boot process.
if (!window.translateItContentCore) {
  window.translateItContentCore = { initialized: false, vueLoaded: false };
}
if (!window.translateItContentScriptCore) {
  window.translateItContentScriptCore = window.translateItContentCore;
}

import { ContentScriptCore } from './ContentScriptCore.js';
import { checkUrlExclusionAsync } from '@/features/exclusion/utils/exclusion-utils.js';

// Import our modular components
import { MainFrameAggregator } from './main/MainFrameAggregator.js';
import { MainFrameCoordinator } from './main/MainFrameCoordinator.js';
import { MainFeatureLoader } from './main/MainFeatureLoader.js';

let contentScriptCore = null;

// Import logging utilities
let logger = null;
let getScopedLogger = null;
let LOG_COMPONENTS = null;

// Lazy load logging dependencies
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

  // 2. FAST FAIL: Check exclusion before ANYTHING else (zero side effects)
  if (await checkUrlExclusionAsync()) {
    return;
  }

  // 3. SELF-DETECTION: Never run content script inside our own UI frames
  const isExtensionFrame = window.location.protocol.endsWith('-extension:') || 
                           window.location.href.startsWith(browser.runtime.getURL('')) ||
                           document.documentElement.classList.contains('translate-it-ui-frame');
  
  if (isExtensionFrame) {
    return;
  }

  try {
    const scriptLogger = await initializeLogger();

    if (process.env.NODE_ENV === 'development') {
      scriptLogger.debug('Initializing main frame content script (Modular mode)');
    }

    // Create and initialize ContentScriptCore instance
    try {
      contentScriptCore = new ContentScriptCore();
      
      // Update global references with the real instance
      window.translateItContentCore = contentScriptCore;
      window.translateItContentScriptCore = contentScriptCore;
      
      const initialized = await contentScriptCore.initializeCritical();
      
      if (initialized) {
        // --- MODULAR ARCHITECTURE INITIALIZATION ---
        const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js');

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

        // Start the multi-stage loading sequence
        featureLoader.startIntelligentLoading();

        // 4. Register global handlers for popup sync in ContentMessageHandler
        // Note: This must run after contentMessageHandler feature is loaded (part of ESSENTIAL)
        featureLoader.loadFeature('contentMessageHandler', 'ESSENTIAL').then(() => {
          const messageHandler = contentScriptCore.getMessageHandler();
          if (messageHandler) {
            messageHandler.registerHandler(MessageActions.PAGE_TRANSLATE_GET_STATUS, async () => {
              return aggregator.getGlobalPageTranslationStatus();
            });
          }
        });

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

// Export for debugging
window.translateItContentScriptCore = contentScriptCore;
