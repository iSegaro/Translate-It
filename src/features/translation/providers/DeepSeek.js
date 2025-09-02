// src/core/providers/DeepSeekProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getDeepSeekApiKeyAsync,
  getDeepSeekApiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'DeepSeek');

export class DeepSeekProvider extends BaseAIProvider {
  static type = "ai";
  static description = "DeepSeek AI";
  static displayName = "DeepSeek";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  
  // AI Provider capabilities - Conservative settings for DeepSeek
  static supportsStreaming = false; // Disable streaming initially for stability
  static preferredBatchStrategy = 'fixed';
  static optimalBatchSize = 10;
  static maxComplexity = 200;
  static supportsImageTranslation = false;

  constructor() {
    super("DeepSeek");
  }

  _getLangCode(lang) {
    // DeepSeek works well with full language names, no mapping needed
    return LanguageSwappingService._normalizeLangValue(lang);
  }

  /**
   * Translate batch of texts - DeepSeek uses individual requests for stability
   * @param {string[]} batch - Batch of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _translateBatch(batch, sourceLang, targetLang, translateMode, abortController) {
    // DeepSeek uses individual requests for now (more stable)
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
    const [apiKey, model] = await Promise.all([
      getDeepSeekApiKeyAsync(),
      getDeepSeekApiModelAsync(),
    ]);

    // Validate configuration
    this._validateConfig(
      { apiKey },
      ["apiKey"],
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
        model: model || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    };

    return this._executeApiCall({
      url: CONFIG.DEEPSEEK_API_URL,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });
  }
}