// src/core/content-scripts/chunks/lazy-features.js
// Lazy-loaded features with on-demand loading

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import ExtensionContextManager from '@/core/extensionContext.js';

// Lazy logger initialization to avoid TDZ issues
let logger = null;
function getLogger() {
  if (!logger) {
    try {
      logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'LazyFeatures');
    } catch {
      // Fallback logger with proper formatting
      logger = {
        debug: (...args) => console.debug('[LazyFeatures]', ...args),
        warn: (...args) => console.warn('[LazyFeatures]', ...args),
        error: (...args) => console.error('[LazyFeatures]', ...args),
        info: (...args) => console.log('[LazyFeatures]', ...args),
        operation: (...args) => console.log('[LazyFeatures]', ...args)
      };
    }
  }
  return logger;
}

// Ensure ErrorHandler is loaded before any feature loading
let errorHandlerPromise = null;
async function getErrorHandler() {
  if (!errorHandlerPromise) {
    errorHandlerPromise = import('@/shared/error-management/ErrorHandler.js')
      .then(({ ErrorHandler }) => ErrorHandler.getInstance())
      .catch(error => {
        getLogger().warn('Failed to load ErrorHandler:', error);
        return null;
      });
  }
  return await errorHandlerPromise;
}

// Feature registry
const loadedFeatures = new Map();
const loadingPromises = new Map();

// Feature manager instance (for future use)
let featureManager = null;
let featuresInitialized = false;

// Ensure global featureManager is available for RevertShortcut and other components
// This must be done immediately when FeatureManager is created
window.featureManager = window.featureManager || null;

// Core features that should be available
const CORE_FEATURES = new Set([
  'contentMessageHandler',
  'selectElement',
  'textSelection',
  'windowsManager',
  'shortcut',
  'textFieldIcon'
]);

// On-demand features
const ON_DEMAND_FEATURES = new Set([
  // All features are now core features
]);

export async function loadFeature(featureName) {
  const logger = getLogger();

  // Check if already loaded
  if (loadedFeatures.has(featureName)) {
    return loadedFeatures.get(featureName);
  }

  // Check if currently loading
  if (loadingPromises.has(featureName)) {
    return await loadingPromises.get(featureName);
  }

  // Validate extension context
  if (!ExtensionContextManager.isValidSync()) {
    logger.warn('Extension context invalid, skipping feature load');
    return null;
  }

  try {
    logger.debug(`Loading feature: ${featureName}`);

    let loadingPromise;

    // Load specific feature
    switch (featureName) {
      case 'textSelection':
        loadingPromise = loadTextSelectionFeature();
        break;

      case 'windowsManager':
        loadingPromise = loadWindowsManagerFeature();
        break;

      case 'textFieldIcon':
        loadingPromise = loadTextFieldIconFeature();
        break;

      case 'contentMessageHandler':
        loadingPromise = loadContentMessageHandlerFeature();
        break;

      case 'selectElement':
        loadingPromise = loadSelectElementFeature();
        break;

      case 'shortcut':
        loadingPromise = loadShortcutFeature();
        break;

      default:
        throw new Error(`Unknown feature: ${featureName}`);
    }

    loadingPromises.set(featureName, loadingPromise);
    const featureInstance = await loadingPromise;

    loadedFeatures.set(featureName, featureInstance);
    loadingPromises.delete(featureName);

    logger.debug(`Feature loaded successfully: ${featureName}`);
    return featureInstance;

  } catch (error) {
    // Try to get ErrorHandler for proper error handling, but don't fail if it's not available
    try {
      const handler = await getErrorHandler();
      if (handler) {
        const processedError = handler.handle(error, {
          type: 'FEATURE',
          context: `loadFeature-${featureName}`
        });
        throw processedError;
      }
    } catch {
      // Fallback to simple error if ErrorHandler is not available
      logger.warn('ErrorHandler not available, using simple error handling');
    }

    logger.error(`Failed to load feature ${featureName}:`, error);
    loadingPromises.delete(featureName);
    throw error;
  }
}

