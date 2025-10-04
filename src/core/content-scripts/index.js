// Content script entry point - Ultra-optimized with smart loading
// Minimal footprint with intelligent, interaction-based loading

// Early Trusted Types setup - must run BEFORE any Vue code
import { setupTrustedTypesCompatibility } from '@/shared/vue/vue-utils.js';
setupTrustedTypesCompatibility();

let contentScriptCore = null;
let featureLoadPromises = new Map();
let interactionDetected = false;

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
  ESSENTIAL: ['textSelection', 'windowsManager', 'vue', 'contentMessageHandler', 'selectElement'], // Core translation features
  INTERACTIVE: [], // UI interaction features
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

// Initialize the content script with ultra-minimal footprint
(async () => {
  try {
    // Initialize logger first
    const scriptLogger = await initializeLogger();

    // Create ContentScriptCore instance using static import (fixes Firefox class compilation)
    try {
      contentScriptCore = new ContentScriptCore();

      if (process.env.NODE_ENV === 'development') {
        scriptLogger.debug('ContentScriptCore instance created successfully');
      }
    } catch (error) {
      scriptLogger.error('Failed to create ContentScriptCore instance:', {
        error: error.message,
        stack: error.stack,
        userAgent: navigator.userAgent
      });
      throw new Error(`Failed to create ContentScriptCore: ${error.message}`);
    }

    // Verify that contentScriptCore was loaded correctly
    if (!contentScriptCore) {
      throw new Error('Failed to load ContentScriptCore: instance not found');
    }

    // Initialize ContentScriptCore
    let initialized = false;
    if (typeof contentScriptCore.initializeCritical === 'function') {
      initialized = await contentScriptCore.initializeCritical();
    } else if (typeof contentScriptCore.initialize === 'function') {
      initialized = await contentScriptCore.initialize();
    } else {
      throw new Error('ContentScriptCore instance missing initialization method');
    }

    // Expose globally for other modules (after potentially replacing instance)
    window.translateItContentCore = contentScriptCore;

    if (initialized) {
      // Setup smart event listeners
      setupSmartListeners();

      // Start intelligent loading sequence
      startIntelligentLoading();

      // Debug info
      if (process.env.NODE_ENV === 'development') {
        scriptLogger.info('Ultra-optimized content script initialized', {
          mode: 'smart-loading',
          critical: true,
          memory: 'minimal'
        });
      }
    }
  } catch (error) {
    // Use ErrorHandler for critical initialization errors
    if (ErrorHandler) {
      const errorHandler = ErrorHandler.getInstance();
      await errorHandler.handle(error, {
        context: 'content-script-index-initialization',
        isSilent: false,
        showToast: true
      });
    }

    // Try to get logger for proper error handling, fallback to console if not available
    const errorLogger = await initializeLogger();
    errorLogger.error('Failed to initialize content script', {
      error: error.message || error,
      stack: error.stack,
      url: window.location.href
    });
  }
})();

function setupSmartListeners() {
  // Extension popup interaction
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'popupOpened') {
      loadFeature('vue', 'INTERACTIVE');
    }
  });

  // Text selection interaction
  document.addEventListener('mouseup', handleTextSelection, { passive: true });


  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardInteraction);

  // Focus on text fields
  document.addEventListener('focusin', handleTextFieldFocus, { passive: true });

  // Scroll detection (for preload)
  let scrollTimer;
  document.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if (!interactionDetected) {
        preloadEssentialFeatures();
      }
    }, 1000);
  }, { passive: true });
}

function handleTextSelection() {
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) {
    loadFeature('textSelection', 'ESSENTIAL');
  }
}

function handleKeyboardInteraction(event) {
  // Ctrl+/ for translation
  if (event.ctrlKey && event.key === '/') {
    event.preventDefault();
    loadFeature('shortcut', 'INTERACTIVE');
    loadFeature('windowsManager', 'INTERACTIVE');
  }
}

function handleTextFieldFocus(event) {
  if (isEditableElement(event.target)) {
    loadFeature('textFieldIcon', 'INTERACTIVE');
  }
}

function isEditableElement(element) {
  return element && (
    element.isContentEditable ||
    element.tagName === 'TEXTAREA' ||
    (element.tagName === 'INPUT' &&
     ['text', 'search', 'email', 'url', 'tel'].includes(element.type))
  );
}

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

  // Phase 3: Preload remaining features if user is active
  setTimeout(() => {
    if (interactionDetected) {
      preloadRemainingFeatures();
    }
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

function preloadEssentialFeatures() {
  interactionDetected = true;
  FEATURE_CATEGORIES.ESSENTIAL.forEach(feature =>
    loadFeature(feature, 'ESSENTIAL')
  );
}

function preloadRemainingFeatures() {
  interactionDetected = true;
  [...FEATURE_CATEGORIES.INTERACTIVE, ...FEATURE_CATEGORIES.ON_DEMAND].forEach(feature =>
    loadFeature(feature, 'ON_DEMAND')
  );
}

// Export for debugging
window.translateItContentScriptCore = contentScriptCore;
window.translateItDebug = {
  loadFeature,
  featureLoadPromises,
  interactionDetected,
  FEATURE_CATEGORIES
};