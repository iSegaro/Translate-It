// src/core/content-scripts/chunks/lazy-features.js
// Lazy-loaded features with on-demand loading

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import ExtensionContextManager from '@/core/extensionContext.js';
import { ExclusionChecker } from '@/features/exclusion/core/ExclusionChecker.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'LazyFeatures');

// Feature registry
const loadedFeatures = new Map();
const loadingPromises = new Map();

// Feature manager instance
let featureManager = null;
let featuresInitialized = false;

// Ensure global featureManager is available
window.featureManager = window.featureManager || null;

// Core features that must be available immediately
const CORE_FEATURES = new Set([
  'contentMessageHandler'
]);

/**
 * Notify that a feature has been deactivated to clear it from cache
 */
export function notifyFeatureDeactivated(featureName) {
  if (loadedFeatures.has(featureName)) {
    loadedFeatures.delete(featureName);
    logger.debug(`Removed feature from cache: ${featureName}`);
  }
  if (loadingPromises.has(featureName)) {
    loadingPromises.delete(featureName);
  }
}

/**
 * Returns a loaded feature instance if it exists
 */
export function getFeatureInstance(featureName) {
  if (loadedFeatures.has(featureName)) return loadedFeatures.get(featureName);
  if (featureManager) {
    const handler = featureManager.getFeatureHandler(featureName);
    if (handler) return handler;
  }
  return null;
}

/**
 * Load a feature lazily. Use force=true for utility features needed for Revert.
 */
export async function loadFeature(featureName, force = false) {
  // Check if already loaded
  if (loadedFeatures.has(featureName)) return loadedFeatures.get(featureName);

  // Check if currently loading
  if (loadingPromises.has(featureName)) return await loadingPromises.get(featureName);

  // Validate extension context
  if (!ExtensionContextManager.isValidSync()) {
    ExtensionContextManager.handleContextError('Extension context invalid before feature load', `LazyFeatures:${featureName}`);
    return null;
  }

  try {
    logger.debug(`Loading feature: ${featureName}${force ? ' (forced)' : ''}`);

    let loadingPromise;

    switch (featureName) {
      case 'textSelection': loadingPromise = loadTextSelectionFeature(); break;
      case 'windowsManager': loadingPromise = loadWindowsManagerFeature(force); break;
      case 'textFieldIcon': loadingPromise = loadTextFieldIconFeature(); break;
      case 'contentMessageHandler': loadingPromise = loadContentMessageHandlerFeature(); break;
      case 'selectElement': loadingPromise = loadSelectElementFeature(force); break;
      case 'shortcut': loadingPromise = loadShortcutFeature(force); break;
      case 'pageTranslation': loadingPromise = loadPageTranslationFeature(); break;
      default: throw new Error(`Unknown feature: ${featureName}`);
    }

    loadingPromises.set(featureName, loadingPromise);
    const featureInstance = await loadingPromise;

    if (featureInstance) {
      loadedFeatures.set(featureName, featureInstance);
      logger.debug(`Feature loaded and cached: ${featureName}`);
    } else {
      logger.debug(`Feature ${featureName} not cached (returned null)`);
    }
    
    loadingPromises.delete(featureName);
    return featureInstance;
  } catch (error) {
    logger.error(`Failed to load feature ${featureName}:`, error);
    loadingPromises.delete(featureName);
    throw error;
  }
}

async function loadShortcutFeature(force = false) {
  if (!featureManager) {
    const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
    featureManager = FeatureManager.getInstance();
    window.featureManager = featureManager;
  }
  
  // Use ExclusionChecker directly for robust validation
  const exclusionChecker = ExclusionChecker.getInstance();
  const isAllowed = force || await exclusionChecker.isFeatureAllowed('shortcut');

  if (isAllowed) {
    await featureManager.activateFeature('shortcut');
  } else {
    logger.debug('Shortcut is blocked by exclusion, skipping activation');
    return null;
  }
  return featureManager.getFeatureHandler('shortcut');
}

async function loadWindowsManagerFeature(force = false) {
  if (!featureManager) {
    const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
    featureManager = FeatureManager.getInstance();
  }

  const exclusionChecker = ExclusionChecker.getInstance();
  const isAllowed = force || await exclusionChecker.isFeatureAllowed('windowsManager');

  if (isAllowed) {
    await featureManager.activateFeature('windowsManager');
  } else {
    logger.debug('WindowsManager is blocked by exclusion, skipping activation');
    return null;
  }
  const handler = featureManager.getFeatureHandler('windowsManager');
  return handler ? handler.getWindowsManager() : null;
}

async function loadTextSelectionFeature() {
  if (!featureManager) {
    const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
    featureManager = FeatureManager.getInstance();
  }

  const exclusionChecker = ExclusionChecker.getInstance();
  if (await exclusionChecker.isFeatureAllowed('textSelection')) {
    await featureManager.activateFeature('textSelection');
  } else {
    logger.debug('TextSelection is blocked by exclusion, skipping activation');
    return null;
  }
  const handler = featureManager.getFeatureHandler('textSelection');
  return handler ? handler.selectionManager : null;
}

