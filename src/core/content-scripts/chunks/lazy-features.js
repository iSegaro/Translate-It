// src/core/content-scripts/chunks/lazy-features.js
// Lazy-loaded features with on-demand loading

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'LazyFeatures');

// Feature registry
const loadedFeatures = new Map();
const loadingPromises = new Map();

// Feature manager instance (for future use)
let featureManager = null;
let featuresInitialized = false;

// Ensure global featureManager is available for RevertShortcut and other components
// This must be done immediately when FeatureManager is created
window.featureManager = window.featureManager || null;

// Core features that should be available immediately for basic detection and FAB
const CORE_FEATURES = new Set([
  'contentMessageHandler',
  'textSelection',
  'vue' // Needed for FAB
]);

// On-demand features
const ON_DEMAND_FEATURES = new Set([
  'windowsManager',
  'selectElement',
  'shortcut',
  'textFieldIcon',
  'pageTranslation'
]);

export async function loadFeature(featureName) {
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
    ExtensionContextManager.handleContextError('Extension context invalid before feature load', `LazyFeatures:${featureName}`);
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

      case 'pageTranslation':
        loadingPromise = loadPageTranslationFeature();
        break;

      default:
        throw new Error(`Unknown feature: ${featureName}`);
    }

    loadingPromises.set(featureName, loadingPromise);
    const featureInstance = await loadingPromise;

    // Only cache if loading was successful and feature is not null
    if (featureInstance) {
      loadedFeatures.set(featureName, featureInstance);
      logger.debug(`Feature loaded and cached: ${featureName}`);
    } else {
      logger.debug(`Feature ${featureName} not cached (returned null)`);
    }
    
    loadingPromises.delete(featureName);
    return featureInstance;

  } catch (error) {
    // Use centralized ErrorHandler
    try {
      const handler = ErrorHandler.getInstance();
      const processedError = handler.handle(error, {
        type: 'FEATURE',
        context: `loadFeature-${featureName}`
      });
      throw processedError;
    } catch {
      logger.error(`Failed to load feature ${featureName}:`, error);
      loadingPromises.delete(featureName);
      throw error;
    }
  }
}

async function loadTextSelectionFeature() {
  try {
    // Use FeatureManager to load text selection to ensure proper integration
    if (!featureManager) {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      featureManager = FeatureManager.getInstance();
    }

    // Check if feature should be activated first
    const shouldActivate = await featureManager.shouldActivateFeature('textSelection');
    logger.debug(`TextSelection shouldActivate evaluation: ${shouldActivate}`);

    if (shouldActivate) {
      // Load and activate text selection through FeatureManager
      logger.debug('Activating textSelection feature via FeatureManager...');
      await featureManager.activateFeature('textSelection');
      logger.debug('textSelection feature activation command sent');
    } else {
      logger.debug('TextSelection is blocked by exclusion (via FeatureManager), skipping activation');
      return null;
    }

    // Get the handler and return the selection manager from it
    const handler = featureManager.getFeatureHandler('textSelection');
    return handler ? handler.selectionManager : null;
  } catch (error) {
    const handler = ErrorHandler.getInstance();
    throw handler.handle(error, {
      type: 'FEATURE',
      context: 'loadTextSelectionFeature'
    });
  }
}

async function loadWindowsManagerFeature() {
  try {
    // Use FeatureManager to load WindowsManager to ensure proper integration
    if (!featureManager) {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      featureManager = FeatureManager.getInstance();
    }

    // Check if feature should be activated first
    const shouldActivate = await featureManager.shouldActivateFeature('windowsManager');

    if (shouldActivate) {
      // Load and activate WindowsManager through FeatureManager
      await featureManager.activateFeature('windowsManager');
    } else {
      logger.debug('WindowsManager is blocked by exclusion, skipping activation');
      return null;
    }

    // Get the handler and return the WindowsManager from it
    const handler = featureManager.getFeatureHandler('windowsManager');
    return handler ? handler.getWindowsManager() : null;
  } catch (error) {
    const handler = ErrorHandler.getInstance();
    throw handler.handle(error, {
      type: 'FEATURE',
      context: 'loadWindowsManagerFeature'
    });
  }
}

