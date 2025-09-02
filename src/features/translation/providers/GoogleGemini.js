// src/core/providers/GeminiProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getApiKeyAsync,
  getApiUrlAsync,
  getGeminiModelAsync,
  getGeminiThinkingEnabledAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleGemini');

import { getPromptBASEScreenCaptureAsync } from "@/shared/config/config.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";

export class GeminiProvider extends BaseAIProvider {
  static type = "ai";
  static description = "Google Gemini AI";
  static displayName = "Google Gemini";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  
  // AI Provider capabilities - Current optimized settings
  static supportsStreaming = true;
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 25;
  static maxComplexity = 400;
  static supportsImageTranslation = true;

  constructor() {
    super("Gemini");
  }

  /**
   * Convert language to Gemini-specific format
   */
  _getLangCode(lang) {
    // Gemini uses full language names, so we return the input as-is
    return lang || "auto";
  }

  /**
   * Override _translateBatch to use Gemini's existing batch logic
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

    // Use Gemini's batch translation logic
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
      return this._fallbackSingleRequests(batch, sourceLang, targetLang, translateMode, null, null, abortController);
    }
  }

  _buildBatchPrompt(textBatch, sourceLang, targetLang) {
    const jsonInput = textBatch.map((text, index) => ({
      id: index,
      text: text
    }));
    
    return `Translate the following JSON array of texts from ${sourceLang} to ${targetLang}. Your response MUST be a valid JSON array with the exact same number of items, each containing the translated text. Maintain the original JSON structure.\n\n${JSON.stringify(jsonInput, null, 2)}\n\nImportant: Return only the JSON array with translated texts, no additional text or explanations.`;
  }

  _parseBatchResult(result, expectedCount, originalBatch) {
    try {
      // Find the JSON array in the response, allowing for markdown code blocks
      const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in the response.');
      }
      
      // Use the first captured group that is not undefined
      const jsonString = jsonMatch[1] || jsonMatch[2];
      const parsed = JSON.parse(jsonString);
      
      if (Array.isArray(parsed) && parsed.length === expectedCount) {
        // Ensure the order is correct based on id
        const sortedResults = parsed.sort((a, b) => a.id - b.id);
        return sortedResults.map(item => item.text);
      }
      
      throw new Error(`Invalid batch result format. Expected ${expectedCount} items, got ${parsed.length}.`);
    } catch (error) {
      logger.warn(`[Gemini] Failed to parse batch result: ${error.message}. Falling back to splitting by lines.`);
      return this._fallbackParsing(result, expectedCount, originalBatch);
    }
  }

  _fallbackParsing(result, expectedCount, originalBatch) {
    // A simple fallback: split the result by newlines.
    // This is not robust but can be a last resort.
    const lines = result.split('\\n').filter(line => line.trim() !== '');
    if (lines.length === expectedCount) {
      return lines;
    }
    // If all else fails, return the original texts for this batch
    return originalBatch;
  }

  async _fallbackSingleRequests(batch, sl, tl, translateMode, engine, messageId, abortController) {
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    const results = [];
    for (let i = 0; i < batch.length; i++) {
      if (abortController && abortController.signal.aborted) {
        throw new Error('Translation cancelled during fallback');
      }
      try {
        const result = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateSingle(batch[i], sl, tl, translateMode, abortController),
          `fallback-segment-${i + 1}/${batch.length}`
        );
        results.push(result || batch[i]);
      } catch (error) {
        logger.warn(`[Gemini] Fallback segment ${i + 1} failed:`, error);
        
        // Handle different error types appropriately using centralized error management
        if (this._isQuotaError(error) || error.type === ErrorTypes.QUOTA_EXCEEDED) {
          await ErrorHandler.getInstance().handle(error, {
            context: 'gemini-fallback-quota',
            type: ErrorTypes.QUOTA_EXCEEDED
          });
          throw error; // Re-throw after handling
        }
        if (this._isRateLimitError(error) || error.type === ErrorTypes.RATE_LIMIT_REACHED) {
          await ErrorHandler.getInstance().handle(error, {
            context: 'gemini-fallback-rate-limit',
            type: ErrorTypes.RATE_LIMIT_REACHED
          });
          throw error; // Re-throw after handling
        }
        
        results.push(batch[i]); // Fallback to original text for other errors
      }
    }
    return results;
  }

  _isQuotaError(error) {
    if (!error.message) return false;
    
    const message = error.message.toLowerCase();
    return (
      message.includes('quota') ||
      message.includes('limit exceeded') ||
      message.includes('resource_exhausted') ||
      message.includes('requests per minute') ||
      message.includes('rate limit')
    );
  }

  _isRateLimitError(error) {
    if (!error.message) return false;
    
    const message = error.message.toLowerCase();
    return (
      error.status === 429 ||
      message.includes('429') ||
      message.includes('too many requests') ||
      message.includes('rate limit') ||
      message.includes('throttled')
    );
  }

  /**
   * Parse error details from Gemini response
   */
  _parseErrorDetails(error) {
    const details = {
      quotaType: 'unknown',
      retryAfter: null,
      isTemporary: false
    };
    
    if (!error.message) return details;
    
    const message = error.message.toLowerCase();
    
    // Determine quota/rate limit type
    if (message.includes('requests per minute')) {
      details.quotaType = 'requests_per_minute';
      details.retryAfter = 60000; // 1 minute
      details.isTemporary = true;
    } else if (message.includes('requests per day')) {
      details.quotaType = 'requests_per_day';
      details.retryAfter = 24 * 60 * 60 * 1000; // 24 hours
      details.isTemporary = false;
    } else if (message.includes('tokens per minute')) {
      details.quotaType = 'tokens_per_minute';
      details.retryAfter = 60000;
      details.isTemporary = true;
    } else if (message.includes('concurrent requests')) {
      details.quotaType = 'concurrent_requests';
      details.retryAfter = 5000; // 5 seconds
      details.isTemporary = true;
    } else if (this._isRateLimitError(error)) {
      details.quotaType = 'rate_limit';
      details.retryAfter = 30000; // 30 seconds
      details.isTemporary = true;
    }
    
    // Try to extract retry-after from headers if available
    if (error.headers && error.headers['retry-after']) {
      const retryAfter = parseInt(error.headers['retry-after']);
      if (!isNaN(retryAfter)) {
        details.retryAfter = retryAfter * 1000; // Convert seconds to milliseconds
      }
    }
    
    return details;
  }


