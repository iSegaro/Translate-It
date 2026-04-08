// Main Content script entry point - Top Frame only
// Manages the complete Vue application, features, and UI.

// Early Trusted Types setup - must run BEFORE any Vue code
import browser from 'webextension-polyfill';
window.browser = browser;
import { setupTrustedTypesCompatibility } from '@/shared/vue/vue-utils.js';
setupTrustedTypesCompatibility();

let contentScriptCore = null;
let featureLoadPromises = new Map();

// Smart loading configuration
const LOAD_STRATEGIES = {
  CRITICAL: {
    delay: 0,          // Load immediately
    priority: 'high'
  },
  ESSENTIAL: {
    delay: 500,        // Load after 500ms
    priority: 'medium'
  },
  ON_DEMAND: {
    delay: 2000,       // Load after 2 seconds or on interaction
    priority: 'low'
  },
  INTERACTIVE: {
    delay: 0,          // Load on specific user interaction
    priority: 'medium'
  }
};

// Feature categorization
const FEATURE_CATEGORIES = {
  CRITICAL: ['messaging', 'extensionContext'], // Core infrastructure
  ESSENTIAL: ['textSelection', 'contentMessageHandler', 'vue'], // Immediate UI (FAB) & Detection
  INTERACTIVE: ['windowsManager', 'selectElement', 'pageTranslation'], // On-demand heavy UI
  ON_DEMAND: ['shortcut', 'textFieldIcon'] // Optional features
};

// Import logging utilities
let logger = null;
let getScopedLogger = null;
let LOG_COMPONENTS = null;
let ErrorHandler = null;

// Static import ContentScriptCore to fix Firefox class compilation issues
import { ContentScriptCore } from './ContentScriptCore.js';

// Lazy load logging and error handling dependencies
async function initializeLogger() {
  if (logger) return logger;

  try {
    const [{ getScopedLogger: scopedLogger }, { LOG_COMPONENTS: logComponents }, { ErrorHandler: errorHandler }] = await Promise.all([
      import('@/shared/logging/logger.js'),
      import('@/shared/logging/logConstants.js'),
      import('@/shared/error-management/ErrorHandler.js')
    ]);

    getScopedLogger = scopedLogger;
    LOG_COMPONENTS = logComponents;
    ErrorHandler = errorHandler;
    logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ContentScriptIndex');
    return logger;
  } catch {
    // Fallback logger - direct console calls will be filtered through logging system later
    return {
      debug: () => {},
      info: (...args) => console.log('[ContentScriptIndex]', ...args),
      warn: (...args) => console.warn('[ContentScriptIndex]', ...args),
      error: (...args) => console.error('[ContentScriptIndex]', ...args)
    };
  }
}

import { checkUrlExclusionAsync } from '@/features/exclusion/utils/exclusion-utils.js';

// Initialize the content script with ultra-minimal footprint
(async () => {
  // 1. FAST FAIL: Only run in the top frame for this script
  if (window !== window.top) {
    return;
  }

  // 2. FAST FAIL: Check exclusion before ANYTHING else (zero side effects)
  // This includes checking if the extension is enabled globally
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
    // Initialize logger only if we're not excluded
    const scriptLogger = await initializeLogger();

    if (process.env.NODE_ENV === 'development') {
      scriptLogger.debug('Initializing main frame content script (Full mode)');
    }

    // Create ContentScriptCore instance
    try {
      contentScriptCore = new ContentScriptCore();
    } catch (error) {
      scriptLogger.error('Failed to create ContentScriptCore instance:', error);
      return;
    }

    // Initialize ContentScriptCore
    const initialized = await contentScriptCore.initializeCritical();

    // Expose globally
    window.translateItContentCore = contentScriptCore;

    if (initialized) {
      // 1. Initialize Smart Interaction Coordinator
      // This manages mouseup, keydown, and other listeners based on settings/exclusion
      try {
        const { interactionCoordinator } = await import('./InteractionCoordinator.js');
        await interactionCoordinator.initialize();
      } catch (coordError) {
        scriptLogger.error('Failed to initialize InteractionCoordinator:', coordError);
      }

      // 2. Start intelligent loading sequence
      startIntelligentLoading();

      if (process.env.NODE_ENV === 'development') {
        scriptLogger.info('Main frame content script initialized (Full mode)');
      }
    }
  } catch (error) {
    const errorLogger = await initializeLogger();
    errorLogger.error('Critical initialization error:', error);
  }
})();

async function startIntelligentLoading() {
  // Phase 1: Load critical features immediately
  await Promise.all(
    FEATURE_CATEGORIES.CRITICAL.map(feature =>
      loadFeature(feature, 'CRITICAL')
    )
  );

  // Phase 2: Load essential features after short delay
  setTimeout(() => {
    Promise.all(
      FEATURE_CATEGORIES.ESSENTIAL.map(feature =>
        loadFeature(feature, 'ESSENTIAL')
      )
    );
  }, LOAD_STRATEGIES.ESSENTIAL.delay);

  // Phase 3: Delayed operations (mostly handled by InteractionCoordinator)
  setTimeout(() => {
    // Optional preload logic can be added here if needed
  }, LOAD_STRATEGIES.ON_DEMAND.delay);
}

async function loadFeature(featureName, category) {
  if (featureLoadPromises.has(featureName)) {
    return featureLoadPromises.get(featureName);
  }

  const strategy = LOAD_STRATEGIES[category];
  const loadPromise = (async () => {
    try {
      if (strategy.delay > 0 && category !== 'INTERACTIVE') {
        await new Promise(resolve => setTimeout(resolve, strategy.delay));
      }

      if (contentScriptCore && contentScriptCore.loadFeature) {
        await contentScriptCore.loadFeature(featureName);

        if (process.env.NODE_ENV === 'development') {
          const featureLogger = await initializeLogger();
          featureLogger.debug(`Loaded feature: ${featureName} (${category})`);
        }
      }
    } catch (error) {
      // Use ErrorHandler for feature loading errors
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: `feature-loading-${featureName}`,
          isSilent: true, // Feature loading failures should not interrupt user
          showToast: false
        });
      }

      const errorLogger = await initializeLogger();
      errorLogger.warn(`Failed to load feature ${featureName}`, {
        error: error.message || error,
        category,
        featureName,
        stack: error.stack
      });
    }
  })();

  featureLoadPromises.set(featureName, loadPromise);
  return loadPromise;
}

// Export for debugging
window.translateItContentScriptCore = contentScriptCore;
