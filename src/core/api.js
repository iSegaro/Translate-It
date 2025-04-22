// src/core/api.js
import Browser from "webextension-polyfill";
import {
  CONFIG,
  getApiKeyAsync,
  getUseMockAsync,
  getApiUrlAsync,
  getSourceLanguageAsync,
  getTargetLanguageAsync,
  getTranslationApiAsync,
  getWebAIApiUrlAsync,
  getWebAIApiModelAsync,
  getOpenAIApiKeyAsync,
  getOpenAIApiUrlAsync,
  getOpenAIModelAsync,
  getOpenRouterApiKeyAsync,
  getOpenRouterApiModelAsync,
  state,
  TranslationMode,
  getPromptBASEFieldAsync,
  getPromptBASESelectAsync,
  getPromptPopupTranslateAsync,
  getPromptDictionaryAsync,
  getEnableDictionaryAsync,
} from "../config.js";
import { delay, isExtensionContextValid } from "../utils/helpers.js";
import { buildPrompt } from "../utils/promptBuilder.js";
import { isPersianText } from "../utils/textDetection.js";
import { AUTO_DETECT_VALUE } from "../utils/tts.js";
import { ErrorTypes } from "../services/ErrorTypes.js";

const MOCK_DELAY = 500;
const TEXT_DELIMITER = "\n\n---\n\n";

class ApiService {
  constructor() {
    this.sessionContext = null;
  }

