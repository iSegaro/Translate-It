import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { handleTranslationResult } from '@/core/background/handlers/translation/handleTranslationResult.js';

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

    const result = await backgroundService.translationEngine.handleTranslateMessage(message, sender);

    if (result.streaming) {
        logger.info(`[Handler:TRANSLATE] ✅ Streaming started for messageId: ${message.messageId}`);
        return { success: true, streaming: true, messageId: message.messageId };
    }

    if (!result || typeof result !== 'object' || !Object.prototype.hasOwnProperty.call(result, 'success')) {
      throw new Error(`Invalid response from translation engine: ${JSON.stringify(result)}`);
    }

    if (result.success) {
      logger.info(`[Handler:TRANSLATE] ✅ Success: "${result.translatedText?.slice(0, 50)}..."`);
    } else {
      logger.debug(`[Handler:TRANSLATE] ❌ Failed: ${result.error?.message || result.error || 'Unknown error'}`);
    }

    // Check if this is a field mode translation that needs broadcast
    const isFieldMode = message.data?.mode === 'field' ||
                       message.data?.mode === TranslationMode.Field ||
                       message.data?.translationMode === 'field' ||
                       message.data?.translationMode === TranslationMode.Field;

    // For field mode translations, also broadcast the result via TRANSLATION_RESULT_UPDATE
    // This ensures the content script receives the notification even with fire-and-forget pattern
    if (isFieldMode) {
      logger.debug(`[Handler:TRANSLATE] Broadcasting field mode result for messageId: ${message.messageId}`);

      // Create broadcast message
      const broadcastMessage = {
        messageId: message.messageId,
        action: MessageActions.TRANSLATION_RESULT_UPDATE,
        data: {
          success: result.success,
          translatedText: result.success ? result.translatedText : null,
          originalText: message.data.text,
          translationMode: message.data.mode || TranslationMode.Field,
          sourceLanguage: result.sourceLanguage,
          targetLanguage: result.targetLanguage,
          provider: result.provider || message.data.provider,
          options: message.data.options || {},
          error: result.success ? null : result.error,
          context: 'field-mode-broadcast',
          needsBroadcast: true
        }
      };

      // Send broadcast asynchronously (don't wait)
      handleTranslationResult(broadcastMessage).catch(broadcastError => {
        logger.warn('[Handler:TRANSLATE] Failed to broadcast field mode result:', broadcastError);
      });
    }

    // Return the actual translation result
    const finalResult = result.success ? {
      success: true,
      messageId: message.messageId,
      translatedText: result.translatedText,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      provider: result.provider || message.data.provider,
      timestamp: Date.now()
    } : {
      success: false,
      messageId: message.messageId,
      error: result.error,
      timestamp: Date.now()
    };

    logger.debug('[Handler:TRANSLATE] Returning final result:', finalResult);
    return finalResult;

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