// Content script entry point - Ultra-optimized with smart loading
// Minimal footprint with intelligent, interaction-based loading

// Early Trusted Types setup - must run BEFORE any Vue code
import browser from 'webextension-polyfill';
window.browser = browser;
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
  // 1. FAST FAIL: Check exclusion before ANYTHING else (zero side effects)
  // This includes checking if the extension is enabled globally
  if (await checkUrlExclusionAsync()) {
    return;
  }

  // 2. SELF-DETECTION: Never run content script inside our own UI frames
  const isExtensionFrame = window.location.href.startsWith('chrome-extension://') || 
                           window.location.href.startsWith('moz-extension://') ||
                           document.documentElement.classList.contains('translate-it-ui-frame');
  
  if (isExtensionFrame) {
    return;
  }

  try {
    // Initialize logger only if we're not excluded
    const scriptLogger = await initializeLogger();
    const isMainFrame = window === window.top;

    if (process.env.NODE_ENV === 'development') {
      scriptLogger.debug(`Initializing content script in ${isMainFrame ? 'Main Frame' : 'Iframe'} mode`);
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
      // Setup smart event listeners
      setupSmartListeners();

      // Start intelligent loading sequence based on frame type
      if (isMainFrame) {
        startIntelligentLoading();
      } else {
        startLiteIframeLoading();
      }

      if (process.env.NODE_ENV === 'development') {
        scriptLogger.info(`Content script initialized (${isMainFrame ? 'Full' : 'Lite'} mode)`);
      }
    }
  } catch (error) {
    const errorLogger = await initializeLogger();
    errorLogger.error('Critical initialization error:', error);
  }
})();

/**
 * Loading strategy for third-party iframes (Lite Mode)
 * Only loads features required for text selection and messaging
 */
async function startLiteIframeLoading() {
  const LITE_FEATURES = ['messaging', 'extensionContext', 'textSelection', 'contentMessageHandler'];
  
  for (const feature of LITE_FEATURES) {
    await loadFeature(feature, 'CRITICAL');
  }
}

function setupSmartListeners() {
  // Extension popup interaction
  // Use cross-browser compatible approach
  const browserAPI = typeof browser !== "undefined" ? browser : chrome;
  if (browserAPI?.runtime) {
    browserAPI.runtime.onMessage.addListener((message) => {
      if (message.action === 'popupOpened') {
        loadFeature('vue', 'INTERACTIVE');
      }
    });
  }

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

async function handleTextSelection() {
  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) {
    if (contentScriptCore) {
      // Import activation utility
      const { activateFeature } = await import('./chunks/lazy-features.js');
      
      // 1. Ensure detection logic is active
      await activateFeature('textSelection');
      
      // 2. CRITICAL: Ensure UI infrastructure (windowsManager) is active
      // This is required to actually show the icons/windows
      await activateFeature('windowsManager');
    }
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