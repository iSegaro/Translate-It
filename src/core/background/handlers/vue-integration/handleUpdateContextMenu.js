// Handler for updating context menu from Vue apps
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleUpdateContextMenu');
const errorHandler = new ErrorHandler();

export async function handleUpdateContextMenu(message) {
  try {
    logger.info("Vue app requested context menu update - delegating to ContextMenuManager");

    // Import ContextMenuManager dynamically to avoid circular dependencies
    const { featureLoader } = await import('@/core/background/feature-loader.js');

    try {
      // Get the context menu manager from the feature loader
      const contextMenuManager = await featureLoader.loadContextMenuManager();

      if (contextMenuManager && contextMenuManager.isAvailable()) {
        logger.info("ContextMenuManager is available, refreshing context menus");
        // Refresh the context menus through the proper authority
        await contextMenuManager.setupDefaultMenus();

        return {
          success: true,
          data: {
            success: true,
            message: "Context menu refreshed through ContextMenuManager",
          },
        };
      } else {
        logger.warn("ContextMenuManager is not available, skipping menu update");
        return {
          success: false,
          data: {
            success: false,
            message: "ContextMenuManager not available",
          },
        };
      }
    } catch (managerError) {
      logger.error("Failed to use ContextMenuManager:", managerError);

      // Fallback: Do nothing rather than creating duplicate menus
      logger.warn("Skipping direct menu creation to prevent duplicate ID errors");

      return {
        success: false,
        data: {
          success: false,
          message: "Menu creation delegated to ContextMenuManager",
        },
      };
    }

  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.CONTEXT_MENU,
      context: "handleUpdateContextMenu",
      messageData: message.data,
    });
    throw error;
  }
}