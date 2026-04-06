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

  static supportsStreaming = true; 
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 20;
  static maxComplexity = 350;
  static supportsImageTranslation = true; 

  static batchStrategy = 'json';

  constructor() {
    super(ProviderNames.CUSTOM);
    this.providerSettingKey = 'CUSTOM_API_KEY';
  }

  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController, isBatch = false, sessionId = null, originalCharCount = 0, contextMetadata = null) {
    const [apiUrl, apiKeys, model] = await Promise.all([
      getCustomApiUrlAsync(),
      getCustomApiKeysAsync(),
      getCustomApiModelAsync(),
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    this._validateConfig({ apiUrl, apiKey }, ["apiUrl", "apiKey"], `${this.providerName.toLowerCase()}-translation`);

    const { systemPrompt, userText } = await this._preparePromptAndText(text, sourceLang, targetLang, translateMode, sessionId, isBatch, contextMetadata);

    const finalOriginalCharCount = originalCharCount || (isBatch ? this._estimateOriginalCharsFromJson(text) : text.length);

    const isFirst = await this._isFirstTurn(sessionId);
    logger.info(`[Custom] Model: ${model || 'default'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${isFirst ? '1' : 'Subsequent'})` : ''}`);
    logger.debug(`[Custom] Translating ${isBatch ? 'batch' : finalOriginalCharCount + ' chars'}`);

    const { messages } = await this._getConversationMessages(sessionId, this.providerName, userText, systemPrompt, translateMode);

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
      }),
    };

    const result = await this._executeRequest({
      url: apiUrl,
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
      await this._updateSessionHistory(sessionId, userText, result);
    }

    logger.info(`[Custom] Translation completed successfully`);
    return isBatch ? result : this._cleanAIResponse(result);
  }

  _validateConfig(config, requiredFields, context) {
    super._validateConfig(config, requiredFields, context);
  }
}
