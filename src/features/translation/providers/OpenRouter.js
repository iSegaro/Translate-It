// src/core/providers/OpenRouterProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getOpenRouterApiKeysAsync,
  getOpenRouterApiModelAsync,
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { ResponseFormat } from "@/shared/config/translationConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'OpenRouter');

export class OpenRouterProvider extends BaseAIProvider {
  static type = "ai";
  static description = "OpenRouter Multi-Model API";
  static displayName = "OpenRouter";

  constructor() {
    super(ProviderNames.OPENROUTER);
    this.providerSettingKey = 'OPENROUTER_API_KEY';
  }

  /**
   * Internal implementation of the OpenRouter API call.
   * @protected
   */
  async _callAI(systemPrompt, userText, options = {}) {
    const { abortController, sessionId, expectedFormat, isBatch } = options;

    const [apiKeys, model] = await Promise.all([
      getOpenRouterApiKeysAsync(),
      getOpenRouterApiModelAsync(),
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    this._validateConfig({ apiKey }, ["apiKey"], `${this.providerName.toLowerCase()}-translation`);

    const turnNumber = await AIConversationHelper.claimNextTurn(sessionId, this.providerName);
    logger.info(`[OpenRouter] Model: ${model || 'default'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${turnNumber})` : ''}`);

    const { messages } = await AIConversationHelper.getConversationMessages(sessionId, this.providerName, userText, systemPrompt, options.mode);

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/Translate-It", // Required by OpenRouter
        "X-Title": "Translate-It Extension",
      },
      body: JSON.stringify({
        model: model || "openai/gpt-3.5-turbo",
        messages: messages,
        max_tokens: 4096,
        // Enforce JSON Mode if requested
        ...(expectedFormat === ResponseFormat.JSON_OBJECT && { response_format: { type: "json_object" } })
      }),
    };

    const result = await this._executeRequest({
      url: "https://openrouter.ai/api/v1/chat/completions",
      fetchOptions,
      charCount: fetchOptions.body.length,
      originalCharCount: isBatch ? AITextProcessor.estimateOriginalChars(userText) : userText.length,
      extractResponse: (data) => {
        if (data?.error) {
          const errorMsg = data.error.message || data.error.metadata?.raw || 'Unknown OpenRouter Error';
          throw new Error(`API_ERROR: ${errorMsg}`);
        }
        return data?.choices?.[0]?.message?.content;
      },
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
