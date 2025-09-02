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
   * OpenRouter batch translation - Translates multiple texts in one request
   * @param {string[]} batch - Batch of texts to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts
   */
  async _translateBatch(batch, sourceLang, targetLang, translateMode, abortController) {
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": browser.runtime.getURL("/"),
        "X-Title": browser.runtime.getManifest().name,
      },
      body: JSON.stringify({
        model: model || "openai/gpt-3.5-turbo",
        messages: [{ 
          role: "user", 
          content: prompt + '\n\nPlease return the translations in the same order, one per line, numbered 1. 2. 3. etc.'
        }],
      }),
    };

    const result = await this._executeApiCall({
      url: CONFIG.OPENROUTER_API_URL,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-batch-translation`,
      abortController,
    });

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
