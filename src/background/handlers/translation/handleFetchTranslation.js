// src/background/handlers/translation/handleFetchTranslation.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'fetchTranslation' message action.
 * This fetches a translation using the background translation engine.
 * Uses Promise pattern for Firefox MV3 compatibility.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - Promise that resolves to response data.
 */
export async function handleFetchTranslation(message, sender) {
  console.log('[Handler:fetchTranslation] Processing translation fetch request:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    if (!backgroundService || !backgroundService.translationEngine) {
      throw new Error("Background service or translation engine not initialized.");
    }
    
    const { text, from, to, provider } = message.data || {};
    
    if (!text) {
      throw new Error('Text is required for translation');
    }
    
    // Format request for TranslationEngine.handleTranslateMessage
    const translationRequest = {
      action: "TRANSLATE",
      context: "legacy-handler",
      data: {
        text,
        provider: provider || 'google',
        sourceLanguage: from || 'auto',
        targetLanguage: to || 'fa',
        mode: 'simple',
        options: {}
      }
    };
    
    // Use the translation engine to fetch translation
    const result = await backgroundService.translationEngine.handleTranslateMessage(translationRequest, sender);
    
    console.log(`✅ [fetchTranslation] Translation completed: ${text.substring(0, 50)}... → ${result.translatedText?.substring(0, 50)}...`);
    console.log('[Handler:fetchTranslation] Full result object:', result);
    
    const responseData = { 
      success: true, 
      data: result
    };
    
    console.log('[Handler:fetchTranslation] 🚀 Returning Promise response:', responseData);
    return responseData;
    
  } catch (error) {
    console.error('[Handler:fetchTranslation] ❌ Error occurred:', error);
    console.error('[Handler:fetchTranslation] Error stack:', error.stack);
    
    errorHandler.handle(error, {
      type: ErrorTypes.TRANSLATION,
      context: "handleFetchTranslation",
      messageData: message
    });
    
    const errorResponse = { success: false, error: error.message || 'Translation fetch failed' };
    console.log('[Handler:fetchTranslation] 🚀 Returning Promise error response:', errorResponse);
    return errorResponse;
  }
}