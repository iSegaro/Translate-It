// src/background/handlers/element-selection/handleElementSelected.js
import { getSourceLanguageAsync, getTargetLanguageAsync, getTranslationApiAsync } from '../../../config.js';

/**
 * Handles the 'elementSelected' message action.
 * @param {Object} message - The message object.
 * @returns {Promise<Object>} - Promise that resolves with the response object.
 */
export async function handleElementSelected(message, sender) {
  console.log('[Handler:handleElementSelected] Processing element selection:', message);
  
  const { text } = message.data;
  const backgroundService = globalThis.backgroundService;

  if (!text) {
    console.log('[Handler:handleElementSelected] No text provided');
    return { success: false, error: 'No text provided' };
  }

  try {
    const sourceLang = await getSourceLanguageAsync();
    const targetLang = await getTargetLanguageAsync();
    const provider = await getTranslationApiAsync();

    console.log('[Handler:handleElementSelected] Calling translation engine with:', {
      text, provider, sourceLang, targetLang
    });

    const result = await backgroundService.translationEngine.handleTranslateMessage({
      data: {
        text,
        provider,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        mode: 'selection'
      },
      context: 'element-selection'
    });
    
    console.log('[Handler:handleElementSelected] Translation result:', result);
    return result;
  } catch (error) {
    console.error('[Handler:handleElementSelected] Error:', error);
    return { success: false, error: error.message };
  }
}
