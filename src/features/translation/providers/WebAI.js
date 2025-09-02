// src/core/providers/WebAIProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getWebAIApiUrlAsync,
  getWebAIApiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'WebAI');

export class WebAIProvider extends BaseAIProvider {
  static type = "ai";
  static description = "WebAI service";
  static displayName = "WebAI";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  
  // AI Provider capabilities - Standard API service settings
  static supportsStreaming = true; // Enable streaming for segment-based real-time translation
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 15; // Moderate batch size for external API
  static maxComplexity = 300;
  static supportsImageTranslation = false; // Depends on model

  constructor() {
    super("WebAI");
  }

  _getLangCode(lang) {
    // WebAI works well with full language names, no mapping needed
    return LanguageSwappingService._normalizeLangValue(lang);
  }

  /**
   * WebAI batch translation - Translates multiple texts in one request
   * @param {string[]} batch - Batch of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _translateBatch(batch, sourceLang, targetLang, translateMode, abortController) {
    const [apiUrl, apiModel] = await Promise.all([
      getWebAIApiUrlAsync(),
      getWebAIApiModelAsync(),
    ]);

    // Validate configuration
    this._validateConfig(
      { apiUrl, apiModel },
      ["apiUrl", "apiModel"],
      `${this.providerName.toLowerCase()}-translation`
    );

    // Create batch prompt with all texts
    const batchText = batch.map((text, index) => `${index + 1}. ${text}`).join('\n');
    const prompt = await buildPrompt(
      batchText,
      sourceLang,
      targetLang,
      translateMode,
      this.constructor.type
    );

    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt + '\n\nPlease return the translations in the same order, one per line, numbered 1. 2. 3. etc.',
        model: apiModel,
        images: [],
        reset_session: this.shouldResetSession(),
      }),
    };

    const result = await this._executeApiCall({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) =>
        typeof data.response === "string" ? data.response : undefined,
      context: `${this.providerName.toLowerCase()}-batch-translation`,
      abortController,
    });

    this.storeSessionContext({ model: apiModel, lastUsed: Date.now() });

    // Parse the batch response - extract numbered lines
    if (result) {
      // Split by lines and process
      const rawLines = result.split('\n');
      const lines = [];
      
      for (let line of rawLines) {
        line = line.trim();
        if (!line) continue;
        
        // Check if line starts with number format like "1. ", "2. ", etc.
        const numberMatch = line.match(/^(\d+)\.\s*(.*)$/);
        if (numberMatch) {
          const content = numberMatch[2].trim();
          if (content) {
            lines.push(content);
          }
        }
      }
      
      logger.debug(`[${this.providerName}] Parsed ${lines.length} translations from batch response (expected: ${batch.length})`);
      
      // If we got the expected number of translations, return them
      if (lines.length === batch.length) {
        logger.info(`[${this.providerName}] Successfully parsed batch response: ${lines.length} translations`);
        return lines;
      } else {
        // Log the parsing details for debugging
        logger.warn(`[${this.providerName}] Batch response parsing failed. Expected: ${batch.length}, Got: ${lines.length}`);
        logger.debug(`[${this.providerName}] Raw response:`, result.substring(0, 500) + '...');
        logger.debug(`[${this.providerName}] Parsed lines:`, lines.slice(0, 5));
        return this._fallbackToIndividual(batch, sourceLang, targetLang, translateMode, abortController);
      }
    }

    // If no result, fallback to individual
    return this._fallbackToIndividual(batch, sourceLang, targetLang, translateMode, abortController);
  }

  /**
   * Fallback to individual translations when batch fails
   */
  async _fallbackToIndividual(batch, sourceLang, targetLang, translateMode, abortController) {
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
        results.push(batch[i]);
      }
    }
    return results;
  }

  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const [apiUrl, apiModel] = await Promise.all([
      getWebAIApiUrlAsync(),
      getWebAIApiModelAsync(),
    ]);

    // Validate configuration
    this._validateConfig(
      { apiUrl, apiModel },
      ["apiUrl", "apiModel"],
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        model: apiModel,
        images: [],
        reset_session: this.shouldResetSession(),
      }),
    };

    const result = await this._executeApiCall({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) =>
        typeof data.response === "string" ? data.response : undefined,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });

    this.storeSessionContext({ model: apiModel, lastUsed: Date.now() });
    return result;
  }
}