async function loadTextFieldIconFeature() {
  try {
    // Use FeatureManager to load TextFieldIcon to ensure proper integration
    if (!featureManager) {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      featureManager = FeatureManager.getInstance();
    }

    // Check if feature should be activated first
    const shouldActivate = await featureManager.shouldActivateFeature('textFieldIcon');

    if (shouldActivate) {
      // Load and activate TextFieldIcon through FeatureManager
      await featureManager.activateFeature('textFieldIcon');
    } else {
      logger.debug('TextFieldIcon is blocked by exclusion, skipping activation');
      return null;
    }

    // Return the TextFieldIconManager instance
    const handler = featureManager.getFeatureHandler('textFieldIcon');
    return handler ? handler.getManager() : null;
  } catch (error) {
    const handler = ErrorHandler.getInstance();
    throw handler.handle(error, {
      type: 'FEATURE',
      context: 'loadTextFieldIconFeature'
    });
  }
}

async function loadContentMessageHandlerFeature() {
  try {
    // ContentMessageHandler exports a proxy singleton, not the class itself
    const { contentMessageHandler } = await import('@/handlers/content/ContentMessageHandler.js');

    await contentMessageHandler.activate();
    return contentMessageHandler;
  } catch (error) {
    const handler = ErrorHandler.getInstance();
    throw handler.handle(error, {
      type: 'FEATURE',
      context: 'loadContentMessageHandlerFeature'
    });
  }
}

async function loadSelectElementFeature() {
  try {
    // Use FeatureManager to load SelectElementManager to ensure proper integration
    if (!featureManager) {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      featureManager = FeatureManager.getInstance();
    }

    // Check if feature should be activated first
    const shouldActivate = await featureManager.shouldActivateFeature('selectElement');

    if (shouldActivate) {
      // Load and activate SelectElementManager through FeatureManager
      await featureManager.activateFeature('selectElement');
    } else {
      logger.debug('SelectElement is blocked by exclusion, skipping activation');
      return null;
    }

    // Return the SelectElementManager instance
    const handler = featureManager.getFeatureHandler('selectElement');
    return handler;
  } catch (error) {
    const handler = ErrorHandler.getInstance();
    throw handler.handle(error, {
      type: 'FEATURE',
      context: 'loadSelectElementFeature'
    });
  }
}

async function loadShortcutFeature() {
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

    if (shouldActivate) {
      // Load and activate ShortcutHandler through FeatureManager
      await featureManager.activateFeature('shortcut');
    } else {
      logger.debug('Shortcut is blocked by exclusion, skipping activation');
      return null;
    }

    // Return the ShortcutHandler instance
    const handler = featureManager.getFeatureHandler('shortcut');
    return handler;
  } catch (error) {
    const handler = ErrorHandler.getInstance();
    throw handler.handle(error, {
      type: 'FEATURE',
      context: 'loadShortcutFeature'
    });
  }
}

async function loadPageTranslationFeature() {
  try {
    // Import PageTranslationManager
    const { pageTranslationManager } = await import('@/features/page-translation/PageTranslationManager.js');

    // Activate if not already active
    if (!pageTranslationManager.isActive) {
      await pageTranslationManager.activate();
    }

    logger.info('PageTranslationManager loaded and initialized');
    return pageTranslationManager;
  } catch (error) {
    const handler = ErrorHandler.getInstance();
    throw handler.handle(error, {
      type: 'FEATURE',
      context: 'loadPageTranslationFeature'
    });
  }
}

// Smart feature loading handlers
function handleTextSelection() {
  // Load text selection feature on demand when user selects text
  logger.debug('Text selection detected, loading textSelection feature...');
  loadFeature('textSelection', 'ESSENTIAL');
}

