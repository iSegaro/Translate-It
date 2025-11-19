// src/core/providers/GeminiProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getApiKeyAsync,
  getGeminiModelAsync,
  getGeminiThinkingEnabledAsync,
  getGeminiApiUrlAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
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
        // Batch translation successful
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
        // Fallback successful
        logger.info(`[Gemini] Fallback completed for ${batch.length} segments`);
        return fallbackResults;
      } catch (fallbackError) {
        // Check if fallback was also cancelled by user
        const fallbackErrorType = matchErrorToType(fallbackError);
        if (fallbackErrorType === ErrorTypes.USER_CANCELLED || fallbackErrorType === ErrorTypes.TRANSLATION_CANCELLED) {
          logger.debug(`[${this.providerName}] Fallback cancelled by user`);
        } else {
          logger.error(`[${this.providerName}] Fallback also failed:`, fallbackError);
        }
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
      const [apiKey, geminiModel, thinkingEnabled, geminiApiUrl] = await Promise.all([
        getApiKeyAsync(),
        getGeminiModelAsync(),
        getGeminiThinkingEnabledAsync(),
        getGeminiApiUrlAsync(),
      ]);

      // Check if the model is a custom model (following Z.AI pattern)
      const isCustomModel = !CONFIG.GEMINI_MODELS?.some(model => model.value === geminiModel && model.value !== 'custom');
      const actualModel = geminiModel || 'gemini-2.5-flash';

      // Configuration loaded successfully
      logger.info(`[Gemini] Using model: ${actualModel}${thinkingEnabled ? ' with thinking' : ''}${isCustomModel ? ' (custom)' : ''}`);

      return { apiKey, geminiModel: actualModel, thinkingEnabled, geminiApiUrl, isCustomModel };
    } catch (error) {
      logger.error(`[Gemini] Error loading configuration:`, error);
      throw error;
    }
  }

  /**
   * Single text translation - extracted from original translate method
   */
  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const { apiKey, geminiModel, thinkingEnabled, geminiApiUrl, isCustomModel } = await this._getConfig();

    // Configuration applied for translation
    logger.info(`[Gemini] Starting translation: ${text.length} chars`);

    // Build API URL with enhanced custom model and URL support
    let apiUrl;
    if (isCustomModel) {
      // For custom models, use custom API URL if provided, otherwise fallback to default Gemini endpoint
      apiUrl = geminiApiUrl || CONFIG.GEMINI_API_URL;
    } else {
      // For predefined models, use hardcoded URL from model config
      const modelConfig = CONFIG.GEMINI_MODELS?.find(
        (m) => m.value === geminiModel
      );
      apiUrl = modelConfig?.url || CONFIG.GEMINI_API_URL;
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
    // About to call API (logged at TRACE level)

    try {
      const result = await this._executeApiCall({
        url,
        fetchOptions,
        extractResponse: (data) =>
          data?.candidates?.[0]?.content?.parts?.[0]?.text,
        context: context,
        abortController: abortController
      });

      // API call completed successfully
      logger.info(`[Gemini] Translation completed successfully`);
      return result;
    } catch (error) {
      // Check if this is a user cancellation (should be handled silently)
      const errorType = matchErrorToType(error);
      if (errorType === ErrorTypes.USER_CANCELLED || errorType === ErrorTypes.TRANSLATION_CANCELLED) {
        // Log user cancellation at debug level only
        logger.debug(`[Gemini] Translation cancelled by user`);
        throw error; // Re-throw without ErrorHandler processing
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

          // Fallback without thinking config successful
          return fallbackResult;
        } catch (fallbackError) {
          // Check if fallback was also cancelled by user
          const fallbackErrorType = matchErrorToType(fallbackError);
          if (fallbackErrorType === ErrorTypes.USER_CANCELLED || fallbackErrorType === ErrorTypes.TRANSLATION_CANCELLED) {
            logger.debug(`[Gemini] Translation fallback cancelled by user`);
            throw fallbackError;
          }

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
  async translateImage(imageData, sourceLang, targetLang) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    const { apiKey, geminiModel, geminiApiUrl, isCustomModel } = await this._getConfig();

    // Build API URL with enhanced custom model and URL support
    let apiUrl;
    if (isCustomModel) {
      // For custom models, use custom API URL if provided, otherwise fallback to default Gemini endpoint
      apiUrl = geminiApiUrl || CONFIG.GEMINI_API_URL;
    } else {
      // For predefined models, use hardcoded URL from model config
      const modelConfig = CONFIG.GEMINI_MODELS?.find(
        (m) => m.value === geminiModel
      );
      apiUrl = modelConfig?.url || CONFIG.GEMINI_API_URL;
    }

    // Validate configuration
    this._validateConfig(
      { apiKey, apiUrl },
      ["apiKey", "apiUrl"],
      `${this.providerName.toLowerCase()}-image-translation`
    );

    // translateImage called
    logger.info(`[Gemini] Starting image translation`);

    // Build prompt for screen capture translation
    const basePrompt = await getPromptBASEScreenCaptureAsync();
    const prompt = basePrompt
      .replace(/\$_\{TARGET\}/g, targetLang)
      .replace(/\$_\{SOURCE\}/g, sourceLang);

    // Prompt built for image translation

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
    // About to call API for image translation

    try {
      const result = await this._executeApiCall({
        url,
        fetchOptions,
        extractResponse: (data) =>
          data?.candidates?.[0]?.content?.parts?.[0]?.text,
        context: context,
        // abortController: abortController
      });

      // Image translation completed successfully
      logger.info(`[Gemini] Image translation completed successfully`);
      return result;
    } catch (error) {
      // Check if this is a user cancellation (should be handled silently)
      const errorType = matchErrorToType(error);
      if (errorType === ErrorTypes.USER_CANCELLED || errorType === ErrorTypes.TRANSLATION_CANCELLED) {
        // Log user cancellation at debug level only
        logger.debug(`[Gemini] Image translation cancelled by user`);
        throw error; // Re-throw without ErrorHandler processing
      }

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
