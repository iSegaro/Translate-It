// src/core/providers/OpenAIProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getOpenAIApiKeysAsync,
  getOpenAIApiUrlAsync,
  getOpenAIModelAsync,
  getPromptBASEScreenCaptureAsync
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { ResponseFormat } from "@/shared/config/translationConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'OpenAI');

export class OpenAIProvider extends BaseAIProvider {
  static type = "ai";
  static description = "OpenAI's GPT models (GPT-4, GPT-3.5)";
  static displayName = "OpenAI GPT";

  constructor() {
    super(ProviderNames.OPENAI);
    this.providerSettingKey = 'OPENAI_API_KEY';
  }

  /**
   * Internal implementation of the AI API call.
   * @protected
   */
  async _callAI(systemPrompt, userText, options = {}) {
    const { abortController, sessionId, expectedFormat, isBatch } = options;

    const [apiKeys, apiUrl, model] = await Promise.all([
      getOpenAIApiKeysAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    this._validateConfig({ apiKey }, ["apiKey"], `${this.providerName.toLowerCase()}-translation`);

    const turnNumber = await AIConversationHelper.claimNextTurn(sessionId, this.providerName);
    const activeModel = model || "gpt-4o-mini";
    logger.info(`[OpenAI] Model: ${activeModel}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${turnNumber})` : ''}`);

    const { messages } = await AIConversationHelper.getConversationMessages(sessionId, this.providerName, userText, systemPrompt, options.mode);

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: activeModel,
        messages: messages,
        temperature: 0.1,
        max_tokens: 4096,
        // Enforce JSON Mode for both Object and Batch (Array) contracts
        ...((expectedFormat === ResponseFormat.JSON_OBJECT || expectedFormat === ResponseFormat.JSON_ARRAY) && { 
          response_format: { type: "json_object" } 
        })
      }),
    };

    const result = await this._executeRequest({
      url: apiUrl || "https://api.openai.com/v1/chat/completions",
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

  async _translateImageInternal(base64Image, _sourceLang, targetLang, options = {}) {
    const { abortController, sessionId } = options;

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
      charCount: AITextProcessor.calculatePayloadChars(messages),
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-image-translation`,
      abortController,
      sessionId,
      updateApiKey: (newKey, options) => {
        if (options && options.headers) {
          options.headers.Authorization = `Bearer ${newKey}`;
        }
      }
    });
  }
}
