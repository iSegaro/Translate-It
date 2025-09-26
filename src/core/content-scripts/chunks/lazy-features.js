// src/core/content-scripts/chunks/lazy-features.js
// Lazy-loaded FeatureManager and all features

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import ExtensionContextManager from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'LazyFeatures');

let featureManager = null;
let featuresInitialized = false;

export async function loadFeatures(contentCore) {
  if (featuresInitialized) {
    logger.debug('Features already loaded');
    return;
  }

  try {
    logger.init('Loading features lazily...');

    // Validate extension context
    if (!ExtensionContextManager.isValidSync()) {
      logger.warn('Extension context invalid, skipping features load');
      return;
    }

    // Load FeatureManager dynamically
    const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
    featureManager = FeatureManager.getInstance();

    // Initialize features
    await featureManager.initialize();

    featuresInitialized = true;

    // Store reference globally
    window.translateItFeatureManager = featureManager;

    logger.info('Features loaded successfully', {
      activeFeatures: Array.from(featureManager.activeFeatures)
    });

    // Notify content core that features are ready
    if (contentCore) {
      contentCore.featuresLoaded = true;
      contentCore.dispatchEvent(new CustomEvent('features-loaded'));
    }

    // Setup additional systems that depend on features
    await setupAdditionalSystems();

  } catch (error) {
    logger.error('Failed to load features:', error);
    throw error;
  }
}

async function setupAdditionalSystems() {
  try {
    // Load memory management if needed
    if (isDevelopmentMode()) {
      const { startMemoryMonitoring } = await import('@/core/memory/MemoryMonitor.js');
      startMemoryMonitoring();
    }

    // Load notification system
    const { default: NotificationManager } = await import('@/core/managers/core/NotificationManager.js');
    // Initialize if needed

    // Load iframe support
    const { IFrameSupportFactory } = await import('@/features/iframe-support/IFrameSupportFactory.js');
    const iFrameCore = await IFrameSupportFactory.getIFrameManager();
    // Store reference if needed

    logger.debug('Additional systems setup complete');

  } catch (error) {
    logger.warn('Failed to setup additional systems:', error);
    // Non-critical, continue without these systems
  }
}

function isDevelopmentMode() {
  try {
    return process.env.NODE_ENV === 'development';
  } catch {
    return false;
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
    await loadFeatures();
  }

  try {
    // This would need to be implemented in FeatureManager
    if (featureManager.activateFeature) {
      await featureManager.activateFeature(featureName);
      logger.debug(`Activated feature: ${featureName}`);
    }
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