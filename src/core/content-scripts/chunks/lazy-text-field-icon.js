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

    // Load TextFieldIconManager
    const { default: TextFieldIconManager } = await import('@/features/text-field-interaction/managers/TextFieldIconManager.js');

    // Initialize text field icon manager
    textFieldIconManager = new TextFieldIconManager();
    await textFieldIconManager.initialize();

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