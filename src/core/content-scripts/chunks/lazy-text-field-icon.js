// src/core/content-scripts/chunks/lazy-text-field-icon.js
// Lazy-loaded text field icon feature

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import ExtensionContextManager from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'LazyTextFieldIcon');

let textFieldIconManager = null;
let textFieldIconInitialized = false;

export async function loadTextFieldIcon() {
  if (textFieldIconInitialized) {
    logger.debug('Text field icon already loaded');
    return textFieldIconManager;
  }

  try {
    logger.init('Loading text field icon feature...');

    // Validate extension context
    if (!ExtensionContextManager.isValidSync()) {
      logger.warn('Extension context invalid, skipping text field icon load');
      return null;
    }

    // Note: TextFieldIconManager is now created by TextFieldIconHandler through FeatureManager
    // This function is kept for backward compatibility but should not create its own instance

    // Get the TextFieldIconManager from the TextFieldIconHandler if available
    let manager = null;
    try {
      const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
      const featureManager = FeatureManager.getInstance();
      const handler = featureManager.getFeatureHandler('textFieldIcon');
      manager = handler ? handler.getManager() : null;
    } catch {
      logger.debug('TextFieldIconHandler not available, creating standalone TextFieldIconManager');

      // Fallback: create standalone TextFieldIconManager
      const { default: TextFieldIconManager } = await import('@/features/text-field-interaction/managers/TextFieldIconManager.js');
      manager = new TextFieldIconManager();
      await manager.initialize();
    }

    textFieldIconManager = manager;
    textFieldIconInitialized = true;
    logger.info('Text field icon feature loaded successfully');

    return textFieldIconManager;

  } catch (error) {
    logger.error('Failed to load text field icon feature:', error);
    throw error;
  }
}

export function getTextFieldIconManager() {
  return textFieldIconManager;
}

export function isTextFieldIconLoaded() {
  return textFieldIconInitialized;
}