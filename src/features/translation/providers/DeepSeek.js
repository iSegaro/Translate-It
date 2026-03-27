// src/core/providers/DeepSeekProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getDeepSeekApiKeysAsync,
  getDeepSeekApiModelAsync,
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'DeepSeek');

export class DeepSeekProvider extends BaseAIProvider {
  static type = "ai";
  static description = "DeepSeek AI";
  static displayName = "DeepSeek";
  static reliableJsonMode = false;
  static supportsDictionary = true;

  // AI Provider capabilities - Conservative settings for DeepSeek
  static supportsStreaming = true; // Enable streaming for segment-based real-time translation
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 25;
  static maxComplexity = 400;
  static supportsImageTranslation = false;

  // Batch processing strategy
  static batchStrategy = 'json'; // Uses JSON format for batch translation

  constructor() {
    super(ProviderNames.DEEPSEEK);
    this.providerSettingKey = 'DEEPSEEK_API_KEY';
  }


  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController, sessionId = null, isBatch = false) {
    const [apiKeys, model] = await Promise.all([
      getDeepSeekApiKeysAsync(),
      getDeepSeekApiModelAsync(),
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
    logger.info(`[DeepSeek] Model: ${model || 'deepseek-chat'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${isFirst ? '1' : 'Subsequent'})` : ''}`);
    logger.debug(`[DeepSeek] Translating ${isBatch ? 'batch' : text.length + ' chars'}`);

    // Get messages with conversation history
    const { messages } = await this._getConversationMessages(sessionId, this.providerName, userText, systemPrompt, translateMode);

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "deepseek-chat",
        messages: messages,
        stream: false,
      }),
    };

    // Use unified API request handler
    const result = await this._executeRequest({
      url: CONFIG.DEEPSEEK_API_URL,
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

    logger.info(`[DeepSeek] Translation completed successfully`);
    return this._cleanAIResponse(result);
  }

  /**
   * AI-specific validation for DeepSeek
   */
  _validateConfig(config, requiredFields, context) {
    super._validateConfig(config, requiredFields, context);
  }
}
