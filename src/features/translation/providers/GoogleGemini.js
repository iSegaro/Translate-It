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

  /**
   * Batch translate implementation for rate limiting integration
   */
  async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController) {
    logger.debug(`[Gemini] _batchTranslate called with ${texts.length} segments`);
    
    // For Gemini, we process each text individually since it's an AI service
    // Import rate limiting manager
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    
    const results = [];
    
    for (let i = 0; i < texts.length; i++) {
      if (engine && engine.isCancelled(messageId)) {
        throw new Error('Translation cancelled');
      }
      
      try {
        const result = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateSingle(texts[i], sl, tl, translateMode),
          `segment-${i + 1}/${texts.length}`
        );
        
        results.push(result || texts[i]); // Fallback to original if translation fails
      } catch (error) {
        logger.warn(`[Gemini] Segment ${i + 1} failed:`, error);
        results.push(texts[i]); // Fallback to original text
      }
    }
    
    return results;
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

    const prompt = await buildPrompt(
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