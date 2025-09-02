// src/core/providers/CustomProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getCustomApiUrlAsync,
  getCustomApiKeyAsync,
  getCustomApiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'CustomProvider');

export class CustomProvider extends BaseAIProvider {
  static type = "ai";
  static description = "Custom OpenAI compatible";
  static displayName = "Custom Provider";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  
  // AI Provider capabilities - Safe defaults for unknown APIs
  static supportsStreaming = false; // Disable by default for unknown APIs
  static preferredBatchStrategy = 'fixed';
  static optimalBatchSize = 10; // Conservative batch size
  static maxComplexity = 200;
  static supportsImageTranslation = false; // Conservative default

  constructor() {
    super("Custom");
  }

  _getLangCode(lang) {
    // Custom provider works well with full language names, no mapping needed
    return LanguageSwappingService._normalizeLangValue(lang);
  }

  /**
   * Custom provider batch translation - Uses individual requests for safety
   * @param {string[]} batch - Batch of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _translateBatch(batch, sourceLang, targetLang, translateMode, abortController) {
    // Custom provider uses individual requests for safety with unknown APIs
    const results = [];
    
    for (let i = 0; i < batch.length; i++) {
      if (abortController && abortController.signal.aborted) {
        throw new Error('Translation cancelled');
      }
      
      try {
        const result = await this._translateSingle(batch[i], sourceLang, targetLang, translateMode, abortController);
        results.push(result || batch[i]);
      } catch (error) {
        logger.warn(`[${this.providerName}] Individual translation ${i + 1} failed:`, error);
        results.push(batch[i]); // Return original text on failure
      }
    }
    
    return results;
  }

  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const [apiUrl, apiKey, model] = await Promise.all([
      getCustomApiUrlAsync(),
      getCustomApiKeyAsync(),
      getCustomApiModelAsync(),
    ]);

    // Validate configuration
    this._validateConfig(
      { apiUrl, apiKey },
      ["apiUrl", "apiKey"],
      `${this.providerName.toLowerCase()}-translation`
    );

    const prompt = await buildPrompt(
      text,
      sourceLang,
      targetLang,
      translateMode,
      this.constructor.type
    );

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model, // مدل باید توسط کاربر مشخص شود
        messages: [{ role: "user", content: prompt }],
      }),
    };

    return this._executeApiCall({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });
  }
}