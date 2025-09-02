// src/core/providers/OpenAIProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getOpenAIApiKeyAsync,
  getOpenAIApiUrlAsync,
  getOpenAIModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getPromptBASEScreenCaptureAsync } from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'OpenAI');


export class OpenAIProvider extends BaseAIProvider {
  static type = "ai";
  static description = "OpenAI GPT models";
  static displayName = "OpenAI";
  static reliableJsonMode = true;
  static supportsDictionary = true;
  
  // AI Provider capabilities
  static supportsStreaming = true;
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 15;
  static maxComplexity = 300;
  static supportsImageTranslation = true;

  constructor() {
    super("OpenAI");
  }

  _getLangCode(lang) {
    // OpenAI works well with full language names, no mapping needed
    return LanguageSwappingService._normalizeLangValue(lang);
  }

  /**
   * Optimized batch translation for OpenAI
   * Uses batch API calls when possible for better efficiency
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

    // For multiple texts, try batch translation first
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
    const [apiKey, apiUrl, model] = await Promise.all([
      getOpenAIApiKeyAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    // Validate configuration
    this._validateConfig(
      { apiKey, apiUrl },
      ["apiKey", "apiUrl"],
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
      },
      body: JSON.stringify({
        model: model || "gpt-3.5-turbo",
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

  /**
   * Translate text from image using OpenAI Vision
   * @param {string} imageData - Base64 encoded image data
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @returns {Promise<string>} - Translated text
   */
  async translateImage(imageData, sourceLang, targetLang, translateMode) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    const [apiKey, apiUrl, model] = await Promise.all([
      getOpenAIApiKeyAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    // Validate configuration
    this._validateConfig(
      { apiKey, apiUrl },
      ["apiKey", "apiUrl"],
      `${this.providerName.toLowerCase()}-image-translation`
    );

  logger.debug('translateImage called with mode:', translateMode);

    // Build prompt for screen capture translation
    const basePrompt = await getPromptBASEScreenCaptureAsync();
    const prompt = basePrompt
      .replace(/\$_\{TARGET\}/g, targetLang)
      .replace(/\$_\{SOURCE\}/g, sourceLang);

  logger.debug('translateImage built prompt:', prompt);

    // Prepare message with image
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          },
          {
            type: "image_url",
            image_url: {
              url: imageData
            }
          }
        ]
      }
    ];

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o",
        messages: messages,
        max_tokens: 1000
      }),
    };

    const context = `${this.providerName.toLowerCase()}-image-translation`;
    logger.debug('about to call _executeApiCall for image translation');

    try {
      const result = await this._executeApiCall({
        url: apiUrl,
        fetchOptions,
        extractResponse: (data) => data?.choices?.[0]?.message?.content,
        context: context,
      });

      logger.info('image translation completed with result:', result
      );
      return result;
    } catch (error) {
      logger.error('image translation failed with error:', error
      );
      throw error;
    }
  }
}