async function loadTextSelectionFeature() {
  const logger = getLogger();
  try {
    // Use FeatureManager to load text selection to ensure proper integration
    if (!featureManager) {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      featureManager = FeatureManager.getInstance();
    }

    // Check if feature should be activated first
    const shouldActivate = await featureManager.shouldActivateFeature('textSelection');
    logger.info(`🔍 TextSelection should activate: ${shouldActivate}`);

    if (shouldActivate) {
      // Load and activate text selection through FeatureManager
      await featureManager.activateFeature('textSelection');
    } else {
      logger.info('❌ TextSelection is blocked by exclusion, skipping activation');
      return null;
    }

    // Get the handler and return the selection manager from it
    const handler = featureManager.getFeatureHandler('textSelection');
    return handler ? handler.selectionManager : null;
  } catch (error) {
    // Try to get ErrorHandler for proper error handling
    try {
      const handler = await getErrorHandler();
      if (handler) {
        throw handler.handle(error, {
          type: 'FEATURE',
          context: 'loadTextSelectionFeature'
        });
      }
    } catch {
      // Fallback
      logger.error('Failed to load text selection feature:', error);
    }
    throw error;
  }
}

async function loadWindowsManagerFeature() {
  const logger = getLogger();
  try {
    // Use FeatureManager to load WindowsManager to ensure proper integration
    if (!featureManager) {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      featureManager = FeatureManager.getInstance();
    }

    // Check if feature should be activated first
    const shouldActivate = await featureManager.shouldActivateFeature('windowsManager');
    logger.info(`🔍 WindowsManager should activate: ${shouldActivate}`);

    if (shouldActivate) {
      // Load and activate WindowsManager through FeatureManager
      await featureManager.activateFeature('windowsManager');
    } else {
      logger.info('❌ WindowsManager is blocked by exclusion, skipping activation');
      return null;
    }

    // Get the handler and return the WindowsManager from it
    const handler = featureManager.getFeatureHandler('windowsManager');
    return handler ? handler.getWindowsManager() : null;
  } catch (error) {
    // Try to get ErrorHandler for proper error handling
    try {
      const handler = await getErrorHandler();
      if (handler) {
        throw handler.handle(error, {
          type: 'FEATURE',
          context: 'loadWindowsManagerFeature'
        });
      }
    } catch {
      // Fallback
      logger.error('Failed to load windows manager feature:', error);
    }
    throw error;
  }
}

async function loadTextFieldIconFeature() {
  const logger = getLogger();
  try {
    // Use FeatureManager to load TextFieldIcon to ensure proper integration
    if (!featureManager) {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      featureManager = FeatureManager.getInstance();
    }

    // Check if feature should be activated first
    const shouldActivate = await featureManager.shouldActivateFeature('textFieldIcon');
    logger.info(`🔍 TextFieldIcon should activate: ${shouldActivate}`);

    if (shouldActivate) {
      // Load and activate TextFieldIcon through FeatureManager
      await featureManager.activateFeature('textFieldIcon');
    } else {
      logger.info('❌ TextFieldIcon is blocked by exclusion, skipping activation');
      return null;
    }

    // Return the TextFieldIconManager instance
    const handler = featureManager.getFeatureHandler('textFieldIcon');
    return handler ? handler.getManager() : null;
  } catch (error) {
    // Try to get ErrorHandler for proper error handling
    try {
      const handler = await getErrorHandler();
      if (handler) {
        throw handler.handle(error, {
          type: 'FEATURE',
          context: 'loadTextFieldIconFeature'
        });
      }
    } catch {
      // Fallback
      logger.error('Failed to load text field icon feature:', error);
    }
    throw error;
  }
}

async function loadContentMessageHandlerFeature() {
  const logger = getLogger();
  try {
    // ContentMessageHandler exports a proxy singleton, not the class itself
    const { contentMessageHandler } = await import('@/handlers/content/ContentMessageHandler.js');

    await contentMessageHandler.activate();
    return contentMessageHandler;
  } catch (error) {
    try {
      const handler = await getErrorHandler();
      if (handler) {
        throw handler.handle(error, {
          type: 'FEATURE',
          context: 'loadContentMessageHandlerFeature'
        });
      }
    } catch {
      logger.error('Failed to load ContentMessageHandler:', error);
    }
    throw error;
  }
}

