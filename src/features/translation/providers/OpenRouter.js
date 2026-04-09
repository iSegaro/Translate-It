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
import { AIConversationHelper } from "./utils/AIConversationHelper.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'OpenRouter');

export class OpenRouterProvider extends BaseAIProvider {
  static type = "ai";
  static description = "OpenRouter API";
  static displayName = "OpenRouter";
  static reliableJsonMode = true;
  static supportsDictionary = true;

  static supportsStreaming = true;
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 25;
  static maxComplexity = 400;
  static supportsImageTranslation = true;

  static batchStrategy = 'json';

  constructor() {
    super(ProviderNames.OPENROUTER);
    this.providerSettingKey = 'OPENROUTER_API_KEY';
  }

  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController, isBatch = false, sessionId = null, originalCharCount = 0, contextMetadata = null) {
    const [apiKeys, model] = await Promise.all([
      getOpenRouterApiKeysAsync(),
      getOpenRouterApiModelAsync(),
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    this._validateConfig({ apiKey }, ["apiKey"], `${this.providerName.toLowerCase()}-translation`);

    const { systemPrompt, userText } = await AIConversationHelper.preparePromptAndText(text, sourceLang, targetLang, translateMode, OpenRouterProvider.type, sessionId, isBatch, contextMetadata);

    const finalOriginalCharCount = originalCharCount || (isBatch ? this._estimateOriginalCharsFromJson(text) : text.length);

    const isFirst = await AIConversationHelper.isFirstTurn(sessionId);
    logger.info(`[OpenRouter] Model: ${model || 'openai/gpt-3.5-turbo'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${isFirst ? '1' : 'Subsequent'})` : ''}`);
    logger.debug(`[OpenRouter] Translating ${isBatch ? 'batch' : finalOriginalCharCount + ' chars'}`);

    const { messages } = await AIConversationHelper.getConversationMessages(sessionId, this.providerName, userText, systemPrompt, translateMode);

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
        max_tokens: 4096,
      }),
    };

    const result = await this._executeRequest({
      url: CONFIG.OPENROUTER_API_URL,
      fetchOptions,
      charCount: this._calculateAIPayloadChars(messages),
      originalCharCount: finalOriginalCharCount,
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

    logger.info(`[OpenRouter] Translation completed successfully`);
    return result;
  }

  _validateConfig(config, requiredFields, context) {
    super._validateConfig(config, requiredFields, context);
  }
}
