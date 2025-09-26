// src/core/content-scripts/legacy-handlers.js
// Fallback handlers for compatibility

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import ExtensionContextManager from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'LegacyHandlers');

export async function initializeLegacyHandlers(contentCore) {
  logger.warn('Initializing legacy handlers as fallback...');

  try {
    // Import legacy handlers
    const { getTranslationHandlerInstance } = await import("@/core/InstanceManager.js");
    const { contentMessageHandler } = await import("@/handlers/content/index.js");

    // Initialize core systems
    const translationHandler = getTranslationHandlerInstance();

    // Store instances globally
    window.translationHandlerInstance = translationHandler;
    window.contentMessageHandler = contentMessageHandler;

    // Get message handler from content core or create new one
    const messageHandler = contentCore?.getMessageHandler() ||
                          (await import('@/shared/messaging/core/MessageHandler.js')).createMessageHandler();

    // Register all ContentMessageHandler handlers
    if (contentMessageHandler.handlers) {
      for (const [action, handler] of contentMessageHandler.handlers.entries()) {
        messageHandler.registerHandler(action, async (message, sender) => {
          try {
            const result = await handler.call(contentMessageHandler, message, sender);
            return result;
          } catch (error) {
            logger.error(`Error in legacy content handler for ${action}:`, error);
            throw error;
          }
        });
      }
      logger.debug('Registered legacy content message handlers');
    }

    // Activate the message listener
    if (!messageHandler.isListenerActive) {
      messageHandler.listen();
      logger.debug('Legacy message handler activated');
    }

    logger.info('Legacy handlers initialized successfully');

  } catch (error) {
    if (ExtensionContextManager.isContextError(error)) {
      ExtensionContextManager.handleContextError(error, 'legacy-initialization');
    } else {
      logger.error('Legacy initialization failed:', error);
    }
  }
}