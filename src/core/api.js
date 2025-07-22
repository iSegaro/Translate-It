// src/core/api.js
import {
  CONFIG,
  getUseMockAsync,
  getSourceLanguageAsync,
  getTargetLanguageAsync,
  getTranslationApiAsync,
  TranslationMode,
} from "../config.js";
import { delay, isExtensionContextValid } from "../utils/helpers.js";
import { isPersianText } from "../utils/textDetection.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { translationProviderFactory } from "../providers/index.js";

const MOCK_DELAY = 500;
const TEXT_DELIMITER = "\n\n---\n\n";

class ApiService {
  constructor() {
    // Remove sessionContext as it's now handled by individual providers
  }



  /**
   * Reset session context for a specific provider or all providers
   * @param {string} [apiType] - Specific provider to reset session, or all if not specified
   */
  resetSessionContext(apiType = null) {
    translationProviderFactory.resetSessionContext(apiType);
  }

  async translateText(text, translateMode, srcLang, tgtLang) {
    // Handle mock mode
    if (await getUseMockAsync()) {
      await delay(MOCK_DELAY);
      const sample = text.substring(0, 50);
      return isPersianText(sample) ?
          CONFIG.DEBUG_TRANSLATED_ENGLISH
        : CONFIG.DEBUG_TRANSLATED_PERSIAN;
    }

    // Validate extension context
    if (!isExtensionContextValid()) {
      const err = new Error(ErrorTypes.CONTEXT);
      err.type = ErrorTypes.CONTEXT;
      err.context = "api-translateText-context";
      throw err;
    }

    // Get source and target languages
    let [sourceLanguage, targetLanguage] = await Promise.all([
      srcLang || getSourceLanguageAsync(),
      tgtLang || getTargetLanguageAsync(),
    ]);

    // Get translation API type
    const api = await getTranslationApiAsync();

    // Skip translation if same language (except for certain modes)
    if (
      sourceLanguage === targetLanguage &&
      translateMode !== TranslationMode.Popup_Translate &&
      translateMode !== TranslationMode.Sidepanel_Translate
    ) {
      return null;
    }

    try {
      // Get provider instance from factory
      const provider = translationProviderFactory.getProvider(api);
      
      // Use provider's translate method
      return await provider.translate(
        text,
        sourceLanguage,
        targetLanguage,
        translateMode
      );
    } catch (error) {
      // Add context to error if not already present
      if (!error.context) {
        error.context = `api-translateText-${api}`;
      }
      throw error;
    }
  }
}

const apiService = new ApiService();
export const translateText = apiService.translateText.bind(apiService);
export const API_TEXT_DELIMITER = TEXT_DELIMITER;
