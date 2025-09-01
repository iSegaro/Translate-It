// src/background/listeners/onContextMenuClicked.js
// Context menu click listener for cross-browser compatibility

import browser from "webextension-polyfill";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'contextMenuListener');

/**
 * Handle context menu clicks by delegating to the context menu manager
 */
async function handleContextMenuClick(info, tab) {
  try {
    // Get the context menu manager instance
    const backgroundService = globalThis.backgroundService;
    if (backgroundService && backgroundService.featureLoader) {
      const contextMenuManager = await backgroundService.featureLoader.loadContextMenuManager();
      await contextMenuManager.handleMenuClick(info, tab);
    } else {
      logger.error("Background service or feature loader not available for context menu handling");
    }
  } catch (error) {
    logger.error("Failed to handle context menu click:", error);
  }
}

// Register the context menu click listener
if (browser?.contextMenus?.onClicked) {
  browser.contextMenus.onClicked.addListener(handleContextMenuClick);
  logger.debug("📋 Context menu click listener registered");
} else {
  logger.warn("Context menus API not available");
}

export { handleContextMenuClick };
