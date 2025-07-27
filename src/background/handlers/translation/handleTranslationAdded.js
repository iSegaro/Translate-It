// src/background/handlers/translation/handleTranslationAdded.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'translationAdded' message action.
 * This records a completed translation in the history.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleTranslationAdded(message, sender, sendResponse) {
  console.log('[Handler:translationAdded] Processing translation addition to history:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    if (!backgroundService) {
      throw new Error("Background service not initialized.");
    }
    
    const translationData = message.data;
    
    if (!translationData || !translationData.originalText || !translationData.translatedText) {
      throw new Error('Invalid translation data provided');
    }
    
    // Add translation to history via background service
    await backgroundService.addTranslationToHistory(translationData);
    
    console.log(`✅ [translationAdded] Translation added to history: ${translationData.originalText.substring(0, 50)}...`);
    
    sendResponse({ 
      success: true, 
      message: 'Translation added to history successfully'
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.TRANSLATION,
      context: "handleTranslationAdded",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Translation addition failed' });
    return false;
  }
}