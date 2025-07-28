import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import { 
  validateTranslationRequest, 
  createErrorResponse, 
  TRANSLATION_ACTIONS,
  TRANSLATION_CONTEXTS 
} from '../../../core/translation-protocol.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'TRANSLATE' message action.
 * This processes translation requests through the background translation engine.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - A Promise that resolves with the translation result or rejects with an error.
 */
export async function handleTranslate(message, sender) {
  console.log('[Handler:TRANSLATE] Raw message received:', JSON.stringify(message, null, 2));
  console.log('[Handler:TRANSLATE] Sender info:', sender);
  
  try {
    const backgroundService = globalThis.backgroundService;
    
    if (!backgroundService || !backgroundService.translationEngine) {
      throw new Error("Background service or translation engine not initialized.");
    }
    
    // Normalize message format for TranslationEngine
    let normalizedMessage = message;
    
    // Handle different message formats for backward compatibility
    if (message.action === TRANSLATION_ACTIONS.TRANSLATE) {
      // Standard protocol format - use as is
      console.log('[Handler:TRANSLATE] Standard protocol format detected');
      normalizedMessage = message;
    } else if (message.text && message.provider) {
      // Legacy direct format - convert to standard protocol
      console.log('[Handler:TRANSLATE] Legacy format detected, converting to standard protocol');
      normalizedMessage = {
        action: TRANSLATION_ACTIONS.TRANSLATE,
        context: message.context || TRANSLATION_CONTEXTS.SIDEPANEL,
        data: {
          text: message.text,
          provider: message.provider,
          sourceLanguage: message.sourceLanguage || 'auto',
          targetLanguage: message.targetLanguage || 'fa',
          mode: message.mode || 'simple',
          options: message.options || {}
        }
      };
    } else {
      throw new Error(`Invalid message format. Expected TRANSLATE action with data, got: ${JSON.stringify(message)}`);
    }
    
    console.log('[Handler:TRANSLATE] Normalized message:', JSON.stringify(normalizedMessage, null, 2));
    
    // Validate the normalized message
    if (!validateTranslationRequest(normalizedMessage)) {
      throw new Error(`Invalid translation request format: ${JSON.stringify(normalizedMessage)}`);
    }
    
    // Call the translation engine with the normalized message (ASYNC OPERATION)
    console.log('[Handler:TRANSLATE] Starting async translation...');
    
    // Use async/await instead of Promise chains to ensure proper response handling
    const result = await backgroundService.translationEngine.handleTranslateMessage(normalizedMessage, sender);
    
    console.log('[Handler:TRANSLATE] Translation engine result:', JSON.stringify(result, null, 2));
    
    // Ensure we have a valid response format
    if (!result || typeof result !== 'object') {
      throw new Error(`Invalid response from translation engine: ${JSON.stringify(result)}`);
    }
    
    if (!Object.prototype.hasOwnProperty.call(result, 'success')) {
      throw new Error(`Response missing 'success' property: ${JSON.stringify(result)}`);
    }
    
    console.log('[Handler:TRANSLATE] Translation successful:', JSON.stringify(result, null, 2));
    
    // Return result for consistent handling
    return result;
    
  } catch (translationError) {
    console.error('[Handler:TRANSLATE] Translation error:', translationError);
    console.error('[Handler:TRANSLATE] Error stack:', translationError.stack);
    
    errorHandler.handle(translationError, {
      type: ErrorTypes.TRANSLATION,
      context: "handleTranslate",
      messageData: message
    });
    
    // Use standardized error response format
    const errorResponse = createErrorResponse(
      translationError, 
      message.context || 'unknown',
      message.provider || message.data?.provider || 'unknown'
    );
    
    console.log('[Handler:TRANSLATE] Returning error response:', JSON.stringify(errorResponse, null, 2));
    return errorResponse;
  }
}