function handleKeyboardInteraction(event) {
  // Load shortcut feature on demand when user presses relevant keys
  // Check for common shortcut combinations
  if (event.ctrlKey || event.metaKey || event.altKey) {
    logger.debug('Shortcut key detected, loading shortcut feature...');
    loadFeature('shortcut', 'ON_DEMAND');
  }
}

// Load core features immediately
export async function loadCoreFeatures() {
  logger.debug('Loading core features...');
  logger.debug('Starting loadCoreFeatures()');

  // Ensure global reference exists
  logger.debug('Current window.featureManager before loading:', window.featureManager);

  // Initialize SettingsManager before loading features to avoid "not initialized" warnings
  try {
    logger.debug('Initializing SettingsManager...');
    const { default: SettingsManager } = await import('@/shared/managers/SettingsManager.js');
    await SettingsManager.initialize();
    await SettingsManager.warmup(); // Warm up cache for all features
    logger.debug('SettingsManager initialized and warmed up successfully');
  } catch (error) {
    logger.warn('[FeatureManager] ⚠️ Failed to initialize SettingsManager:', error);
    // Don't fail feature loading if SettingsManager fails
  }

  try {
    const handler = ErrorHandler.getInstance();

    const loadPromises = Array.from(CORE_FEATURES).map(feature =>
      loadFeatureOnDemand(feature).catch(error => {
        const handledError = handler.handle(error, {
          type: 'FEATURE',
          context: `loadCoreFeatures-${feature}`
        });
        logger.warn(`Failed to load core feature ${feature}:`, handledError);
      })
    );

    await Promise.all(loadPromises);

    // Initialize and activate FeatureManager after features are loaded
    logger.debug('About to call initializeAndActivateFeatures()');
    await initializeAndActivateFeatures();
    logger.debug('initializeAndActivateFeatures() completed');
  } catch (error) {
    logger.error('Error in loadCoreFeatures:', error);

    const loadPromises = Array.from(CORE_FEATURES).map(feature =>
      loadFeature(feature).catch(error => {
        logger.warn(`Failed to load core feature ${feature}:`, error);
      })
    );

    await Promise.all(loadPromises);

    // Initialize and activate FeatureManager after features are loaded
    await initializeAndActivateFeatures();
  }
}

// Initialize FeatureManager and activate features
async function initializeAndActivateFeatures() {
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
        if (featureName === 'vue') {
          activatedFeatures.push('vue'); // Already handled by loadVueApp
          continue;
        }
        
        try {
          const shouldActivate = await featureManager.shouldActivateFeature(featureName);

          if (shouldActivate) {
            await featureManager.activateFeature(featureName);
            activatedFeatures.push(featureName);
          } else {
            skippedFeatures.push(featureName);
          }
        } catch (error) {
          logger.warn(`Failed to activate feature ${featureName}:`, error);
        }
      }

      featuresInitialized = true;
      const totalFeatures = CORE_FEATURES.size;
      logger.operation(`Core features loaded: ${activatedFeatures.length}/${totalFeatures} [${activatedFeatures.join(', ')}]`);

      if (skippedFeatures.length > 0) {
        logger.debug(`Skipped features due to exclusion: [${skippedFeatures.join(', ')}]`);
      }
    } else {
      logger.debug('Features already initialized, skipping activation');
    }

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
  pageTranslation: async () => await loadFeature('pageTranslation'),

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

// Feature categories (synchronized with index.js for smart loading)
const FEATURE_CATEGORIES = {
  CRITICAL: ['messaging', 'extensionContext'],
  ESSENTIAL: ['textSelection', 'contentMessageHandler', 'vue'], // Immediate UI (FAB) & Detection
  INTERACTIVE: ['windowsManager', 'selectElement', 'pageTranslation'], // On-demand heavy UI
  ON_DEMAND: ['shortcut', 'textFieldIcon'] // Optional features
};

// Load multiple features by category
export async function loadFeaturesByCategory(category) {
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