async function loadSelectElementFeature() {
  const logger = getLogger();
  try {
    // Use FeatureManager to load SelectElementManager to ensure proper integration
    if (!featureManager) {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      featureManager = FeatureManager.getInstance();
    }

    // Check if feature should be activated first
    const shouldActivate = await featureManager.shouldActivateFeature('selectElement');
    logger.info(`🔍 SelectElement should activate: ${shouldActivate}`);

    if (shouldActivate) {
      // Load and activate SelectElementManager through FeatureManager
      await featureManager.activateFeature('selectElement');
    } else {
      logger.info('❌ SelectElement is blocked by exclusion, skipping activation');
      return null;
    }

    // Return the SelectElementManager instance
    const handler = featureManager.getFeatureHandler('selectElement');
    return handler;
  } catch (error) {
    try {
      const handler = await getErrorHandler();
      if (handler) {
        throw handler.handle(error, {
          type: 'FEATURE',
          context: 'loadSelectElementFeature'
        });
      }
    } catch {
      logger.error('Failed to load SelectElementManager:', error);
    }
    throw error;
  }
}

async function loadShortcutFeature() {
  const logger = getLogger();
  try {
    // Use FeatureManager to load ShortcutHandler to ensure proper integration
    if (!featureManager) {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      featureManager = FeatureManager.getInstance();
      // Also set globally for RevertShortcut
      window.featureManager = featureManager;
    }

    // Check if feature should be activated first
    const shouldActivate = await featureManager.shouldActivateFeature('shortcut');
    logger.info(`🔍 Shortcut should activate: ${shouldActivate}`);

    if (shouldActivate) {
      // Load and activate ShortcutHandler through FeatureManager
      await featureManager.activateFeature('shortcut');
    } else {
      logger.info('❌ Shortcut is blocked by exclusion, skipping activation');
      return null;
    }

    // Return the ShortcutHandler instance
    const handler = featureManager.getFeatureHandler('shortcut');
    return handler;
  } catch (error) {
    // Try to get ErrorHandler for proper error handling
    try {
      const handler = await getErrorHandler();
      if (handler) {
        throw handler.handle(error, {
          type: 'FEATURE',
          context: 'loadShortcutFeature'
        });
      }
    } catch {
      // Fallback
      logger.error('Failed to load shortcut feature:', error);
    }
    throw error;
  }
}

// Smart feature loading handlers
function handleTextSelection() {
  // Load text selection feature on demand when user selects text
  const logger = getLogger();
  logger.debug('Text selection detected, loading textSelection feature...');
  loadFeature('textSelection', 'ESSENTIAL');
}

function handleKeyboardInteraction(event) {
  // Load shortcut feature on demand when user presses relevant keys
  // Check for common shortcut combinations
  if (event.ctrlKey || event.metaKey || event.altKey) {
    const logger = getLogger();
    logger.debug('Shortcut key detected, loading shortcut feature...');
    loadFeature('shortcut', 'ON_DEMAND');
  }
}

// Load core features immediately
export async function loadCoreFeatures() {
  const logger = getLogger();
  logger.debug('Loading core features...');
  logger.debug('Starting loadCoreFeatures()');

  // Ensure global reference exists
  logger.debug('Current window.featureManager before loading:', window.featureManager);

  // Initialize SettingsManager before loading features to avoid "not initialized" warnings
  try {
    logger.debug('Initializing SettingsManager...');
    const { default: SettingsManager } = await import('@/shared/managers/SettingsManager.js');
    await SettingsManager.initialize();
    logger.debug('SettingsManager initialized successfully');
  } catch (error) {
    logger.warn('[FeatureManager] ⚠️ Failed to initialize SettingsManager:', error);
    // Don't fail feature loading if SettingsManager fails
  }

  try {
    // Try to get ErrorHandler for better error handling
    const handler = await getErrorHandler();

    const loadPromises = Array.from(CORE_FEATURES).map(feature =>
      loadFeature(feature).catch(error => {
        if (handler) {
          const handledError = handler.handle(error, {
            type: 'FEATURE',
            context: `loadCoreFeatures-${feature}`
          });
          logger.warn(`Failed to load core feature ${feature}:`, handledError);
        } else {
          logger.warn(`Failed to load core feature ${feature}:`, error);
        }
      })
    );

    await Promise.all(loadPromises);

    // Initialize and activate FeatureManager after features are loaded
    logger.debug('About to call initializeAndActivateFeatures()');
    await initializeAndActivateFeatures();
    logger.debug('initializeAndActivateFeatures() completed');
  } catch {
    // Fallback if ErrorHandler is not available
    logger.warn('ErrorHandler not available in loadCoreFeatures, using simple error handling');

    const loadPromises = Array.from(CORE_FEATURES).map(feature =>
      loadFeature(feature).catch(error => {
        logger.warn(`Failed to load core feature ${feature}:`, error);
      })
    );

    await Promise.all(loadPromises);

    // Initialize and activate FeatureManager after features are loaded
    logger.debug('About to call initializeAndActivateFeatures() (fallback path)');
    await initializeAndActivateFeatures();
    logger.debug('initializeAndActivateFeatures() completed (fallback path)');
  }
}

