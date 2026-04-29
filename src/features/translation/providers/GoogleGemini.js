// src/features/translation/providers/GoogleGemini.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getGeminiApiKeysAsync,
  getGeminiModelAsync,
  getGeminiThinkingEnabledAsync,
  getGeminiApiUrlAsync,
  getPromptBASEScreenCaptureAsync
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { AIConversationHelper } from "./utils/AIConversationHelper.js";
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { ResponseFormat, TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleGemini');

export class GeminiProvider extends BaseAIProvider {
  static type = "ai";
  static description = "Google Gemini AI";
  static displayName = "Google Gemini";

  constructor() {
    super(ProviderNames.GEMINI);
    this.providerSettingKey = 'GEMINI_API_KEY';
  }

  /**
   * Internal implementation of the Gemini API call.
   * @protected
   */
  async _callAI(systemPrompt, userText, options = {}) {
    const { abortController, sessionId, expectedFormat, isBatch } = options;

    const [apiKeys, model, thinkingEnabled, rawApiUrl] = await Promise.all([
      getGeminiApiKeysAsync(),
      getGeminiModelAsync(),
      getGeminiThinkingEnabledAsync(),
      getGeminiApiUrlAsync()
    ]);

    const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

    this._validateConfig({ apiKey }, ["apiKey"], `${this.providerName.toLowerCase()}-translation`);

    const turnNumber = await AIConversationHelper.claimNextTurn(sessionId, this.providerName);
    logger.info(`[Gemini] Model: ${model || 'gemini-1.5-flash'}${sessionId ? ` (Session: ${sessionId.substring(0, 15)}..., Turn: ${turnNumber})` : ''}`);

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
        // Enforce JSON Mode for Structured Data
        ...(expectedFormat === ResponseFormat.JSON_OBJECT && { response_mime_type: "application/json" })
      }
    };

    if (sessionId) {
      // Limit history to last 2 turns with character capping to optimize tokens
      const history = await AIConversationHelper.getConversationHistory(sessionId, options.mode, { 
        maxTurns: 2,
        maxChars: TRANSLATION_CONSTANTS.HISTORY_CHARACTER_LIMITS.AI 
      });
      
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
      }
    }

    let url = apiUrl || CONFIG.GEMINI_API_URL;
    if (!url.includes(':generateContent')) url = `${url}:generateContent`;
    url = `${url}?key=${apiKey}`;

    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    };

    try {
      const result = await this._executeRequest({
        url,
        fetchOptions,
        charCount: fetchOptions.body.length,
        originalCharCount: isBatch ? AITextProcessor.estimateOriginalChars(userText) : userText.length,
        extractResponse: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text,
        context: `${this.providerName.toLowerCase()}-translation`,
        abortController,
        sessionId,
        updateApiKey: (newKey, options) => {
          if (options.url) {
            const urlObj = new URL(options.url);
            urlObj.searchParams.set('key', newKey);
            options.url = urlObj.toString();
          }
        }
      });

      if (sessionId && result) {
        await AIConversationHelper.updateSessionHistory(sessionId, userText, result);
      }

      return result;
    } catch (error) {
      // Thinking config fallback
      if (thinkingEnabled && model?.includes('thinking') && (error.message?.includes('thinking_config') || error.message?.includes('400'))) {
        const retryBody = { ...requestBody };
        delete retryBody.generationConfig.thinking_config;
        const retryBodyJson = JSON.stringify(retryBody);
        return await this._executeRequest({
          url,
          fetchOptions: { ...fetchOptions, body: retryBodyJson },
          charCount: retryBodyJson.length,
          extractResponse: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text,
          context: `${this.providerName.toLowerCase()}-translation-fallback`,
          abortController,
          sessionId,
          updateApiKey: (newKey, options) => {
            if (options.url) {
              const urlObj = new URL(options.url);
              urlObj.searchParams.set('key', newKey);
              options.url = urlObj.toString();
            }
          }        });
      }
      throw error;
    }
  }

  async _translateImageInternal(base64Image, _sourceLang, targetLang, options = {}) {
    const { abortController, sessionId } = options;

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
      charCount: AITextProcessor.calculatePayloadChars(requestBody.contents),
      extractResponse: (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text,
      context: `${this.providerName.toLowerCase()}-image-translation`,
      abortController,
      sessionId,
      updateApiKey: (newKey, options) => {
        if (options.url) {
          const urlObj = new URL(options.url);
          urlObj.searchParams.set('key', newKey);
          options.url = urlObj.toString();
        }
      }    });
  }
}

export default GeminiProvider;
