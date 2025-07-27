// src/background/handlers/translation/handleFetchTranslation.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'fetchTranslation' message action.
 * This fetches a translation using the background translation engine.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleFetchTranslation(message, sender, sendResponse) {
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
    
    // Use the translation engine to fetch translation
    const result = await backgroundService.translationEngine.translate({
      text,
      from: from || 'auto',
      to: to || 'en',
      provider: provider || 'google'
    });
    
    console.log(`✅ [fetchTranslation] Translation completed: ${text.substring(0, 50)}... → ${result.translatedText?.substring(0, 50)}...`);
    
    sendResponse({ 
      success: true, 
      data: result
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.TRANSLATION,
      context: "handleFetchTranslation",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Translation fetch failed' });
    return false;
  }
}