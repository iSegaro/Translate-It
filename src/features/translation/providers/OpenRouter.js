// src/core/providers/OpenRouterProvider.js
import browser from 'webextension-polyfill';
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getOpenRouterApiKeysAsync,
  getOpenRouterApiModelAsync,
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'OpenRouter');

export class OpenRouterProvider extends BaseAIProvider {
  static type = "ai";
  static description = "OpenRouter API";
  static displayName = "OpenRouter";
  static reliableJsonMode = true;
  static supportsDictionary = true;

  // AI Provider capabilities - Flexible settings for multi-model support
  static supportsStreaming = true;
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 25;
  static maxComplexity = 400;
  static supportsImageTranslation = true; // Depends on selected model

  // Batch processing strategy
  static batchStrategy = 'json'; // Uses JSON format for batch translation

  constructor() {
    super(ProviderNames.OPENROUTER);
    this.providerSettingKey = 'OPENROUTER_API_KEY';
  }


  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController, sessionId = null, isBatch = false) {
    const [apiKeys, model] = await Promise.all([
      getOpenRouterApiKeysAsync(),
      getOpenRouterApiModelAsync(),
    ]);

    // Get first available key
    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    // Validate configuration
    this._validateConfig(
      { apiKey },
      ["apiKey"],
      `${this.providerName.toLowerCase()}-translation`
    );

    // Build base prompt using explicit isBatch flag
    const { systemPrompt, userText } = await this._preparePromptAndText(text, sourceLang, targetLang, translateMode, sessionId, isBatch);

    // Simple logging
    const isFirst = await this._isFirstTurn(sessionId);
    logger.info(`[OpenRouter] Model: ${model || 'openai/gpt-3.5-turbo'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${isFirst ? '1' : 'Subsequent'})` : ''}`);
    logger.debug(`[OpenRouter] Translating ${isBatch ? 'batch' : text.length + ' chars'}`);

    // Get conversation history
    const { messages } = await this._getConversationMessages(sessionId, this.providerName, userText, systemPrompt, translateMode);

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": browser.runtime.getURL("/"),
        "X-Title": browser.runtime.getManifest().name,
      },
      body: JSON.stringify({
        model: model || "openai/gpt-3.5-turbo",
        messages: messages,
      }),
    };

    // Use unified API request handler
    const result = await this._executeRequest({
      url: CONFIG.OPENROUTER_API_URL,
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

    logger.info(`[OpenRouter] Translation completed successfully`);
    return this._cleanAIResponse(result);
  }

  /**
   * AI-specific validation for OpenRouter
   */
  _validateConfig(config, requiredFields, context) {
    super._validateConfig(config, requiredFields, context);
  }
}