  /**
   * Single text translation - extracted from original translate method
   */
  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const [apiKey, geminiModel, thinkingEnabled] = await Promise.all([
      getApiKeyAsync(),
      getGeminiModelAsync(),
      getGeminiThinkingEnabledAsync(),
    ]);

    // Build API URL based on selected model
    let apiUrl;
    if (geminiModel === "custom") {
      apiUrl = await getApiUrlAsync(); // Use custom URL from user input
    } else {
      // Use predefined URL for selected model
      const modelConfig = CONFIG.GEMINI_MODELS?.find(
        (m) => m.value === geminiModel
      );
      apiUrl = modelConfig?.url || CONFIG.API_URL; // Fallback to default
    }

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

    // Determine thinking budget based on model and user settings
    let requestBody = { contents: [{ parts: [{ text: prompt }] }] };

    // Add thinking parameter for supported models
    const modelConfig = CONFIG.GEMINI_MODELS?.find(
      (m) => m.value === geminiModel
    );
    if (modelConfig?.thinking?.supported) {
      if (modelConfig.thinking.controllable) {
        // For controllable models (2.5 Flash, 2.5 Flash Lite)
        if (thinkingEnabled) {
          requestBody.generationConfig = {
            thinkingConfig: { thinkingBudget: -1 }, // Enable dynamic thinking
          };
        } else {
          requestBody.generationConfig = {
            thinkingConfig: { thinkingBudget: 0 }, // Disable thinking
          };
        }
      } else if (modelConfig.thinking.defaultEnabled) {
        // For non-controllable models with thinking enabled by default (2.5 Pro)
        requestBody.generationConfig = {
          thinkingConfig: { thinkingBudget: -1 }, // Always enabled
        };
      }
    }

