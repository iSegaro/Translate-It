// src/background/handlers/translation/handleFetchTranslationBackground.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'fetchTranslationBackground' message action.
 * This is a background translation fetch that doesn't update UI state.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - True if sendResponse will be called asynchronously.
 */
export async function handleFetchTranslationBackground(message, sender, sendResponse) {
  console.log('[Handler:fetchTranslationBackground] Processing background translation request:', message.data);
  
  try {
    const backgroundService = globalThis.backgroundService;
    if (!backgroundService || !backgroundService.translationEngine) {
      throw new Error("Background service or translation engine not initialized.");
    }
    
    const { text, from, to, provider, silent = true } = message.data || {};
    
    if (!text) {
      throw new Error('Text is required for background translation');
    }
    
    // Use the translation engine for background translation
    const result = await backgroundService.translationEngine.translate({
      text,
      from: from || 'auto',
      to: to || 'en',
      provider: provider || 'google',
      silent // Don't trigger UI updates or history
    });
    
    console.log(`✅ [fetchTranslationBackground] Background translation completed silently`);
    
    sendResponse({ 
      success: true, 
      data: result,
      backgroundTranslation: true
    });
    return true;
  } catch (error) {
    errorHandler.handle(error, {
      type: ErrorTypes.TRANSLATION,
      context: "handleFetchTranslationBackground",
      messageData: message
    });
    sendResponse({ success: false, error: error.message || 'Background translation failed' });
    return false;
  }
}