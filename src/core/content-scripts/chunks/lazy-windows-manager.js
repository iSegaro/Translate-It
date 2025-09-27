// src/core/content-scripts/chunks/lazy-windows-manager.js
// Lazy-loaded windows manager feature

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import ExtensionContextManager from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'LazyWindowsManager');

let windowsManager = null;
let windowsManagerInitialized = false;

export async function loadWindowsManager() {
  if (windowsManagerInitialized) {
    logger.debug('Windows manager already loaded');
    return windowsManager;
  }

  try {
    logger.init('Loading windows manager feature...');

    // Validate extension context
    if (!ExtensionContextManager.isValidSync()) {
      logger.warn('Extension context invalid, skipping windows manager load');
      return null;
    }

    // Note: WindowsManager is now created by WindowsManagerHandler through FeatureManager
    // This function is kept for backward compatibility but should not create its own instance

    // Get the WindowsManager from the WindowsManagerHandler if available
    let manager = null;
    try {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      const featureManager = FeatureManager.getInstance();
      const handler = featureManager.getFeatureHandler('windowsManager');
      manager = handler ? handler.getWindowsManager() : null;
    } catch (error) {
      logger.debug('WindowsManagerHandler not available, creating standalone WindowsManager');

      // Fallback: create standalone WindowsManager
      const { WindowsManager } = await import('@/features/windows/managers/WindowsManager.js');
      manager = new WindowsManager();
      await manager.initialize();
    }

    windowsManager = manager;
    windowsManagerInitialized = true;
    logger.info('Windows manager feature loaded successfully');

    return windowsManager;

  } catch (error) {
    logger.error('Failed to load windows manager feature:', error);
    throw error;
  }
}

export function getWindowsManager() {
  return windowsManager;
}

export function isWindowsManagerLoaded() {
  return windowsManagerInitialized;
}