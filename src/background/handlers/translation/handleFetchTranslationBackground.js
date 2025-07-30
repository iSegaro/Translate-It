// src/background/handlers/translation/handleFetchTranslationBackground.js
import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';

const errorHandler = new ErrorHandler();

/**
 * Handles the 'fetchTranslationBackground' message action.
 * This is a background translation fetch that doesn't update UI state.
 * Uses callback pattern for Firefox MV3 compatibility.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The response callback function.
 * @returns {boolean} - Returns true to keep message channel open.
 */
export function handleFetchTranslationBackground(message, sender, sendResponse) {
  // Use async function inside callback pattern for Firefox MV3 compatibility
  handleAsync();
  return true; // Keep message channel open
  
  async function handleAsync() {
    try {
      console.log('[Handler:fetchTranslationBackground] *** HANDLER CALLED ***');
      console.log('[Handler:fetchTranslationBackground] Processing background translation request:', message.data);
      
      const backgroundService = globalThis.backgroundService;
      if (!backgroundService || !backgroundService.translationEngine) {
        throw new Error("Background service or translation engine not initialized.");
      }
      
      const { text, from, to, provider, translationMode } = message.data || {};
      
      if (!text) {
        throw new Error('Text is required for background translation');
      }
      
      // Format request for TranslationEngine.handleTranslateMessage
      const translationRequest = {
        action: "TRANSLATE",
        context: "background",
        data: {
          text,
          provider: provider || 'google',
          sourceLanguage: from || 'auto',
          targetLanguage: to || 'en',
          mode: translationMode || 'simple',
          options: {}
        }
      };
      
      // Use the translation engine's handleTranslateMessage method
      const result = await backgroundService.translationEngine.handleTranslateMessage(translationRequest, sender);
      
      console.log(`✅ [fetchTranslationBackground] Translation result:`, result);
      console.log(`✅ [fetchTranslationBackground] Result structure:`, JSON.stringify(result, null, 2));
      
      // EventHandler expects response.data.translatedText to be a compact JSON string
      const translatedText = result.translatedText || result.data?.translatedText || result.success?.translatedText;
      console.log(`✅ [fetchTranslationBackground] Extracted translatedText:`, translatedText);
      
      // Ensure it's a compact JSON string (no formatting)
      let compactTranslatedText;
      try {
        // Parse and re-stringify to remove formatting
        const parsed = JSON.parse(translatedText);
        compactTranslatedText = JSON.stringify(parsed);
      } catch (error) {
        console.warn(`[fetchTranslationBackground] Failed to parse translatedText as JSON, using as-is:`, error);
        compactTranslatedText = translatedText;
      }
      
      console.log(`✅ [fetchTranslationBackground] Compact translatedText:`, compactTranslatedText);
      
      // Send successful response via callback
      sendResponse({ 
        success: true, 
        data: {
          translatedText: compactTranslatedText
        },
        backgroundTranslation: true
      });
    } catch (error) {
      console.error('[Handler:fetchTranslationBackground] Error:', error);
      errorHandler.handle(error, {
        type: ErrorTypes.TRANSLATION,
        context: "handleFetchTranslationBackground",
        messageData: message
      });
      
      // Send error response via callback
      sendResponse({ 
        success: false, 
        error: error.message || 'Background translation failed' 
      });
    }
  }
}