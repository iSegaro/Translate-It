// src/core/providers/GeminiProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getGeminiApiKeysAsync,
  getGeminiModelAsync,
  getGeminiThinkingEnabledAsync,
  getGeminiApiUrlAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { ApiKeyManager } from "@/features/translation/providers/ApiKeyManager.js";
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
    super(ProviderNames.GEMINI);
    this.providerSettingKey = 'GEMINI_API_KEY';
  }


  /**
   * Get configuration using project's existing config system
   * Uses StorageManager's built-in caching and config.js helpers
   */
  async _getConfig() {
    try {
      // Use project's existing config system with built-in caching
      const [apiKeys, geminiModel, thinkingEnabled, geminiApiUrl] = await Promise.all([
        getGeminiApiKeysAsync(),
        getGeminiModelAsync(),
        getGeminiThinkingEnabledAsync(),
        getGeminiApiUrlAsync(),
      ]);

      // Get first available key
      const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

      // Check if the model is a custom model ("custom" means custom in UI)
      const isCustomModel = geminiModel === 'custom';
      const actualModel = isCustomModel ? null : geminiModel;

      // Configuration loaded successfully
      logger.info(`[Gemini] Using model: ${actualModel || 'custom'}${thinkingEnabled && !isCustomModel ? ' with thinking' : ''}${isCustomModel ? ' (custom API URL)' : ''}`);

      return { apiKey, apiKeys, geminiModel: actualModel, thinkingEnabled, geminiApiUrl, isCustomModel };
    } catch (error) {
      logger.error(`[Gemini] Error loading configuration:`, error);
      throw error;
    }
  }

  /**
   * Single text translation - extracted from original translate method
   */
  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const { apiKey, apiKeys, geminiModel, thinkingEnabled, geminiApiUrl, isCustomModel } = await this._getConfig();

    // Configuration applied for translation
    logger.info(`[Gemini] Starting translation: ${text.length} chars`);

    // Build API URL with enhanced custom model and URL support
    let apiUrl;
    if (isCustomModel) {
      // For custom models, use custom API URL if provided, otherwise fallback to default Gemini endpoint
      apiUrl = geminiApiUrl || CONFIG.GEMINI_API_URL;
    } else {
      // For predefined models, use model-specific URL from config
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

    // Use first key for initial URL
    const url = `${apiUrl}?key=${apiKey}`;
    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    };

    const context = `${this.providerName.toLowerCase()}-translation`;
    // About to call API (logged at TRACE level)

    try {
      // Use failover-enabled API call with updateApiKey callback
      const result = await this._executeApiCallWithFailover({
        url,
        fetchOptions,
        extractResponse: (data) =>
          data?.candidates?.[0]?.content?.parts?.[0]?.text,
        context: context,
        abortController: abortController,
        updateApiKey: (newKey, options) => {
          // For Gemini, the key is in the URL query parameter
          // We need to update the URL with the new key
          const urlObj = new URL(url);
          urlObj.searchParams.set('key', newKey);
          options.url = urlObj.toString();
        }
      });

      // CRITICAL FIX: Handle single segment JSON arrays properly
      // When we receive ```json\n["translated text"]\n``` or ["translated text"] for single segments, extract the text content
      let processedResult = result;

      if (result && typeof result === 'string') {
        let jsonString = null;

        // First try to find JSON array in markdown code blocks
        const markdownMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
        if (markdownMatch) {
          jsonString = markdownMatch[1].trim();
        } else {
          // Try to find direct JSON array (without markdown)
          const directMatch = result.match(/^\s*\[([\s\S]*)\]\s*$/);
          if (directMatch) {
            // Reconstruct the JSON string for parsing
            jsonString = `[${directMatch[1]}]`;
          }
        }

        if (jsonString) {
          try {
            const parsed = JSON.parse(jsonString);

            if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
              logger.debug(`[Gemini] Single segment JSON array detected, extracting text properly`);
              processedResult = parsed[0];
            }
          } catch (error) {
            logger.debug(`[Gemini] Failed to parse JSON array, using original result:`, error.message);
          }
        }
      }

      // API call completed successfully
      logger.info(`[Gemini] Translation completed successfully`);
      return processedResult;
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
      // For predefined models, use model-specific URL from config
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
