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
      scriptLogger.debug('Initializing main frame content script (Full mode)');
    }

    // Create and initialize ContentScriptCore instance
    try {
      contentScriptCore = new ContentScriptCore();
      
      // Update global references with the real instance
      window.translateItContentCore = contentScriptCore;
      window.translateItContentScriptCore = contentScriptCore;
      
      const initialized = await contentScriptCore.initializeCritical();
      
      if (initialized) {
        // --- CROSS-FRAME COORDINATION ---
        const { MessageActions } = await import('@/shared/messaging/core/MessageActions.js');
        const frameProgressMap = new Map();
        
        /**
         * Updates a frame's progress data by merging it with existing data
         */
        const updateFrameData = (frameId, newData) => {
          const existing = frameProgressMap.get(frameId) || {};
          frameProgressMap.set(frameId, { ...existing, ...newData });
        };

        /**
         * Aggregates progress from all frames and emits a unified event
         */
        const emitAggregateProgress = (overrideAction = null, extraData = {}) => {
          let grandTotalTranslated = 0;
          let grandTotalCount = 0;
          let anyAutoTranslating = false;
          let anyActiveTranslating = false;
          
          for (const progress of frameProgressMap.values()) {
            grandTotalTranslated += progress.translatedCount || 0;
            grandTotalCount += progress.totalCount || 0;
            
            if (progress.isAutoTranslating) anyAutoTranslating = true;
            
            const isExplicitlyIdle = progress.status === 'idle' || progress.isTranslating === false;
            if (!isExplicitlyIdle && (progress.translatedCount < progress.totalCount || progress.totalCount === 0)) {
              anyActiveTranslating = true;
            }
          }
          
          if (window.pageEventBus) {
            const action = overrideAction || MessageActions.PAGE_TRANSLATE_PROGRESS;
            const payload = {
              translatedCount: grandTotalTranslated,
              totalCount: grandTotalCount,
              isAutoTranslating: anyAutoTranslating,
              isTranslating: anyActiveTranslating,
              status: anyActiveTranslating ? 'translating' : 'idle',
              isAggregated: true,
              ...extraData
            };

            if (action === MessageActions.PAGE_TRANSLATE_COMPLETE || 
                action === MessageActions.PAGE_AUTO_RESTORE_COMPLETE) {
              payload.isTranslated = grandTotalTranslated > 0;
              payload.url = window.location.href;
            }

            window.pageEventBus.emit(action, payload);
          }
        };

        /**
         * Broadcasts a deactivation signal to all iframes
         */
        const broadcastDeactivation = () => {
          const broadcastMessage = { type: 'DEACTIVATE_ALL_SELECT_MANAGERS', source: 'translate-it-main' };
          const iframes = document.querySelectorAll('iframe');
          iframes.forEach(iframe => {
            try {
              iframe.contentWindow.postMessage(broadcastMessage, '*');
            } catch (e) { /* ignore cross-origin */ }
          });
        };

        /**
         * Broadcasts a page translation related action to all iframes
         */
        const broadcastPageAction = (action, data = {}) => {
          if (action === MessageActions.PAGE_TRANSLATE || action === MessageActions.PAGE_RESTORE) {
            frameProgressMap.clear();
          }

          const broadcastMessage = { 
            type: 'TRANSLATE_IT_PAGE_ACTION', 
            source: 'translate-it-main',
            action,
            data
          };
          const iframes = document.querySelectorAll('iframe');
          iframes.forEach(iframe => {
            try {
              iframe.contentWindow.postMessage(broadcastMessage, '*');
            } catch (e) { /* ignore cross-origin */ }
          });
        };

        // 1. Listen for events from iframes
        window.addEventListener('message', (event) => {
          if (event.data?.source === 'translate-it-iframe') {
            const { type, data } = event.data;
            
            if (type === 'TRANSLATE_IT_PAGE_PROGRESS') {
              updateFrameData(event.source, data);
              emitAggregateProgress();
              return;
            }

            if (type === 'TRANSLATE_IT_PAGE_COMPLETE') {
              updateFrameData(event.source, { ...data, isTranslating: false, status: 'idle' });
              emitAggregateProgress(MessageActions.PAGE_TRANSLATE_COMPLETE, data);
              return;
            }

            if (type === 'TRANSLATE_IT_PAGE_STOPPED') {
              updateFrameData(event.source, { ...data, isTranslating: false, status: 'idle' });
              emitAggregateProgress(MessageActions.PAGE_AUTO_RESTORE_COMPLETE, data);
              return;
            }

            if (type && window.pageEventBus) {
              window.pageEventBus.emit(type, data);
            }
          }

          if (event.data?.type === 'translate-it-deactivate-select-element') {
            if (window.selectElementManagerInstance) {
              window.selectElementManagerInstance.deactivate({ fromIframe: true, reason: 'manual' }).catch(() => {});
            }
          }

          if (event.data?.type === 'TRANSLATE_IT_TEXT_SELECTION_DETECTED') {
            const { text } = event.data.data || {};
            if (text && contentScriptCore) {
              contentScriptCore.loadFeature('windowsManager').then(() => {
                if (process.env.NODE_ENV === 'development') {
                  console.log('[Main] Showing UI for selection in iframe');
                }
              });
            }
          }

          if (event.data?.type === 'TRANSLATE_IT_IFRAME_CLICK_DETECTED') {
            if (window.windowsManagerInstance) {
              window.windowsManagerInstance.dismiss();
            }
          }
        });

        // 2. Synchronize events via PageEventBus
        if (window.pageEventBus) {
          window.pageEventBus.on('select-mode-deactivated', () => {
            broadcastDeactivation();
          });

          window.pageEventBus.on(MessageActions.PAGE_TRANSLATE, (options) => {
            updateFrameData('main', { isAutoTranslating: true, isTranslating: true, status: 'translating' });
            broadcastPageAction(MessageActions.PAGE_TRANSLATE, options);
          });

          window.pageEventBus.on(MessageActions.PAGE_TRANSLATE_PROGRESS, (data) => {
            if (!data.isAggregated) {
              updateFrameData('main', data);
              emitAggregateProgress(null, data);
            }
          });

          window.pageEventBus.on(MessageActions.PAGE_TRANSLATE_COMPLETE, (data) => {
            if (!data.isAggregated) {
              updateFrameData('main', { ...data, isTranslating: false, status: 'idle' });
              emitAggregateProgress(MessageActions.PAGE_TRANSLATE_COMPLETE, data);
            }
          });

          window.pageEventBus.on(MessageActions.PAGE_AUTO_RESTORE_COMPLETE, (data) => {
            if (!data.isAggregated) {
              updateFrameData('main', { ...data, isTranslating: false, status: 'idle' });
              emitAggregateProgress(MessageActions.PAGE_AUTO_RESTORE_COMPLETE, data);
            }
          });

          window.pageEventBus.on(MessageActions.PAGE_RESTORE, () => {
            broadcastPageAction(MessageActions.PAGE_RESTORE);
          });

          window.pageEventBus.on(MessageActions.PAGE_TRANSLATE_STOP_AUTO, () => {
            broadcastPageAction(MessageActions.PAGE_TRANSLATE_STOP_AUTO);
          });
        }

        // --- IDENTITY & CORE LOAD ---
        await contentScriptCore.loadFeature('extensionContext');

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
      scriptLogger.error('Failed to initialize ContentScriptCore instance:', error);
    }
  } catch (error) {
    const errorLogger = await initializeLogger();
    errorLogger.error('Critical initialization error:', error);
  }
})();

async function startIntelligentLoading() {
  await Promise.all(
    FEATURE_CATEGORIES.CRITICAL.map(feature =>
      loadFeature(feature, 'CRITICAL')
    )
  );

  setTimeout(() => {
    Promise.all(
      FEATURE_CATEGORIES.ESSENTIAL.map(feature =>
        loadFeature(feature, 'ESSENTIAL')
      )
    );
  }, LOAD_STRATEGIES.ESSENTIAL.delay);

  setTimeout(() => {
    // Optional preload logic
  }, LOAD_STRATEGIES.ON_DEMAND.delay);
}

async function loadFeature(featureName, category) {
  if (featureLoadPromises.has(featureName)) {
    return featureLoadPromises.get(featureName);
  }

  const strategy = LOAD_STRATEGIES[category] || { delay: 0 };
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
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: `feature-loading-${featureName}`,
          isSilent: true,
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
