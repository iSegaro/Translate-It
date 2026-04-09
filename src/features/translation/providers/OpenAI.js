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
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'OpenAI');

export class OpenAIProvider extends BaseAIProvider {
  static type = "ai";
  static description = "OpenAI GPT models";
  static displayName = "OpenAI";
  static reliableJsonMode = true;
  static supportsDictionary = true;

  static supportsStreaming = true; 
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 25;
  static maxComplexity = 400;
  static supportsImageTranslation = true;

  static batchStrategy = 'json';

  constructor() {
    super(ProviderNames.OPENAI);
    this.providerSettingKey = 'OPENAI_API_KEY';
  }

  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController, isBatch = false, sessionId = null, originalCharCount = 0, contextMetadata = null) {
    const [apiKeys, apiUrl, model] = await Promise.all([
      getOpenAIApiKeysAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    this._validateConfig({ apiKey }, ["apiKey"], `${this.providerName.toLowerCase()}-translation`);

    const { systemPrompt, userText } = await AIConversationHelper.preparePromptAndText(text, sourceLang, targetLang, translateMode, OpenAIProvider.type, sessionId, isBatch, contextMetadata);

    const finalOriginalCharCount = originalCharCount || (isBatch ? this._estimateOriginalCharsFromJson(text) : text.length);

    const isFirst = await AIConversationHelper.isFirstTurn(sessionId);
    logger.info(`[OpenAI] Model: ${model || 'gpt-3.5-turbo'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${isFirst ? '1' : 'Subsequent'})` : ''}`);
    logger.debug(`[OpenAI] Translating ${isBatch ? 'batch' : finalOriginalCharCount + ' chars'}`);

    const { messages } = await AIConversationHelper.getConversationMessages(sessionId, this.providerName, userText, systemPrompt, translateMode);

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-3.5-turbo",
        messages: messages,
        max_tokens: 4096,
        ...(isBatch && { response_format: { type: "json_object" } })
      }),
    };

    const result = await this._executeRequest({
      url: apiUrl || "https://api.openai.com/v1/chat/completions",
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

    logger.info(`[OpenAI] Translation completed successfully`);
    return result;
  }

  _validateConfig(config, requiredFields, context) {
    super._validateConfig(config, requiredFields, context);
  }

  async translateImage(base64Image, _sourceLang, targetLang) {
    const [apiKeys, apiUrl, model, promptBase] = await Promise.all([
      getOpenAIApiKeysAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
      getPromptBASEScreenCaptureAsync()
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';
    const systemPrompt = promptBase.replace("{targetLanguage}", targetLang);

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: systemPrompt },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64Image}` }
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
        model: model || "gpt-4-vision-preview",
        messages: messages,
        max_tokens: 1000
      }),
    };

    return await this._executeRequest({
      url: apiUrl,
      fetchOptions,
      charCount: this._calculateAIPayloadChars(messages),
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-image-translation`,
      updateApiKey: (newKey, options) => {
        options.headers.Authorization = `Bearer ${newKey}`;
      }
    });
  }
}