async function loadTextFieldIconFeature() {
  if (!featureManager) {
    const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
    featureManager = FeatureManager.getInstance();
  }

  const exclusionChecker = ExclusionChecker.getInstance();
  if (await exclusionChecker.isFeatureAllowed('textFieldIcon')) {
    await featureManager.activateFeature('textFieldIcon');
  } else {
    logger.debug('TextFieldIcon is blocked by exclusion, skipping activation');
    return null;
  }
  const handler = featureManager.getFeatureHandler('textFieldIcon');
  return handler ? handler.getManager() : null;
}

async function loadContentMessageHandlerFeature() {
  const { contentMessageHandler } = await import('@/handlers/content/ContentMessageHandler.js');
  await contentMessageHandler.activate();
  return contentMessageHandler;
}

async function loadSelectElementFeature(force = false) {
  if (!featureManager) {
    const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
    featureManager = FeatureManager.getInstance();
  }

  const exclusionChecker = ExclusionChecker.getInstance();
  const isAllowed = force || await exclusionChecker.isFeatureAllowed('selectElement');

  if (isAllowed) {
    await featureManager.activateFeature('selectElement');
  } else {
    logger.debug('SelectElement is blocked by exclusion, skipping activation');
    return null;
  }
  return featureManager.getFeatureHandler('selectElement');
}

async function loadPageTranslationFeature() {
  const { pageTranslationManager } = await import('@/features/page-translation/PageTranslationManager.js');
  
  const exclusionChecker = ExclusionChecker.getInstance();
  if (await exclusionChecker.isFeatureAllowed('pageTranslation')) {
    if (!pageTranslationManager.isActive) await pageTranslationManager.activate();
  } else {
    logger.debug('PageTranslation is blocked by exclusion, skipping activation');
    return null;
  }
  
  return pageTranslationManager;
}

export async function loadCoreFeatures() {
  try {
    const { default: SettingsManager } = await import('@/shared/managers/SettingsManager.js');
    await SettingsManager.initialize();
    await SettingsManager.warmup();
    const loadPromises = Array.from(CORE_FEATURES).map(feature => loadFeatureOnDemand(feature));
    await Promise.all(loadPromises);
    await initializeAndActivateFeatures();
  } catch (error) {
    logger.error('Error in loadCoreFeatures:', error);
  }
}

async function initializeAndActivateFeatures() {
  if (!featureManager) {
    const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
    featureManager = FeatureManager.getInstance();
    window.featureManager = featureManager;
  }
  if (!featuresInitialized) {
    const exclusionChecker = ExclusionChecker.getInstance();
    for (const featureName of CORE_FEATURES) {
      if (featureName === 'vue') continue;
      try {
        if (await exclusionChecker.isFeatureAllowed(featureName)) {
          await featureManager.activateFeature(featureName);
        }
      } catch { /* ignore */ }
    }
    featuresInitialized = true;
  }
}

export async function loadFeatureOnDemand(featureName) {
  const FEATURE_MAPPING = {
    textSelection: async () => await loadFeature('textSelection'),
    contentMessageHandler: async () => await loadFeature('contentMessageHandler'),
    windowsManager: async () => await loadFeature('windowsManager'),
    selectElement: async () => await loadFeature('selectElement'),
    pageTranslation: async () => await loadFeature('pageTranslation'),
    shortcut: async () => await loadFeature('shortcut'),
    textFieldIcon: async () => await loadFeature('textFieldIcon'),
    vue: async () => {
      if (window.translateItContentCore?.loadVueApp) {
        await window.translateItContentCore.loadVueApp();
        return window.translateItContentCore.vueLoaded;
      }
      return null;
    }
  };
  return FEATURE_MAPPING[featureName] ? await FEATURE_MAPPING[featureName]() : null;
}

export function getFeature(featureName) { return loadedFeatures.get(featureName); }
export function isFeatureLoaded(featureName) { return loadedFeatures.has(featureName); }
export function getFeatureManager() { return featureManager; }
export function areFeaturesLoaded() { return featuresInitialized; }

export async function activateFeature(featureName) {
  if (!featureManager) await initializeAndActivateFeatures();
  try { 
    const exclusionChecker = ExclusionChecker.getInstance();
    if (await exclusionChecker.isFeatureAllowed(featureName)) {
      await featureManager.activateFeature(featureName);
    }
  } catch { /* ignore */ }
}

export function cleanupFeatures() {
  if (featureManager) {
    featureManager.cleanup();
    featureManager = null;
    featuresInitialized = false;
    delete window.translateItFeatureManager;
  }
}

export default {
  loadFeature,
  getFeatureManager,
  areFeaturesLoaded,
  activateFeature,
  cleanupFeatures
};
