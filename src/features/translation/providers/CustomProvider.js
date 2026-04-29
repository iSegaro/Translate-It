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
import { AIConversationHelper } from "./utils/AIConversationHelper.js";
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { ResponseFormat } from "@/shared/config/translationConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'Custom');

export class CustomProvider extends BaseAIProvider {
  static type = "ai";
  static description = "Custom OpenAI-compatible API";
  static displayName = "Custom AI";

  constructor() {
    super(ProviderNames.CUSTOM);
    this.providerSettingKey = 'CUSTOM_API_KEY';
  }

  /**
   * Internal implementation of the AI API call.
   * Handles authentication, endpoint resolution, and payload formatting.
   * @protected
   */
  async _callAI(systemPrompt, userText, options = {}) {
    const { abortController, sessionId, expectedFormat, isBatch } = options;

    const [apiUrl, apiKeys, model] = await Promise.all([
      getCustomApiUrlAsync(),
      getCustomApiKeysAsync(),
      getCustomApiModelAsync(),
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    this._validateConfig({ apiUrl, apiKey }, ["apiUrl", "apiKey"], `${this.providerName.toLowerCase()}-translation`);

    const turnNumber = await AIConversationHelper.claimNextTurn(sessionId, this.providerName);
    logger.info(`[Custom] Model: ${model || 'default'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${turnNumber})` : ''}`);

    const { messages } = await AIConversationHelper.getConversationMessages(sessionId, this.providerName, userText, systemPrompt, options.mode);

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 4096,
        // Apply JSON mode if requested by the contract
        ...(expectedFormat === ResponseFormat.JSON_OBJECT && { response_format: { type: "json_object" } })
      }),
    };

    const result = await this._executeRequest({
      url: apiUrl,
      fetchOptions,
      charCount: fetchOptions.body.length,
      originalCharCount: isBatch ? AITextProcessor.estimateOriginalChars(userText) : userText.length,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
      sessionId,
      updateApiKey: (newKey, options) => {
        if (options && options.headers) {
          options.headers.Authorization = `Bearer ${newKey}`;
        }
      }
    });

    if (sessionId && result) {
      await AIConversationHelper.updateSessionHistory(sessionId, userText, result);
    }

    return result;
  }

  _validateConfig(config, requiredFields, context) {
    super._validateConfig(config, requiredFields, context);
  }
}
