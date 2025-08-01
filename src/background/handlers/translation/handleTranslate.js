import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import { MessageFormat } from '../../../messaging/core/MessagingCore.js';
import { MessageActions } from '@/messaging/core/MessageActions.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'TRANSLATE' message action.
 * This processes translation requests through the background translation engine.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - Promise that resolves with the response object.
 */
export async function handleTranslate(message, sender) {
  console.log('[Handler:TRANSLATE] Raw message received:', JSON.stringify(message, null, 2));
  console.log('[Handler:TRANSLATE] Sender info:', sender);
  console.log('[Handler:TRANSLATE] Sender.tab:', sender.tab);
  console.log('[Handler:TRANSLATE] Sender.tab.id:', sender.tab?.id);

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

    // The message should already be normalized by EnhancedUnifiedMessenger
    const normalizedMessage = message;

    // Handle SelectElement mode with raw JSON payload
    if (normalizedMessage.data.mode === 'SelectElement' && normalizedMessage.data.options?.rawJsonPayload) {
      try {
        const parsedPayload = JSON.parse(normalizedMessage.data.text);
        let extractedText = '';
        if (Array.isArray(parsedPayload)) {
          extractedText = parsedPayload.map(item => item.text).join('\n');
        } else if (typeof parsedPayload === 'object' && parsedPayload !== null && parsedPayload.text) {
          extractedText = parsedPayload.text;
        } else {
          throw new Error('Unexpected JSON structure for SelectElement mode.');
        }
        normalizedMessage.data.text = extractedText; // Update the message data with plain text
        console.log('[Handler:TRANSLATE] Parsed SelectElement text:', extractedText);
      } catch (jsonParseError) {
        console.error('[Handler:TRANSLATE] Failed to parse SelectElement JSON payload:', jsonParseError);
        throw new Error(`Failed to parse SelectElement text as JSON: ${jsonParseError.message}`);
      }
    }

    console.log('[Handler:TRANSLATE] Normalized message:', JSON.stringify(normalizedMessage, null, 2));

    // Call the translation engine with the normalized message (ASYNC OPERATION)
    console.log('[Handler:TRANSLATE] Starting async translation...');

    const result = await backgroundService.translationEngine.handleTranslateMessage(normalizedMessage, sender);

    console.log('[Handler:TRANSLATE] Translation engine result:', JSON.stringify(result, null, 2));

    if (!result || typeof result !== 'object' || !Object.prototype.hasOwnProperty.call(result, 'success')) {
      throw new Error(`Invalid response from translation engine: ${JSON.stringify(result)}`);
    }

    console.log('[Handler:TRANSLATE] Translation successful:', JSON.stringify(result, null, 2));

    // Send TRANSLATION_RESULT_UPDATE for all contexts due to Firefox MV3 issues
    if (result.success && result.translatedText) {
      const targetTabId = sender.tab?.id;

      let finalTranslatedText = result.translatedText;
      // If the original message was a raw JSON payload for SelectElement mode,
      // re-wrap the translated text into a JSON array format for the content script
      if (normalizedMessage.data.mode === 'SelectElement' && normalizedMessage.data.options?.rawJsonPayload) {
        // Assuming result.translatedText is a single string, wrap it in an array of objects
        finalTranslatedText = JSON.stringify([{ text: result.translatedText }]);
        console.log('[Handler:TRANSLATE] Re-wrapped translated text for SelectElement mode:', finalTranslatedText);
      }

      const updateMessage = MessageFormat.create(
        MessageActions.TRANSLATION_RESULT_UPDATE,
        {
          translatedText: finalTranslatedText, // Use the re-wrapped text
          originalText: result.originalText,
          provider: result.provider,
          sourceLanguage: result.sourceLanguage,
          targetLanguage: result.targetLanguage,
          timestamp: result.timestamp,
          mode: result.mode
        },
        message.context, // Use original message context
        { messageId: message.messageId } // Use original messageId for correlation
      );

      if (targetTabId) {
        console.log(`[Handler:TRANSLATE] Sending TRANSLATION_RESULT_UPDATE message to tab ${targetTabId}:`, updateMessage);
        browser.tabs.sendMessage(targetTabId, updateMessage).catch(error => {
          console.error(`[Handler:TRANSLATE] Failed to send TRANSLATION_RESULT_UPDATE message to tab ${targetTabId}:`, error);
        });
      } else {
        console.warn("[Handler:TRANSLATE] No tab ID found in sender, sending TRANSLATION_RESULT_UPDATE via runtime.sendMessage (fallback).");
        browser.runtime.sendMessage(updateMessage).catch(error => {
          console.error('[Handler:TRANSLATE] Failed to send TRANSLATION_RESULT_UPDATE message via runtime.sendMessage (fallback):', error);
        });
      }
    }

    return MessageFormat.createSuccessResponse("Translation request processed in background.", message.messageId);

  } catch (translationError) {
    console.error('[Handler:TRANSLATE] Translation error:', translationError);
    console.error('[Handler:TRANSLATE] Error stack:', translationError.stack);

    errorHandler.handle(translationError, {
      type: ErrorTypes.TRANSLATION,
      context: "handleTranslate",
      messageData: message
    });

    const errorResponse = MessageFormat.createErrorResponse(
      translationError,
      message.messageId,
      { context: message.context || 'unknown' } // Pass context as part of options
    );

    console.log('[Handler:TRANSLATE] Returning error response:', JSON.stringify(errorResponse, null, 2));
    return errorResponse;
  }
}
