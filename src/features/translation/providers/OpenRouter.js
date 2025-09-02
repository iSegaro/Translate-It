// src/core/providers/OpenRouterProvider.js
import browser from 'webextension-polyfill';
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getOpenRouterApiKeyAsync,
  getOpenRouterApiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'OpenRouter');

export class OpenRouterProvider extends BaseAIProvider {
  static type = "ai";
  static description = "OpenRouter API";
  static displayName = "OpenRouter";
  static reliableJsonMode = true;
  static supportsDictionary = true;
  
  // AI Provider capabilities - Flexible settings for multi-model support
  static supportsStreaming = true;
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 12; // Conservative for multi-model support
  static maxComplexity = 250;
  static supportsImageTranslation = true; // Depends on selected model

  constructor() {
    super("OpenRouter");
  }

  _getLangCode(lang) {
    // OpenRouter works well with full language names, no mapping needed
    return LanguageSwappingService._normalizeLangValue(lang);
  }

  /**
   * OpenRouter batch translation with fallback to individual requests
   * @param {string[]} batch - Batch of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _translateBatch(batch, sourceLang, targetLang, translateMode, abortController) {
    // For single text, use individual translation
    if (batch.length === 1) {
      const result = await this._translateSingle(batch[0], sourceLang, targetLang, translateMode, abortController);
      return [result || batch[0]];
    }

    // Try batch translation for efficiency
    try {
      const batchPrompt = this._buildBatchPrompt(batch, sourceLang, targetLang);
      const result = await this._translateSingle(batchPrompt, sourceLang, targetLang, translateMode, abortController);
      
      // Parse batch result
      const parsedResults = this._parseBatchResult(result, batch.length, batch);
      
      // Validate results
      if (parsedResults.length === batch.length) {
        logger.debug(`[${this.providerName}] Batch translation successful: ${batch.length} segments`);
        return parsedResults;
      } else {
        logger.warn(`[${this.providerName}] Batch result mismatch, falling back to individual requests`);
        throw new Error('Batch result count mismatch');
      }
    } catch (error) {
      logger.warn(`[${this.providerName}] Batch translation failed, falling back to individual requests:`, error);
      return this._fallbackSingleRequests(batch, sourceLang, targetLang, translateMode, abortController);
    }
  }

  /**
   * Fallback to individual requests when batch translation fails
   * @param {string[]} batch - Batch of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _fallbackSingleRequests(batch, sourceLang, targetLang, translateMode, abortController) {
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
      getOpenRouterApiKeyAsync(),
      getOpenRouterApiModelAsync(),
    ]);

    // Validate configuration
    this._validateConfig(
      { apiKey },
      ["apiKey"],
      `${this.providerName.toLowerCase()}-translation`
    );

    // Check if this is a batch prompt (starts with specific pattern)
    const prompt = text.startsWith('Translate the following JSON array') 
      ? text 
      : await buildPrompt(
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
        "HTTP-Referer": browser.runtime.getURL("/"),
        "X-Title": browser.runtime.getManifest().name,
      },
      body: JSON.stringify({
        model: model || "openai/gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      }),
    };

    return this._executeApiCall({
      url: CONFIG.OPENROUTER_API_URL,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });
  }
}
