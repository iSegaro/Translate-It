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
// import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
// import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
// import { MessageFormat } from "@/shared/messaging/core/MessagingCore.js";
// import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
// import browser from "webextension-polyfill";

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
  
  // Batch processing strategy
  static batchStrategy = 'json'; // Uses JSON format for batch translation

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
   * @param {object} engine - Translation engine instance (optional)
   * @param {string} messageId - Message ID (optional)
   * @returns {Promise<string[]>} - Translated texts
   */
  async _translateBatch(batch, sourceLang, targetLang, translateMode, abortController, engine = null, messageId = null) {
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
      logger.warn(`[${this.providerName}] Batch translation failed, trying fallback:`, error);
      
      // Try fallback, but if that fails too, throw the original error
      try {
        const fallbackResults = await this._fallbackSingleRequests(batch, sourceLang, targetLang, translateMode, engine, messageId, abortController);
        logger.info(`[${this.providerName}] Fallback successful for ${batch.length} segments`);
        return fallbackResults;
      } catch (fallbackError) {
        logger.error(`[${this.providerName}] Fallback also failed:`, fallbackError);
        // Throw the original batch error, not fallback error, for better context
        throw error;
      }
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
    // Preserve empty lines to maintain formatting for AI responses
    const lines = result.split('\\n');
    
    // Filter out completely empty lines only if we have too many lines
    if (lines.length > expectedCount) {
      const nonEmptyLines = lines.filter(line => line.trim() !== '');
      if (nonEmptyLines.length === expectedCount) {
        return nonEmptyLines;
      }
    }
    
    // If line count matches, return as-is (preserving formatting)
    if (lines.length === expectedCount) {
      return lines;
    }
    
    // If all else fails, return the original texts for this batch
    return originalBatch;
  }




  /**
   * Get configuration using project's existing config system
   * Uses StorageManager's built-in caching and config.js helpers
   */
  async _getConfig() {
    try {
      // Use project's existing config system with built-in caching
      const [apiKey, geminiModel, thinkingEnabled] = await Promise.all([
        getApiKeyAsync(),
        getGeminiModelAsync(),
        getGeminiThinkingEnabledAsync(),
      ]);
      
      logger.debug(`[Gemini] Configuration loaded:`, {
        apiKeyPresent: !!apiKey,
        apiKeyLength: apiKey ? apiKey.length : 0,
        geminiModel,
        thinkingEnabled
      });
      
      return { apiKey, geminiModel, thinkingEnabled };
    } catch (error) {
      logger.error(`[Gemini] Error loading configuration:`, error);
      throw error;
    }
  }

  /**
   * Single text translation - extracted from original translate method
   */
  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const { apiKey, geminiModel, thinkingEnabled } = await this._getConfig();

    // Detailed logging for debugging
    logger.debug(`[Gemini] Using configuration for translation:`, {
      apiKeyPresent: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      geminiModel,
      thinkingEnabled,
      text: text.substring(0, 50) + (text.length > 50 ? '...' : '')
    });

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
          // Let ErrorHandler automatically detect and handle all error types including quota/rate limits
          await ErrorHandler.getInstance().handle(fallbackError, {
            context: 'gemini-translation-fallback'
          });
          
          // Re-throw fallback error with enhanced context
          fallbackError.context = `${this.providerName.toLowerCase()}-translation-fallback`;
          fallbackError.provider = this.providerName;
          throw fallbackError;
        }
      }

      // Let ErrorHandler automatically detect and handle all error types including quota/rate limits
      await ErrorHandler.getInstance().handle(error, {
        context: 'gemini-translation'
      });
      
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

    const { apiKey, geminiModel } = await this._getConfig();

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
        // abortController: abortController
      });

      logger.info('image translation completed with result:', result);
      return result;
    } catch (error) {
      logger.error('image translation failed with error:', error);
      // Let ErrorHandler automatically detect and handle all error types
      await ErrorHandler.getInstance().handle(error, {
        context: 'gemini-image-translation'
      });
      throw error;
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
