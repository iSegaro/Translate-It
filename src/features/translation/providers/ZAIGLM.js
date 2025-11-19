// src/features/translation/providers/ZAIGLM.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getZaiApiKeyAsync,
  getZaiApiUrlAsync,
  getZaiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'ZAIGLM');

import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";

export class ZAIGLMProvider extends BaseAIProvider {
  static type = "ai";
  static description = "Z.AI GLM Models";
  static displayName = "Z.AI GLM";
  static reliableJsonMode = false;

  static supportsDictionary = false;

  // AI Provider capabilities - Optimized for GLM models
  static supportsStreaming = true;
  static preferredBatchStrategy = 'json'; // Use JSON strategy like OpenAI
  static optimalBatchSize = 15;
  static maxComplexity = 300;
  static supportsImageTranslation = false; // GLM models don't support image translation in this context

  // Batch processing strategy
  static batchStrategy = 'json';

  constructor() {
    super("ZAI");
  }

  /**
   * Convert language to ZAI GLM format (uses standard language codes)
   */
  _getLangCode(lang) {
    // ZAI GLM uses standard language codes like Gemini
    return lang || "auto";
  }

  /**
   * Get configuration using project's existing config system
   */
  async _getConfig() {
    try {
      // Use project's existing config system with built-in caching
      const [apiKey, zaiModel] = await Promise.all([
        getZaiApiKeyAsync(),
        getZaiModelAsync(),
      ]);

      // Get API URL (allow custom URL)
      const apiUrl = await getZaiApiUrlAsync();

      // Check if it's a custom model (not in predefined list)
      const isCustomModel = !CONFIG.ZAI_MODELS?.some(model => model.value === zaiModel && model.value !== 'custom');
      const actualModel = zaiModel || 'glm-4.5';

      // Configuration loaded successfully
      logger.info(`[ZAI] Using model: ${actualModel} (custom: ${isCustomModel})`);

      return { apiKey, zaiModel, actualModel, apiUrl, isCustomModel };
    } catch (error) {
      logger.error(`[ZAI] Error loading configuration:`, error);
      throw error;
    }
  }

  /**
   * Single text translation using OpenAI-compatible API format
   */
  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const { apiKey, actualModel, apiUrl } = await this._getConfig();

    // Configuration applied for translation
    logger.info(`[ZAI] Starting translation: ${text.length} chars`);

    // Validate configuration
    this._validateConfig(
      { apiKey, apiUrl },
      ["apiKey", "apiUrl"],
      `${this.providerName.toLowerCase()}-translation`
    );

    const prompt = text.startsWith('Translate the following JSON array')
      ? text
      : await buildPrompt(
          text,
          sourceLang,
          targetLang,
          translateMode,
          this.constructor.type
        );

    // Build OpenAI-compatible request body
    const requestBody = {
      model: actualModel,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      stream: false // Non-streaming for now
    };

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
    };

    const context = `${this.providerName.toLowerCase()}-translation`;

    try {
      const result = await this._executeApiCall({
        url: apiUrl,
        fetchOptions,
        extractResponse: (data) => {
          // Extract content from OpenAI-compatible response
          if (data?.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
          }
          throw new Error('Invalid response format from ZAI API');
        },
        context: context,
        abortController: abortController
      });

      // API call completed successfully
      logger.info(`[ZAI] Translation completed successfully`);
      return result;
    } catch (error) {
      // Let ErrorHandler automatically detect and handle all error types including quota/rate limits
      await ErrorHandler.getInstance().handle(error, {
        context: 'zai-translation'
      });

      logger.error('[ZAI] Translation failed with error:', error);
      error.context = `${this.providerName.toLowerCase()}-translation`;
      error.provider = this.providerName;
      throw error;
    }
  }

  /**
   * Override batch translation to use JSON strategy effectively
   */
  async _translateBatch(batch, sourceLang, targetLang, translateMode, abortController, engine = null, messageId = null) {
    // For single text, use individual translation
    if (batch.length === 1) {
      const result = await this._translateSingle(batch[0], sourceLang, targetLang, translateMode, abortController);
      return [result || batch[0]];
    }

    // Use JSON batch strategy
    try {
      const batchPrompt = this._buildBatchPrompt(batch, sourceLang, targetLang);
      const result = await this._translateSingle(batchPrompt, sourceLang, targetLang, translateMode, abortController);

      // Parse batch result
      const parsedResults = this._parseBatchResult(result, batch.length, batch);

      // Validate results
      if (parsedResults.length === batch.length) {
        // Batch translation successful
        logger.info(`[ZAI] JSON batch translation successful: ${batch.length} segments`);
        return parsedResults;
      } else {
        logger.warn(`[ZAI] Batch result mismatch, falling back to individual requests`);
        throw new Error('Batch result count mismatch');
      }
    } catch (error) {
      logger.warn(`[ZAI] Batch translation failed, trying fallback:`, error);

      // Try fallback, but if that fails too, throw the original error
      try {
        const fallbackResults = await this._fallbackSingleRequests(batch, sourceLang, targetLang, translateMode, engine, messageId, abortController);
        // Fallback successful
        logger.info(`[ZAI] Fallback completed for ${batch.length} segments`);
        return fallbackResults;
      } catch (fallbackError) {
        logger.error(`[ZAI] Fallback also failed:`, fallbackError);
        // Throw the original batch error, not fallback error, for better context
        throw error;
      }
    }
  }

  /**
   * Create error with proper type
   * @param {string} type - Error type from ErrorTypes
   * @param {string} message - Error message
   * @returns {Error} Error object
   * @private
   */
  _createError(type, message) {
    const error = new Error(message);
    error.type = type;
    error.context = `${this.providerName.toLowerCase()}-provider`;
    return error;
  }
}