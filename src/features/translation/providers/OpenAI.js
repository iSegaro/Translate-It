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
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";

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
  static optimalBatchSize = 25;
  static maxComplexity = 400;
  static supportsImageTranslation = true;
  
  // Batch processing strategy
  static batchStrategy = 'json'; // Uses JSON format for batch translation

  constructor() {
    super("OpenAI");
  }

  
  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const [apiKey, apiUrl, model] = await Promise.all([
      getOpenAIApiKeyAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    logger.info(`[OpenAI] Using model: ${model || 'gpt-3.5-turbo'}`);
    logger.info(`[OpenAI] Starting translation: ${text.length} chars`);

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

    const result = await this._executeApiCall({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });

    // CRITICAL FIX: Handle single segment JSON arrays properly
    // When we receive ```json\n["translated text"]\n``` or ["translated text"] for single segments, extract the text content
    let processedResult = result;

    if (result && typeof result === 'string') {
      let jsonMatch = null;
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
            logger.debug(`[OpenAI] Single segment JSON array detected, extracting text properly`);
            processedResult = parsed[0];
          }
        } catch (error) {
          logger.debug(`[OpenAI] Failed to parse JSON array, using original result:`, error.message);
        }
      }
    }

    logger.info(`[OpenAI] Translation completed successfully`);
    return processedResult;
  }

  /**
   * Translate text from image using OpenAI Vision
   * @param {string} imageData - Base64 encoded image data
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @returns {Promise<string>} - Translated text
   */
  async translateImage(imageData, sourceLang, targetLang) {
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

    logger.info(`[OpenAI] Starting image translation`);

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

      logger.info(`[OpenAI] Image translation completed successfully`);
      return result;
    } catch (error) {
      // Check if this is a user cancellation (should be handled silently)
      const errorType = matchErrorToType(error);
      if (errorType === ErrorTypes.USER_CANCELLED || errorType === ErrorTypes.TRANSLATION_CANCELLED) {
        // Log user cancellation at debug level only
        logger.debug(`[OpenAI] Image translation cancelled by user`);
        throw error; // Re-throw without ErrorHandler processing
      }

      logger.error('image translation failed with error:', error);
      // Let ErrorHandler automatically detect and handle all error types
      await ErrorHandler.getInstance().handle(error, {
        context: 'openai-image-translation'
      });
      throw error;
    }
  }
}