// Initialize FeatureManager and activate features
async function initializeAndActivateFeatures() {
  const logger = getLogger();
  logger.debug('initializeAndActivateFeatures called');
  try {
    // Initialize FeatureManager if not already initialized
    if (!featureManager) {
      logger.debug('Creating new FeatureManager instance');
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      featureManager = FeatureManager.getInstance();
      // Expose globally for RevertShortcut and other components
      window.featureManager = featureManager;
      logger.debug('FeatureManager initialized and set to window.featureManager');
    } else {
      logger.debug('FeatureManager already exists');
    }

    // Only activate features if not already initialized
    if (!featuresInitialized) {
      // Activate core features with exclusion check
      const activatedFeatures = [];
      const skippedFeatures = [];

      for (const featureName of CORE_FEATURES) {
        try {
          logger.info(`🔍 Checking if ${featureName} should activate in initializeAndActivateFeatures`);
          const shouldActivate = await featureManager.shouldActivateFeature(featureName);

          if (shouldActivate) {
            await featureManager.activateFeature(featureName);
            activatedFeatures.push(featureName);
            logger.info(`✅ Activated feature: ${featureName}`);
          } else {
            skippedFeatures.push(featureName);
            logger.info(`❌ Skipped feature: ${featureName} (blocked by exclusion)`);
          }
        } catch (error) {
          logger.warn(`Failed to activate feature ${featureName}:`, error);
        }
      }

      featuresInitialized = true;
      const totalFeatures = CORE_FEATURES.size;
      logger.operation(`Core features loaded: ${activatedFeatures.length}/${totalFeatures} [${activatedFeatures.join(', ')}]`);

      if (skippedFeatures.length > 0) {
        logger.warn(`Skipped features due to exclusion: [${skippedFeatures.join(', ')}]`);
      }
    } else {
      logger.debug('Features already initialized, skipping activation');
    }

    // Setup event listeners for smart feature loading
    logger.debug('Setting up smart feature loading listeners...');

    // Text selection interaction
    document.addEventListener('mouseup', handleTextSelection, { passive: true });

    // Right-click (context menu) - load select element feature on demand
    document.addEventListener('contextmenu', () => {
      logger.debug('Context menu detected, pre-loading selectElement feature...');
      loadFeature('selectElement', 'INTERACTIVE');
    }, { once: true });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardInteraction, { passive: true });

    logger.debug('Smart feature loading listeners setup complete');

  } catch (error) {
    logger.error('Failed to initialize and activate features:', error);
  }
}

// Feature mapping for smart loading
const FEATURE_MAPPING = {
  // Messaging infrastructure
  messaging: async () => {
    // Already initialized in ContentScriptCore
    return null;
  },

  // Extension context
  extensionContext: async () => {
    // Already initialized in ContentScriptCore
    return null;
  },

  // Core features
  textSelection: async () => await loadFeature('textSelection'),
  contentMessageHandler: async () => await loadFeature('contentMessageHandler'),

  // Interactive features
  windowsManager: async () => await loadFeature('windowsManager'),
  selectElement: async () => await loadFeature('selectElement'),

  // On-demand features
  shortcut: async () => await loadFeature('shortcut'),
  textFieldIcon: async () => await loadFeature('textFieldIcon'),
  vue: async () => {
    // Load Vue app through ContentScriptCore
    if (window.translateItContentCore && window.translateItContentCore.loadVueApp) {
      await window.translateItContentCore.loadVueApp();
      return window.translateItContentCore.vueLoaded;
    }
    return null;
  }
};

// Load features on demand with smart mapping
export async function loadFeatureOnDemand(featureName) {
  const logger = getLogger();

  // Check if feature exists in mapping
  if (!FEATURE_MAPPING[featureName]) {
    logger.warn(`Attempted to load unknown feature: ${featureName}`);
    return null;
  }

  try {
    return await FEATURE_MAPPING[featureName]();
  } catch (error) {
    logger.error(`Failed to load feature ${featureName}:`, error);
    return null;
  }
}

