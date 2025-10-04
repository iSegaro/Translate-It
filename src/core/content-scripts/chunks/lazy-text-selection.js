// src/core/content-scripts/chunks/lazy-text-selection.js
// Lazy-loaded text selection feature

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import ExtensionContextManager from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT_SELECTION, 'LazyTextSelection');

let textSelectionManager = null;
let textSelectionInitialized = false;

export async function loadTextSelection() {
  if (textSelectionInitialized) {
    logger.debug('Text selection already loaded');
    return textSelectionManager;
  }

  try {
    logger.init('Loading text selection feature...');

    // Validate extension context
    if (!ExtensionContextManager.isValidSync()) {
      logger.warn('Extension context invalid, skipping text selection load');
      return null;
    }

    // Note: SelectionManager is now created by SimpleTextSelectionHandler through FeatureManager
    // This function is kept for backward compatibility but should not create its own instance

    // Load WindowsConfig for text selection functionality
    const { WindowsConfig } = await import('@/features/windows/managers/core/WindowsConfig.js');

    // Get the SelectionManager from the SimpleTextSelectionHandler if available
    let selectionManager = null;
    try {
      const { SimpleTextSelectionHandler } = await import('@/features/text-selection/handlers/SimpleTextSelectionHandler.js');
      const handler = SimpleTextSelectionHandler.getInstance();
      selectionManager = handler ? handler.selectionManager : null;
    } catch (error) {
      logger.debug('SimpleTextSelectionHandler not available, creating standalone SelectionManager');

      // Fallback: create standalone SelectionManager (without FeatureManager integration)
      const [{ default: SelectionManager }] = await import('@/features/text-selection/core/SelectionManager.js');
      selectionManager = new SelectionManager({
        // No featureManager in fallback mode
      });
    }

    textSelectionManager = selectionManager;
    textSelectionInitialized = true;
    logger.info('Text selection feature loaded successfully');

    return textSelectionManager;

  } catch (error) {
    logger.error('Failed to load text selection feature:', error);
    throw error;
  }
}

export function getTextSelectionManager() {
  return textSelectionManager;
}

export function isTextSelectionLoaded() {
  return textSelectionInitialized;
}