// src/core/providers/CustomProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getCustomApiUrlAsync,
  getCustomApiKeysAsync,
  getCustomApiModelAsync,
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'Custom');

export class CustomProvider extends BaseAIProvider {
  static type = "ai";
  static description = "Custom OpenAI-compatible API";
  static displayName = "Custom AI";
  static reliableJsonMode = true;
  static supportsDictionary = true;

  // AI Provider capabilities - Generic settings for compatible APIs
  static supportsStreaming = true; // Most compatible APIs support streaming
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 20;
  static maxComplexity = 350;
  static supportsImageTranslation = true; // Often supported in newer compatible APIs

  // Batch processing strategy
  static batchStrategy = 'json'; // Uses JSON format for batch translation

  constructor() {
    super(ProviderNames.CUSTOM);
    this.providerSettingKey = 'CUSTOM_API_KEY';
  }


  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController, sessionId = null, isBatch = false) {
    const [apiUrl, apiKeys, model] = await Promise.all([
      getCustomApiUrlAsync(),
      getCustomApiKeysAsync(),
      getCustomApiModelAsync(),
    ]);

    // Get first available key
    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    // Validate configuration
    this._validateConfig(
      { apiUrl, apiKey },
      ["apiUrl", "apiKey"],
      `${this.providerName.toLowerCase()}-translation`
    );

    // Build base prompt using explicit isBatch flag
    const { systemPrompt, userText } = await this._preparePromptAndText(text, sourceLang, targetLang, translateMode, sessionId, isBatch);

    // Simple logging
    const isFirst = await this._isFirstTurn(sessionId);
    logger.info(`[Custom] Model: ${model || 'default'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${isFirst ? '1' : 'Subsequent'})` : ''}`);
    logger.debug(`[Custom] Translating ${isBatch ? 'batch' : text.length + ' chars'}`);

    // Get messages with conversation history
    const { messages } = await this._getConversationMessages(sessionId, this.providerName, userText, systemPrompt, translateMode);

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model, // مدل باید توسط کاربر مشخص شود
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

    logger.info(`[Custom] Translation completed successfully`);
    return this._cleanAIResponse(result);
  }

  /**
   * AI-specific validation for custom providers
   */
  _validateConfig(config, requiredFields, context) {
    super._validateConfig(config, requiredFields, context);
  }
}