// Feature categories (should match index.js)
const FEATURE_CATEGORIES = {
  CRITICAL: ['messaging', 'extensionContext'],
  ESSENTIAL: ['textSelection', 'windowsManager', 'vue', 'contentMessageHandler'],
  INTERACTIVE: ['selectElement'],
  ON_DEMAND: ['shortcut', 'textFieldIcon']
};

// Load multiple features by category
export async function loadFeaturesByCategory(category) {
  const logger = getLogger();
  const features = FEATURE_CATEGORIES[category] || [];

  try {
    const loadPromises = features.map(feature =>
      loadFeatureOnDemand(feature).catch(error => {
        logger.warn(`Failed to load ${feature}:`, error);
        return null;
      })
    );

    return await Promise.all(loadPromises);
  } catch (error) {
    logger.error(`Failed to load ${category} features:`, error);
    return [];
  }
}

// Get loaded feature
export function getFeature(featureName) {
  return loadedFeatures.get(featureName);
}

// Check if feature is loaded
export function isFeatureLoaded(featureName) {
  return loadedFeatures.has(featureName);
}

// Legacy compatibility - load all features
export async function loadFeatures(contentCore) {
  const logger = getLogger();
  try {
    logger.debug('Loading all features (legacy mode)...');

    // Load core features first
    await loadCoreFeatures();

    // Load on-demand features
    const loadPromises = Array.from(ON_DEMAND_FEATURES).map(feature =>
      loadFeature(feature).catch(error => {
        logger.warn(`Failed to load feature ${feature}:`, error);
      })
    );

    await Promise.all(loadPromises);

    // Store reference globally
    window.translateItFeatures = Object.fromEntries(loadedFeatures);

    logger.info('All features loaded successfully', {
      loadedFeatures: Array.from(loadedFeatures.keys())
    });

    // Notify content core that features are ready
    if (contentCore) {
      contentCore.featuresLoaded = true;
      contentCore.dispatchEvent(new CustomEvent('features-loaded'));
    }

  } catch (error) {
    logger.error('Failed to load features:', error);
    throw error;
  }
}

// async function setupAdditionalSystems() {
  //   const logger = getLogger();
//   try {
//     // Load memory management if needed
//     if (isDevelopmentMode()) {
//       const { startMemoryMonitoring } = await import('@/core/memory/MemoryMonitor.js');
//       startMemoryMonitoring();
//     }

//     // Load notification system
//     await import('@/core/managers/core/NotificationManager.js');

//     // Load iframe support
//     const { IFrameSupportFactory } = await import('@/features/iframe-support/IFrameSupportFactory.js');
//     void IFrameSupportFactory.getIFrameManager();

//     logger.debug('Additional systems setup complete');

//   } catch (error) {
//     logger.warn('Failed to setup additional systems:', error);
//     // Non-critical, continue without these systems
//   }
// }


// Get feature manager instance
export function getFeatureManager() {
  return featureManager;
}

// Check if features are loaded
export function areFeaturesLoaded() {
  return featuresInitialized;
}

// Activate a specific feature on demand
export async function activateFeature(featureName) {
  const logger = getLogger();
  if (!featureManager) {
    await initializeAndActivateFeatures();
  }

  try {
    await featureManager.activateFeature(featureName);
    logger.debug(`Activated feature: ${featureName}`);
  } catch (error) {
    logger.error(`Failed to activate feature ${featureName}:`, error);
  }
}

// Deactivate a specific feature
export async function deactivateFeature(featureName) {
  const logger = getLogger();
  if (!featureManager) {
    return;
  }

  try {
    // This would need to be implemented in FeatureManager
    if (featureManager.deactivateFeature) {
      await featureManager.deactivateFeature(featureName);
      logger.debug(`Deactivated feature: ${featureName}`);
    }
  } catch (error) {
    logger.error(`Failed to deactivate feature ${featureName}:`, error);
  }
}

// Export cleanup function
export function cleanupFeatures() {
  const logger = getLogger();
  if (featureManager) {
    logger.debug('Cleaning up features...');

    try {
      featureManager.cleanup();
      featureManager = null;
      featuresInitialized = false;

      // Remove global reference
      delete window.translateItFeatureManager;

      logger.info('Features cleaned up successfully');
    } catch (error) {
      logger.error('Error cleaning up features:', error);
    }
  }
}

// Export for dynamic import
export default {
  loadFeatures,
  getFeatureManager,
  areFeaturesLoaded,
  activateFeature,
  deactivateFeature,
  cleanupFeatures
};