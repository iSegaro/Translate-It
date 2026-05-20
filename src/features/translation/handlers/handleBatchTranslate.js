import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'handleBatchTranslate');
const errorHandler = new ErrorHandler();

/**
 * Handles the 'BATCH_TRANSLATE' message action.
 * processes multiple translation items through the unified translation service.
 */
export async function handleBatchTranslate(message, sender) {
  logger.info(`[Handler:BATCH_TRANSLATE] 🔄 Starting batch of ${message.data?.items?.length || 0} items`);

  try {
    const backgroundService = globalThis.backgroundService;

    if (!backgroundService || !backgroundService.translationEngine) {
      throw new Error("Background service or translation engine not initialized.");
    }

    // Validate the incoming message format
    if (!MessageFormat.validate(message)) {
      throw new Error(`Invalid message format received: ${JSON.stringify(message)}`);
    }

    // Ensure it's a BATCH_TRANSLATE action
    if (message.action !== MessageActions.BATCH_TRANSLATE) {
      throw new Error(`Unexpected action: ${message.action}. Expected ${MessageActions.BATCH_TRANSLATE}`);
    }

    // Use UnifiedTranslationService for handling the request
    // UnifiedTranslationService's handleTranslationRequest is already designed to be generic
    const result = await unifiedTranslationService.handleTranslationRequest(message, sender);

    // Format error results if needed
    if (result && result.success === false && result.error) {
      return MessageFormat.createErrorResponse(
        result.error, 
        message.messageId, 
        { 
          ...result, 
          context: message.context || 'unknown' 
        }
      );
    }

    return result;

  } catch (error) {
    logger.error('[Handler:BATCH_TRANSLATE] Caught error:', error);

    if (error.type !== ErrorTypes.USER_CANCELLED) {
      errorHandler.handle(error, {
        type: ErrorTypes.TRANSLATION,
        context: "handleBatchTranslate",
        messageData: message
      });
    }

    return MessageFormat.createErrorResponse(
      error,
      message.messageId,
      { context: message.context || 'unknown' }
    );
  }
}
