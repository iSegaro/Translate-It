// src/features/translation/providers/GoogleGemini.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getGeminiApiKeysAsync,
  getGeminiModelAsync,
  getGeminiThinkingEnabledAsync,
  getGeminiApiUrlAsync,
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleGemini');

import { getPromptBASEScreenCaptureAsync } from "@/shared/config/config.js";

export class GeminiProvider extends BaseAIProvider {
  static type = "ai";
  static description = "Google Gemini AI";
  static displayName = "Google Gemini";
  static reliableJsonMode = true;
  static supportsDictionary = true;

  static supportsStreaming = true;
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 30;
  static maxComplexity = 500;
  static supportsImageTranslation = true;

  static batchStrategy = 'json';

  constructor() {
    super(ProviderNames.GEMINI);
    this.providerSettingKey = 'GEMINI_API_KEY';
  }

  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController, isBatch = false, sessionId = null, originalCharCount = 0, contextMetadata = null) {
    const [apiKeys, model, thinkingEnabled, rawApiUrl] = await Promise.all([
      getGeminiApiKeysAsync(),
      getGeminiModelAsync(),
      getGeminiThinkingEnabledAsync(),
      getGeminiApiUrlAsync()
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    this._validateConfig(
      { apiKey },
      ["apiKey"],
      `${this.providerName.toLowerCase()}-translation`
    );

    const { systemPrompt, userText } = await AIConversationHelper.preparePromptAndText(text, sourceLang, targetLang, translateMode, GeminiProvider.type, sessionId, isBatch, contextMetadata);

    const isFirst = await AIConversationHelper.isFirstTurn(sessionId);
    logger.info(`[Gemini] Model: ${model || 'gemini-1.5-flash'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${isFirst ? '1' : 'Subsequent'})` : ''}`);
    logger.debug(`[Gemini] Translating ${isBatch ? 'batch' : text.length + ' chars'}`);

    const requestBody = {
      contents: [{
        parts: [{ text: userText }]
      }],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192, 
        ...(isBatch && { response_mime_type: "application/json" })
      }
    };

    if (sessionId) {
      const history = await AIConversationHelper.getConversationHistory(sessionId, translateMode);
      if (history.length > 0) {
        const contents = [];
        for (const turn of history) {
          contents.push({ role: 'user', parts: [{ text: turn.user }] });
          contents.push({ role: 'model', parts: [{ text: turn.assistant }] });
        }
        contents.push({ role: 'user', parts: [{ text: userText }] });
        requestBody.contents = contents;
      }
    }

    if (thinkingEnabled && model?.includes('thinking')) {
      requestBody.generationConfig.thinking_config = {
        include_thoughts: false
      };
    }

    let apiUrl = rawApiUrl;
    const isStandardGoogleUrl = !rawApiUrl || 
                                rawApiUrl.includes('generativelanguage.googleapis.com') || 
                                rawApiUrl === CONFIG.GEMINI_API_URL;

    if (isStandardGoogleUrl && model && CONFIG.GEMINI_MODELS) {
      const modelConfig = CONFIG.GEMINI_MODELS.find(m => m.value === model);
      if (modelConfig?.url) {
        apiUrl = modelConfig.url;
        logger.debug(`[Gemini] Using specific Google endpoint for model ${model}`);
      }
    }

    let url = apiUrl || CONFIG.GEMINI_API_URL;
    if (!url.includes(':generateContent')) {
      url = `${url}:generateContent`;
    }
    url = `${url}?key=${apiKey}`;

    const context = `${this.providerName.toLowerCase()}-translation`;

    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    };

    const charCount = this._calculateAIPayloadChars([...requestBody.contents, requestBody.systemInstruction]);
    const finalOriginalCharCount = originalCharCount || (isBatch ? this._estimateOriginalCharsFromJson(text) : text.length);

    try {
      const result = await this._executeRequest({
        url,
        fetchOptions,
        charCount,
        originalCharCount: finalOriginalCharCount,
        extractResponse: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text,
        context,
        abortController,
        sessionId,
        updateApiKey: (newKey, options) => {
          const urlObj = new URL(options.url);
          urlObj.searchParams.set('key', newKey);
          options.url = urlObj.toString();
        }
      });

      if (sessionId && result) {
        await AIConversationHelper.updateSessionHistory(sessionId, userText, result);
      }

      logger.info(`[Gemini] Translation completed successfully`);
      return result;
    } catch (error) {
      if (thinkingEnabled && model?.includes('thinking') && (error.message?.includes('thinking_config') || error.message?.includes('400'))) {
        const retryBody = { ...requestBody };
        delete retryBody.generationConfig.thinking_config;
        return await this._executeRequest({
          url,
          fetchOptions: { ...fetchOptions, body: JSON.stringify(retryBody) },
          charCount,
          extractResponse: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text,
          context: `${context}-fallback`,
          abortController,
          sessionId,
          updateApiKey: (newKey, options) => {
            const urlObj = new URL(options.url);
            urlObj.searchParams.set('key', newKey);
            options.url = urlObj.toString();
          }
        });
      }
      throw error;
    }
  }

  async translateImage(base64Image, _sourceLang, targetLang) {
    const [apiKeys, model, rawApiUrl, promptBase] = await Promise.all([
      getGeminiApiKeysAsync(),
      getGeminiModelAsync(),
      getGeminiApiUrlAsync(),
      getPromptBASEScreenCaptureAsync()
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';
    const systemPrompt = promptBase.replace("{targetLanguage}", targetLang);

    let apiUrl = rawApiUrl;
    const isStandardGoogleUrl = !rawApiUrl || rawApiUrl.includes('generativelanguage.googleapis.com') || rawApiUrl === CONFIG.GEMINI_API_URL;

    if (isStandardGoogleUrl && model && CONFIG.GEMINI_MODELS) {
      const modelConfig = CONFIG.GEMINI_MODELS.find(m => m.value === model);
      if (modelConfig?.url) apiUrl = modelConfig.url;
    }

    const requestBody = {
      contents: [{
        parts: [{ text: systemPrompt }, { inline_data: { mime_type: "image/png", data: base64Image } }]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    };

    let url = apiUrl || CONFIG.GEMINI_API_URL;
    if (!url.includes(':generateContent')) url = `${url}:generateContent`;
    url = `${url}?key=${apiKey}`;

    const fetchOptions = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) };

    return await this._executeRequest({
      url,
      fetchOptions,
      charCount: this._calculateAIPayloadChars(requestBody.contents),
      extractResponse: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text,
      context: `${this.providerName.toLowerCase()}-image-translation`,
      updateApiKey: (newKey, options) => {
        const urlObj = new URL(options.url);
        urlObj.searchParams.set('key', newKey);
        options.url = urlObj.toString();
      }
    });
  }

  _createError(type, message) {
    const error = new Error(message);
    error.type = type;
    error.context = `${this.providerName.toLowerCase()}-provider`;
    return error;
  }
}

export default GeminiProvider;
