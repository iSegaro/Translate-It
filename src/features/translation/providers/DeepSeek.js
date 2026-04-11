// src/core/providers/DeepSeekProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getDeepSeekApiKeysAsync,
  getDeepSeekApiUrlAsync,
  getDeepSeekApiModelAsync,
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { ResponseFormat } from "@/shared/config/translationConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'DeepSeek');

export class DeepSeekProvider extends BaseAIProvider {
  static type = "ai";
  static description = "DeepSeek AI models";
  static displayName = "DeepSeek";
  static reliableJsonMode = true;
  static supportsDictionary = true;

  static supportsStreaming = true; 
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 25;
  static maxComplexity = 400;

  static batchStrategy = 'json';

  constructor() {
    super(ProviderNames.DEEPSEEK);
    this.providerSettingKey = 'DEEPSEEK_API_KEY';
  }

  /**
   * Internal implementation of the DeepSeek API call.
   * @protected
   */
  async _callAI(systemPrompt, userText, options = {}) {
    const { abortController, sessionId, expectedFormat, isBatch } = options;

    const [apiKeys, apiUrl, model] = await Promise.all([
      getDeepSeekApiKeysAsync(),
      getDeepSeekApiUrlAsync(),
      getDeepSeekApiModelAsync(),
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    this._validateConfig({ apiKey }, ["apiKey"], `${this.providerName.toLowerCase()}-translation`);

    const isFirst = await AIConversationHelper.isFirstTurn(sessionId);
    logger.info(`[DeepSeek] Model: ${model || 'deepseek-chat'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${isFirst ? '1' : 'Subsequent'})` : ''}`);

    const { messages } = await AIConversationHelper.getConversationMessages(sessionId, this.providerName, userText, systemPrompt, options.mode);

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "deepseek-chat",
        messages: messages,
        max_tokens: 4096,
        // DeepSeek supports JSON Mode
        ...(expectedFormat === ResponseFormat.JSON_OBJECT && { response_format: { type: "json_object" } })
      }),
    };

    const result = await this._executeRequest({
      url: apiUrl || "https://api.deepseek.com/chat/completions",
      fetchOptions,
      charCount: AITextProcessor.calculatePayloadChars(messages),
      originalCharCount: isBatch ? AITextProcessor.estimateOriginalChars(userText) : userText.length,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
      sessionId,
      updateApiKey: (newKey, options) => {
        options.headers.Authorization = `Bearer ${newKey}`;
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
