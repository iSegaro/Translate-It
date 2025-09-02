import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import { sendSmart } from '@/shared/messaging/core/SmartMessaging.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'handleTranslate');
const errorHandler = new ErrorHandler();

/**
 * Handles the 'TRANSLATE' message action.
 * This processes translation requests through the background translation engine.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - Promise that resolves with the response object.
 */
export async function handleTranslate(message, sender, sendResponse) {
  // Send immediate ACK to sender to indicate request received
  try {
    if (typeof sendResponse === 'function') {
      try { sendResponse({ ack: true, messageId: message.messageId }) } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // ignore
  }

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

    // Send TRANSLATION_RESULT_UPDATE for ALL cases (success AND error) due to Firefox MV3 issues
    const targetTabId = sender.tab?.id;
    let updateMessage;

    if (result.success && result.translatedText) {
      updateMessage = MessageFormat.create(
        MessageActions.TRANSLATION_RESULT_UPDATE,
        {
          success: true,
          translatedText: result.translatedText,
          originalText: result.originalText,
          provider: result.provider,
          sourceLanguage: result.sourceLanguage,
          targetLanguage: result.targetLanguage,
          timestamp: result.timestamp,
          translationMode: result.mode || message.data.mode || message.data.translationMode,
          options: {
            toastId: message.data.options?.toastId // Pass the toastId to dismiss the notification
          }
        },
        message.context, // Use original message context
        { messageId: message.messageId } // Use original messageId for correlation
      );
    } else {
      // ERROR case - send error information
      logger.debug('[Handler:TRANSLATE] Sending error response to caller');
      
      updateMessage = MessageFormat.create(
        MessageActions.TRANSLATION_RESULT_UPDATE,
        {
          success: false,
          error: result.error,
          originalText: message.data.text,
          provider: message.data.provider,
          sourceLanguage: message.data.sourceLanguage,
          targetLanguage: message.data.targetLanguage,
          timestamp: Date.now(),
          translationMode: message.data.mode || message.data.translationMode,
          options: {
            toastId: message.data.options?.toastId
          }
        },
        message.context, // Use original message context
        { messageId: message.messageId } // Use original messageId for correlation
      );
    }

    // Send the update message (for both success and error cases)
    if (targetTabId) {
      logger.debug(`[Handler:TRANSLATE] Sending TRANSLATION_RESULT_UPDATE message to tab ${targetTabId}:`, updateMessage);
      browser.tabs.sendMessage(targetTabId, updateMessage).catch(error => {
        logger.error(`[Handler:TRANSLATE] Failed to send TRANSLATION_RESULT_UPDATE message to tab ${targetTabId}:`, error);
      });
    } else {
      // For requests from sidepanel/popup without tab context, 
      // the response will be sent via the port that called this handler
      logger.debug("[Handler:TRANSLATE] No tab ID found in sender - response will be handled by port or original caller");
    }

    // Return the actual translation result for port-based requests
    if (result.success) {
      return {
        success: true,
        messageId: message.messageId,
        translatedText: result.translatedText,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
        provider: result.provider || message.data.provider,
        timestamp: Date.now()
      };
    } else {
      return {
        success: false,
        messageId: message.messageId,
        error: result.error,
        timestamp: Date.now()
      };
    }

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