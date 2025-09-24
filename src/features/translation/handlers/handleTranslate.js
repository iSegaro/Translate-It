import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'handleTranslate');
const errorHandler = new ErrorHandler();

/**
 * Handles the 'TRANSLATE' message action.
 * This processes translation requests through the background translation engine.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - Promise that resolves with the response object.
 */
export async function handleTranslate(message, sender) {
  // Note: For UnifiedMessaging, we need to return the actual result, not just ACK
  // ACK is only needed for port-based messaging

  logger.info(`[Handler:TRANSLATE] 🔄 Starting: "${message.data?.text?.slice(0, 30)}..." → ${message.data?.provider} → ${message.data?.targetLanguage}`);

  try {
    const backgroundService = globalThis.backgroundService;

    if (!backgroundService || !backgroundService.translationEngine) {
      throw new Error("Background service or translation engine not initialized.");
    }

    // Validate the incoming message format using MessagingStandards
    if (!MessageFormat.validate(message)) {
      throw new Error(`Invalid message format received: ${JSON.stringify(message)}`);
    }

    // Ensure it's a TRANSLATE action
    if (message.action !== MessageActions.TRANSLATE) {
      throw new Error(`Unexpected action: ${message.action}. Expected ${MessageActions.TRANSLATE}`);
    }

    // Use UnifiedTranslationService for handling the request
    const result = await unifiedTranslationService.handleTranslationRequest(message, sender);

    logger.debug('[Handler:TRANSLATE] UnifiedService result:', result);
    return result;

  } catch (translationError) {
    logger.debug('[Handler:TRANSLATE] Caught error from translation engine:', translationError.message);

    // Don't show error notification for user cancellations
    if (translationError.type !== ErrorTypes.USER_CANCELLED) {
      errorHandler.handle(translationError, {
        type: ErrorTypes.TRANSLATION,
        context: "handleTranslate",
        messageData: message
      });
    }

    const errorResponse = MessageFormat.createErrorResponse(
      translationError,
      message.messageId,
      { context: message.context || 'unknown' } // Pass context as part of options
    );

    logger.debug('[Handler:TRANSLATE] Returning error response:', JSON.stringify(errorResponse, null, 2));

    return errorResponse;
  }
}