  _isSpecificTextJsonFormat(obj) {
    return (
      Array.isArray(obj) &&
      obj.length > 0 &&
      obj.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof item.text === "string"
      )
    );
  }

  _buildMessagePayload(options) {
    let promptText = "";
    try {
      const bodyObj = JSON.parse(options.fetchOptions.body);
      if (
        bodyObj.contents &&
        Array.isArray(bodyObj.contents) &&
        bodyObj.contents[0].parts
      ) {
        promptText = bodyObj.contents[0].parts[0].text;
      } else if (bodyObj.message) {
        promptText = bodyObj.message;
      } else if (
        bodyObj.messages &&
        Array.isArray(bodyObj.messages) &&
        bodyObj.messages[0].content
      ) {
        promptText = bodyObj.messages[0].content;
      }
    } catch {
      // leave promptText empty
    }
    return {
      promptText,
      sourceLanguage: options.sourceLanguage || AUTO_DETECT_VALUE,
      targetLanguage: options.targetLanguage || AUTO_DETECT_VALUE,
      translationMode: options.translationMode || "",
    };
  }

  /**
   * Executes a fetch call and normalizes HTTP, API-response-invalid, and network errors.
   * @param {Object} params
   * @param {string} params.url - The endpoint URL
   * @param {RequestInit} params.fetchOptions - Fetch options
   * @param {Function} params.extractResponse - Function to extract/transform JSON + status
   * @param {string} params.context - Context for error reporting
   * @returns {Promise<any>} - Transformed result
   * @throws {Error} - With properties: type, statusCode (for HTTP/API), context
   */
  async _executeApiCall({ url, fetchOptions, extractResponse, context }) {
    try {
      const response = await fetch(url, fetchOptions);
      if (!response.ok) {
        // Extract error details if available
        let body = {};
        try {
          body = await response.json();
        } catch {}
        // Use detail or error.message or statusText, fallback to HTTP status
        const msg =
          body.detail ||
          body.error?.message ||
          response.statusText ||
          `HTTP ${response.status}`;
        const err = new Error(msg);
        // Mark as HTTP error (status codes 4xx/5xx)
        err.type = ErrorTypes.HTTP_ERROR;
        err.statusCode = response.status;
        err.context = context;
        throw err;
      }

      // Parse successful response
      const data = await response.json();
      const result = extractResponse(data, response.status);
      if (result === undefined) {
        const err = new Error(ErrorTypes.API_RESPONSE_INVALID);
        err.type = ErrorTypes.API;
        err.statusCode = response.status;
        err.context = context;
        throw err;
      }

      return result;
    } catch (err) {
      // Handle fetch network errors (e.g., offline)
      if (err instanceof TypeError && /NetworkError/.test(err.message)) {
        const networkErr = new Error(err.message);
        networkErr.type = ErrorTypes.NETWORK_ERROR;
        networkErr.context = context;
        throw networkErr;
      }
      // Rethrow existing HTTP/API errors or others
      throw err;
    }
  }

  async handleGeminiTranslation(text, sourceLang, targetLang, translateMode) {
    if (sourceLang === targetLang) return null;

    const [apiKey, apiUrl] = await Promise.all([
      getApiKeyAsync(),
      getApiUrlAsync(),
    ]);

    if (!apiKey) {
      const err = new Error(ErrorTypes.API_KEY_MISSING);
      err.type = ErrorTypes.API_KEY_MISSING;
      err.context = "api-gemini-translation-apikey";
      throw err;
    }
    if (!apiUrl) {
      const err = new Error(ErrorTypes.API_URL_MISSING);
      err.type = ErrorTypes.API_URL_MISSING;
      err.context = "api-gemini-translation-url";
      throw err;
    }

    const prompt = await buildPrompt(
      text,
      sourceLang,
      targetLang,
      translateMode
    );
    const url = `${apiUrl}?key=${apiKey}`;
    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    };

    return this._executeApiCall({
      url,
      fetchOptions,
      extractResponse: (data) =>
        data?.candidates?.[0]?.content?.parts?.[0]?.text,
      context: "api-gemini-translation",
    });
  }

  async handleWebAITranslation(text, sourceLang, targetLang, translateMode) {
    const [apiUrl, apiModel] = await Promise.all([
      getWebAIApiUrlAsync(),
      getWebAIApiModelAsync(),
    ]);

    if (!apiUrl) {
      const err = new Error(ErrorTypes.API_URL_MISSING);
      err.type = ErrorTypes.API;
      err.context = "api-webai-url";
      throw err;
    }
    if (!apiModel) {
      const err = new Error(ErrorTypes.AI_MODEL_MISSING);
      err.type = ErrorTypes.API;
      err.context = "api-webai-model";
      throw err;
    }

    const prompt = await buildPrompt(
      text,
      sourceLang,
      targetLang,
      translateMode
    );
    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        model: apiModel,
        images: [],
        reset_session: this.shouldResetSession(),
      }),
    };

    const result = await this._executeApiCall({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) =>
        typeof data.response === "string" ? data.response : undefined,
      context: "api-webai-translation",
    });

    this.storeSessionContext({ model: apiModel, lastUsed: Date.now() });
    return result;
  }

  async handleOpenAITranslation(text, sourceLang, targetLang, translateMode) {
    const [apiKey, apiUrl, model] = await Promise.all([
      getOpenAIApiKeyAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    if (!apiKey) {
      const err = new Error(ErrorTypes.API_KEY_MISSING);
      err.type = ErrorTypes.API;
      err.context = "api-openai-apikey";
      throw err;
    }
    if (!apiUrl) {
      const err = new Error(ErrorTypes.API_URL_MISSING);
      err.type = ErrorTypes.API;
      err.context = "api-openai-url";
      throw err;
    }

    const prompt = await buildPrompt(
      text,
      sourceLang,
      targetLang,
      translateMode
    );
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      }),
    };

    return this._executeApiCall({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: "api-openai-translation",
    });
  }

  async handleOpenRouterTranslation(
    text,
    sourceLang,
    targetLang,
    translateMode
  ) {
    const [apiKey, model] = await Promise.all([
      getOpenRouterApiKeyAsync(),
      getOpenRouterApiModelAsync(),
    ]);

    if (!apiKey) {
      const err = new Error(ErrorTypes.API_KEY_MISSING);
      err.type = ErrorTypes.API;
      err.context = "api-openrouter-apikey";
      throw err;
    }

    const prompt = await buildPrompt(
      text,
      sourceLang,
      targetLang,
      translateMode
    );
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": Browser.runtime.getURL("/"),
        "X-Title": Browser.runtime.getManifest().name,
      },
      body: JSON.stringify({
        model: model || "openai/gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      }),
    };

    return this._executeApiCall({
      url: CONFIG.OPENROUTER_API_URL,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: "api-openrouter-translation",
    });
  }

  storeSessionContext(ctx) {
    this.sessionContext = { ...ctx, timestamp: Date.now() };
  }

  resetSessionContext() {
    this.sessionContext = null;
  }

  shouldResetSession() {
    return (
      this.sessionContext && Date.now() - this.sessionContext.lastUsed > 300000
    );
  }

  async translateText(text, translateMode, srcLang, tgtLang) {
    if (await getUseMockAsync()) {
      await delay(MOCK_DELAY);
      const sample = text.substring(0, 50);
      return isPersianText(sample) ?
          CONFIG.DEBUG_TRANSLATED_ENGLISH
        : CONFIG.DEBUG_TRANSLATED_PERSIAN;
    }

    if (!isExtensionContextValid()) {
      const err = new Error(ErrorTypes.CONTEXT);
      err.type = ErrorTypes.CONTEXT;
      err.context = "api-translateText-context";
      throw err;
    }

    let [sourceLang, targetLang] = await Promise.all([
      srcLang || getSourceLanguageAsync(),
      tgtLang || getTargetLanguageAsync(),
    ]);

    if (
      sourceLang === targetLang &&
      translateMode !== TranslationMode.Popup_Translate
    ) {
      return null;
    }

    const api = await getTranslationApiAsync();
    switch (api) {
      case "gemini":
        return this.handleGeminiTranslation(
          text,
          sourceLang,
          targetLang,
          translateMode
        );
      case "webai":
        return this.handleWebAITranslation(
          text,
          sourceLang,
          targetLang,
          translateMode
        );
      case "openai":
        return this.handleOpenAITranslation(
          text,
          sourceLang,
          targetLang,
          translateMode
        );
      case "openrouter":
        return this.handleOpenRouterTranslation(
          text,
          sourceLang,
          targetLang,
          translateMode
        );
      default: {
        const err = new Error(ErrorTypes.AI_MODEL_MISSING);
        err.type = ErrorTypes.API;
        err.context = "api-translateText-model";
        throw err;
      }
    }
  }
}

const apiService = new ApiService();
export const translateText = apiService.translateText.bind(apiService);
export const API_TEXT_DELIMITER = TEXT_DELIMITER;