    const url = `${apiUrl}?key=${apiKey}`;
    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    };

    const context = `${this.providerName.toLowerCase()}-translation`;
    logger.debug('about to call _executeApiCall with:', {
      url: url.replace(/key=[^&]+/, "key=***"),
      context: context,
    });

    try {
      const result = await this._executeApiCall({
        url,
        fetchOptions,
        extractResponse: (data) =>
          data?.candidates?.[0]?.content?.parts?.[0]?.text,
        context: context,
        abortController: abortController
      });

      logger.info('_executeApiCall completed with result:', result);
      return result;
    } catch (error) {
      // Enhanced error handling with detailed analysis using centralized error management
      const errorDetails = this._parseErrorDetails(error);
      
      if (this._isQuotaError(error)) {
        logger.error(`[Gemini] Quota exceeded: ${errorDetails.quotaType}, retry after: ${errorDetails.retryAfter}ms, temporary: ${errorDetails.isTemporary}`);
        await ErrorHandler.getInstance().handle(error, {
          context: 'gemini-translation-quota',
          type: ErrorTypes.QUOTA_EXCEEDED
        });
        throw error; // Re-throw after handling
      }
      
      if (this._isRateLimitError(error)) {
        logger.warn(`[Gemini] Rate limit hit: ${errorDetails.quotaType}, retry after: ${errorDetails.retryAfter}ms`);
        await ErrorHandler.getInstance().handle(error, {
          context: 'gemini-translation-rate-limit',
          type: ErrorTypes.RATE_LIMIT_REACHED
        });
        throw error; // Re-throw after handling
      }
      
      // If thinking-related error occurs, retry without thinking config
      if (
        error.message &&
        error.message.includes("thinkingBudget") &&
        requestBody.generationConfig?.thinkingConfig
      ) {
        logger.debug('[Gemini] Thinking parameter not supported, retrying without thinking config...');

        // Remove thinking config and retry
        delete requestBody.generationConfig;
        const fallbackFetchOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        };

        try {
          const fallbackResult = await this._executeApiCall({
            url,
            fetchOptions: fallbackFetchOptions,
            extractResponse: (data) =>
              data?.candidates?.[0]?.content?.parts?.[0]?.text,
            context: `${context}-fallback`,
          });

          logger.info('[Gemini] Fallback without thinking config successful:', fallbackResult);
          return fallbackResult;
        } catch (fallbackError) {
          const fallbackErrorDetails = this._parseErrorDetails(fallbackError);
          
          if (this._isQuotaError(fallbackError)) {
            await ErrorHandler.getInstance().handle(fallbackError, {
              context: 'gemini-translation-fallback-quota',
              type: ErrorTypes.QUOTA_EXCEEDED
            });
            throw fallbackError; // Re-throw after handling
          }
          if (this._isRateLimitError(fallbackError)) {
            await ErrorHandler.getInstance().handle(fallbackError, {
              context: 'gemini-translation-fallback-rate-limit',
              type: ErrorTypes.RATE_LIMIT_REACHED
            });
            throw fallbackError; // Re-throw after handling
          }
          
          // Re-throw fallback error with enhanced context
          fallbackError.context = `${this.providerName.toLowerCase()}-translation-fallback`;
          fallbackError.provider = this.providerName;
          throw fallbackError;
        }
      }

      logger.error('[Gemini] Translation failed with error:', error);
      error.context = `${this.providerName.toLowerCase()}-translation`;
      error.provider = this.providerName;
      throw error;
    }
  }

  /**
   * Translate text from image using Gemini Vision
   * @param {string} imageData - Base64 encoded image data
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @returns {Promise<string>} - Translated text
   */
  async translateImage(imageData, sourceLang, targetLang, translateMode) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    const [apiKey, geminiModel] = await Promise.all([
      getApiKeyAsync(),
      getGeminiModelAsync(),
    ]);

    // Build API URL based on selected model
    let apiUrl;
    if (geminiModel === "custom") {
      apiUrl = await getApiUrlAsync();
    } else {
      const modelConfig = CONFIG.GEMINI_MODELS?.find(
        (m) => m.value === geminiModel
      );
      apiUrl = modelConfig?.url || CONFIG.API_URL;
    }

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

    // Extract image format and data
    const imageMatch = imageData.match(/^data:image\/([^;]+);base64,(.+)/);
    if (!imageMatch) {
      throw this._createError(
        "IMAGE_PROCESSING_FAILED",
        "Invalid image data format"
      );
    }

    const [, imageFormat, base64Data] = imageMatch;

    // Prepare request body with image
    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: `image/${imageFormat}`,
                data: base64Data
              }
            }
          ]
        }
      ]
    };

    const url = `${apiUrl}?key=${apiKey}`;
    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    };

    const context = `${this.providerName.toLowerCase()}-image-translation`;
    logger.debug('about to call _executeApiCall for image translation');

    try {
      const result = await this._executeApiCall({
        url,
        fetchOptions,
        extractResponse: (data) =>
          data?.candidates?.[0]?.content?.parts?.[0]?.text,
        context: context,
        abortController: abortController
      });

      logger.info('image translation completed with result:', result
      );
      return result;
    } catch (error) {
      logger.error('image translation failed with error:', error);
      await ErrorHandler.getInstance().handle(error, {
        context: 'gemini-image-translation',
        type: ErrorTypes.TRANSLATION_FAILED
      });
      throw error; // Re-throw after handling
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
