import { ErrorHandler } from '../../../error-management/ErrorHandler.js';
import { ErrorTypes } from '../../../error-management/ErrorTypes.js';
import { MessageActions } from '../../../messaging/core/MessageActions.js';
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'handleTranslateText');

const errorHandler = new ErrorHandler();

/**
 * Handles the 'TRANSLATE_TEXT' message action from Vue components.
 * This is used by popup, sidepanel, and content components.
 * Uses Promise pattern for Firefox MV3 compatibility.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - Returns Promise with translation result.
 */
export async function handleTranslateText(message, sender) {
  try {
    logger.debug('[Handler:TRANSLATE_TEXT] Processing Vue translation request:', message.data);
    
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
      action: MessageActions.TRANSLATE,
      context: message.source || "vue-component",
      data: {
        text,
        provider: provider || 'google',
        sourceLanguage: from || 'auto',
        targetLanguage: to || 'fa',
        mode: 'simple',
        options: {}
      }
    };
    
    // Use the translation engine's handleTranslateMessage method
    const result = await backgroundService.translationEngine.handleTranslateMessage(translationRequest, sender);
    
    logger.debug(`✅ [TRANSLATE_TEXT] Translation result:`, result);
    
    if (result.success) {
      const response = {
        success: true,
        translation: result.translatedText,
        provider: result.provider,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage
      };
      logger.debug(`🚀 [TRANSLATE_TEXT] Returning successful response:`, response);
      return response;
    } else {
      const response = {
        success: false,
        error: result.error?.message || 'Translation failed'
      };
      logger.debug(`🚀 [TRANSLATE_TEXT] Returning error response:`, response);
      return response;
    }
    
  } catch (error) {
    logger.error('[Handler:TRANSLATE_TEXT] Error:', error);
    errorHandler.handle(error, {
      type: ErrorTypes.TRANSLATION,
      context: "handleTranslateText",
      messageData: message
    });
    
    const errorResponse = {
      success: false,
      error: error.message || 'Translation failed'
    };
    logger.debug(`🚀 [TRANSLATE_TEXT] Returning catch error response:`, errorResponse);
    return errorResponse;
  }
}