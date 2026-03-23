// src/core/providers/OpenAIProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getOpenAIApiKeysAsync,
  getOpenAIApiUrlAsync,
  getOpenAIModelAsync,
} from "@/shared/config/config.js";
import { getPromptBASEScreenCaptureAsync } from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";

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
    super(ProviderNames.OPENAI);
    this.providerSettingKey = 'OPENAI_API_KEY';
  }


  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController, sessionId = null, isBatch = false) {
    const [apiKeys, apiUrl, model] = await Promise.all([
      getOpenAIApiKeysAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    // Get first available key
    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    // Validate configuration
    this._validateConfig(
      { apiKey, apiUrl },
      ["apiKey", "apiUrl"],
      `${this.providerName.toLowerCase()}-translation`
    );

    // Build base prompt using explicit isBatch flag
    const { systemPrompt, userText } = await this._preparePromptAndText(text, sourceLang, targetLang, translateMode, sessionId, isBatch);

    // Simple logging
    const isFirst = await this._isFirstTurn(sessionId);
    logger.info(`[OpenAI] Model: ${model || 'gpt-3.5-turbo'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${isFirst ? '1' : 'Subsequent'})` : ''}`);
    logger.debug(`[OpenAI] Translating ${isBatch ? 'batch' : text.length + ' chars'}`);

    // Get messages with conversation history
    const { messages } = await this._getConversationMessages(sessionId, this.providerName, userText, systemPrompt, translateMode);

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-3.5-turbo",
        messages: messages,
      }),
    };

    // Use unified API request handler
    const result = await this._executeRequest({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
      updateApiKey: (newKey, options) => {
        options.headers.Authorization = `Bearer ${newKey}`;
      }
    });

    // Update session history
    if (sessionId && result) {
      await this._updateSessionHistory(sessionId, userText, result);
    }

    return this._cleanAIResponse(result);
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

    const [apiKeys, apiUrl, model] = await Promise.all([
      getOpenAIApiKeysAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    // Get first available key
    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

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

    // Prepare message with image
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageData } }
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

    try {
      const result = await this._executeRequest({
        url: apiUrl,
        fetchOptions,
        extractResponse: (data) => data?.choices?.[0]?.message?.content,
        context: context,
        updateApiKey: (newKey, options) => {
          options.headers.Authorization = `Bearer ${newKey}`;
        }
      });

      logger.info(`[OpenAI] Image translation completed successfully`);
      return result;
    } catch (error) {
      // Errors are already handled and logged by _executeRequest
      throw error;
    }
  }
}