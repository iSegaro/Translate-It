// src/core/providers/GeminiProvider.js
import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
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

// Custom Error for Quota Exceeded
class QuotaExceededError extends Error {
  constructor(originalError) {
    super('Gemini API quota exceeded');
    this.type = 'QUOTA_EXCEEDED';
    this.provider = 'Gemini';
    this.originalError = originalError;
    this.suggestedProviders = ['BingTranslate', 'OpenAI'];
    this.userMessage = 'Gemini API quota finished. Try switching to Bing for better performance.';
  }
}

export class GeminiProvider extends BaseProvider {
  static type = "ai";
  static description = "Google Gemini AI";
  static displayName = "Google Gemini";
  static reliableJsonMode = false;
  static supportsDictionary = true;
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

  async translate(text, sl, tl, translateMode) {
    return this._translateSingle(text, sl, tl, translateMode);
  }

  async _translateBatch(textBatch, sourceLang, targetLang, translateMode) {
    const batchPrompt = this._buildBatchPrompt(textBatch, sourceLang, targetLang);
    
    // Use _translateSingle to send the batch prompt
    const result = await this._translateSingle(batchPrompt, sourceLang, targetLang, translateMode);
    
    return this._parseBatchResult(result, textBatch.length, textBatch);
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

  async _fallbackSingleRequests(batch, sl, tl, translateMode, engine, messageId, rateLimitManager) {
    const results = [];
    for (let i = 0; i < batch.length; i++) {
      if (engine && engine.isCancelled(messageId)) {
        throw new Error('Translation cancelled during fallback');
      }
      try {
        const result = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateSingle(batch[i], sl, tl, translateMode),
          `fallback-segment-${i + 1}/${batch.length}`
        );
        results.push(result || batch[i]);
      } catch (error) {
        logger.warn(`[Gemini] Fallback segment ${i + 1} failed:`, error);
        if (this._isQuotaError(error) || error.type === 'QUOTA_EXCEEDED') {
          throw new QuotaExceededError(error); // Propagate quota error
        }
        results.push(batch[i]); // Fallback to original text
      }
    }
    return results;
  }

  _isQuotaError(error) {
    return error.message && (
      error.message.includes('quota') ||
      error.message.includes('limit exceeded') ||
      error.message.includes('429') ||
      error.message.includes('RESOURCE_EXHAUSTED')
    );
  }


  /**
   * Single text translation - extracted from original translate method
   */
  async _translateSingle(text, sourceLang, targetLang, translateMode) {
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
      });

      logger.info('_executeApiCall completed with result:', result);
      return result;
    } catch (error) {
      if (this._isQuotaError(error)) {
        throw new QuotaExceededError(error);
      }
      
      // If thinking-related error occurs, retry without thinking config
      if (
        error.message &&
        error.message.includes("thinkingBudget") &&
        requestBody.generationConfig?.thinkingConfig
      ) {
        logger.debug('thinking parameter not supported, retrying without thinking...');

        // Remove thinking config and retry
        delete requestBody.generationConfig;
        const fallbackFetchOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        };

        const fallbackResult = await this._executeApiCall({
          url,
          fetchOptions: fallbackFetchOptions,
          extractResponse: (data) =>
            data?.candidates?.[0]?.content?.parts?.[0]?.text,
          context: `${context}-fallback`,
        });

        logger.info('fallback _executeApiCall completed with result:', fallbackResult);
        return fallbackResult;
      }

      logger.error('_executeApiCall failed with error:', error);
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

  /**
   * Create error with proper type
   * @param {string} type - Error type
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
