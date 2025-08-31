import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import { MessageFormat } from '../../../messaging/core/MessagingCore.js';
import { MessageActions } from '@/messaging/core/MessageActions.js';
import browser from 'webextension-polyfill';
import { sendSmart } from '@/messaging/core/SmartMessaging.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'handleTranslate');
// Delimiter used by providers (e.g. Bing) for JSON/segment mode
const TEXT_DELIMITER = "\n\n---\n\n";

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

    // Use the normalized message directly
    const normalizedMessage = message;

    // When SelectElement raw JSON payload is present, do NOT pre-parse it here.
    // The TranslationEngine/provider will detect and handle JSON-mode parsing itself
    // (this preserves the original payload and allows provider-specific JSON handling).
    if (normalizedMessage.data.mode === 'SelectElement' && normalizedMessage.data.options?.rawJsonPayload) {
      logger.debug('[Handler:TRANSLATE] SelectElement rawJsonPayload detected - leaving data.text as-is for provider handling');
    }

    const result = await backgroundService.translationEngine.handleTranslateMessage(normalizedMessage, sender);

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
      // SUCCESS case - send translation result
      let finalTranslatedText = result.translatedText;
      // If the original message was a raw JSON payload for SelectElement mode,
      // re-wrap the translated text into a JSON array format for the content script
      if (normalizedMessage.data.mode === 'SelectElement' && normalizedMessage.data.options?.rawJsonPayload) {
        // Try to be resilient with provider outputs in JSON mode:
        // - Provider may return a JSON array string with one element containing joined translation
        // - Provider may return a plain joined string
        // We want to produce a JSON array with the same length as the original JSON payload
        try {
          const originalJson = JSON.parse(normalizedMessage.data.text);
          const expectedLen = Array.isArray(originalJson) ? originalJson.length : null;

          // Try parse provider output as JSON array
          let parsedProviderJson = null;
          try {
            parsedProviderJson = JSON.parse(result.translatedText);
          } catch {
            parsedProviderJson = null;
          }

          if (parsedProviderJson && Array.isArray(parsedProviderJson) && expectedLen && parsedProviderJson.length === expectedLen) {
            finalTranslatedText = result.translatedText; // provider returned matching array
            logger.debug('[Handler:TRANSLATE] Provider returned matching JSON array for SelectElement mode');
          } else {
            // If provider returned single-element array where its text contains the delimiter,
            // split it and reconstruct an array
            if (parsedProviderJson && Array.isArray(parsedProviderJson) && parsedProviderJson.length === 1 && typeof parsedProviderJson[0].text === 'string' && expectedLen) {
              const candidate = parsedProviderJson[0].text;
              const parts = candidate.split(TEXT_DELIMITER);
              if (parts.length === expectedLen) {
                const rebuilt = originalJson.map((item, idx) => ({ ...item, text: parts[idx].trim() }));
                finalTranslatedText = JSON.stringify(rebuilt);
                logger.debug('[Handler:TRANSLATE] Rebuilt JSON array from single-element provider response');
              }
            }

            // If still not rebuilt, try splitting raw translatedText by delimiter
            if (!finalTranslatedText) {
              const raw = result.translatedText;
              if (typeof raw === 'string' && expectedLen) {
                const parts = raw.split(TEXT_DELIMITER);
                if (parts.length === expectedLen) {
                  const rebuilt = originalJson.map((item, idx) => ({ ...item, text: parts[idx].trim() }));
                  finalTranslatedText = JSON.stringify(rebuilt);
                  logger.debug('[Handler:TRANSLATE] Rebuilt JSON array from raw translatedText by splitting delimiter');
                }
              }
            }

            // Fallback: if nothing matched, wrap entire translatedText as single element
            if (!finalTranslatedText) {
              finalTranslatedText = JSON.stringify([{ text: result.translatedText }]);
              logger.debug('[Handler:TRANSLATE] Fallback: wrapped provider translatedText into single-element JSON array');
            }
          }
        } catch (err) {
          // On any error, fallback to wrapping
          finalTranslatedText = JSON.stringify([{ text: result.translatedText }]);
          logger.warn('[Handler:TRANSLATE] Error while normalizing SelectElement provider output, fallback wrap used', err);
        }
      }

      updateMessage = MessageFormat.create(
        MessageActions.TRANSLATION_RESULT_UPDATE,
        {
          success: true,
          translatedText: finalTranslatedText,
          originalText: result.originalText,
          provider: result.provider,
          sourceLanguage: result.sourceLanguage,
          targetLanguage: result.targetLanguage,
          timestamp: result.timestamp,
          translationMode: result.mode || normalizedMessage.data.mode || normalizedMessage.data.translationMode,
          options: {
            toastId: normalizedMessage.data.options?.toastId // Pass the toastId to dismiss the notification
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
          originalText: normalizedMessage.data.text,
          provider: normalizedMessage.data.provider,
          sourceLanguage: normalizedMessage.data.sourceLanguage,
          targetLanguage: normalizedMessage.data.targetLanguage,
          timestamp: Date.now(),
          translationMode: normalizedMessage.data.mode || normalizedMessage.data.translationMode,
          options: {
            toastId: normalizedMessage.data.options?.toastId // Pass the toastId to dismiss the notification
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
