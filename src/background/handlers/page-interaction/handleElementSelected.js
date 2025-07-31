import { backgroundService } from '../../background/index.js';
import { getSourceLanguageAsync, getTargetLanguageAsync, getTranslationApiAsync } from '../../../config.js';

/**
 * Handles the 'elementSelected' action from the content script.
 * This function now directly returns the translation result to the caller.
 *
 * @param {object} message - The message object from the content script.
 * @param {object} sender - The sender object.
 * @returns {Promise<object>} - A promise that resolves with the translation result.
 */
export async function handleElementSelected(message, sender) {
  const { data } = message;
  const { text } = data;

  if (!text) {
    return { success: false, error: 'No text provided' };
  }

  try {
    // Fetch settings correctly and asynchronously
    const sourceLang = await getSourceLanguageAsync();
    const targetLang = await getTargetLanguageAsync();
    const provider = await getTranslationApiAsync();

    // Use the translation engine from the initialized background service
    const translationResult = await backgroundService.translationEngine.handleTranslateMessage({
      data: {
        text,
        provider,
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        mode: 'selection'
      },
      context: 'element-selection'
    });

    // Return the result directly to the content script
    return translationResult;

  } catch (error) {
    console.error('[handleElementSelected] Translation failed:', error);
    return { success: false, error: error.message };
  }
}