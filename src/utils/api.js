// src/utils/api.js
import {
  CONFIG,
  TRANSLATION_ERRORS,
  getApiKeyAsync,
  getUseMockAsync,
  getApiUrlAsync,
  getSourceLanguageAsync,
  getTargetLanguageAsync,
  getPromptAsync,
  getTranslationApiAsync,
  getWebAIApiUrlAsync,
  getWebAIApiModelAsync,
  getOpenAIApiKeyAsync,
  getOpenAIApiUrlAsync,
  getOpenAIModelAsync,
  getOpenRouterApiKeyAsync,
  getOpenRouterApiModelAsync,
} from "../config.js";
import { delay, isExtensionContextValid } from "./helpers.js";
import { isPersianText } from "./textDetection.js";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";
import { logMethod } from "./helpers.js";

const MOCK_DELAY = 500;

class ApiService {
  constructor() {
    this.errorHandler = new ErrorHandler();
    this.sessionContext = null;
  }

  async createPrompt(text, sourceLang, targetLang) {
    const promptTemplate = await getPromptAsync();
    return promptTemplate
      .replace(/\${SOURCE}/g, sourceLang)
      .replace(/\${TARGET}/g, targetLang)
      .replace(/\${TEXT}/g, text);
  }

  @logMethod
  async handleGeminiTranslation(text, sourceLang, targetLang) {
    if (sourceLang === targetLang) return null;

    const [apiKey, apiUrl] = await Promise.all([
      getApiKeyAsync(),
      getApiUrlAsync(),
    ]);

    if (!apiKey) {
      const error = new Error(TRANSLATION_ERRORS.API_KEY_MISSING);
      await this.errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 601,
        context: "api-gemini-translation-apikey",
      });
      return;
    }

    if (!apiUrl) {
      const error = new Error(TRANSLATION_ERRORS.API_URL_MISSING);
      await this.errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 602,
        context: "api-gemini-translation-apiurl",
      });
      return;
    }

    try {
      const prompt = await this.createPrompt(text, sourceLang, targetLang);
      const response = await fetch(`${apiUrl}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        const error = new Error(errorMessage);
        await this.errorHandler.handle(error, {
          type: ErrorTypes.API || 500,
          statusCode: response.status,
          context: "api-gemini-translation-response",
        });
        return;
      }

      const data = await response.json();

      if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const error = new Error("Invalid Gemini response format");
        await this.errorHandler.handle(error, {
          type: ErrorTypes.API,
          statusCode: response.status || 500,
          context: "api-gemini-translation-format",
        });
        return;
      }

      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      error = await ErrorHandler.processError(error);
      await this.errorHandler.handle(error, {
        type: error.type || ErrorTypes.API,
        statusCode: error.statusCode || 500,
        context: "api-gemini-translation",
      });
      return;
    }
  }

  @logMethod
  async handleWebAITranslation(
    text,
    sourceLang,
    targetLang,
    isCallInsideThisMethod = false
  ) {
    const [webAIApiUrl, webAIApiModel] = await Promise.all([
      getWebAIApiUrlAsync(),
      getWebAIApiModelAsync(),
    ]);

    try {
      const prompt = await this.createPrompt(text, sourceLang, targetLang);

      const response = await fetch(`${webAIApiUrl}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          model: webAIApiModel,
          images: [],
          reset_session: this.shouldResetSession(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.detail || errorData.message || response.statusText;
        const error = new Error(errorMessage);
        error.statusCode = response.status;
        error.type = ErrorTypes.API;

        // مدیریت خطاهای خاص session
        if (response.status === 409) {
          // خطای تضاد session
          error.sessionConflict = true;
        }

        await this.errorHandler.handle(error, {
          type: ErrorTypes.API,
          statusCode: response.status,
          context: "api-webai-translation-response",
        });
        return;
      }

      const data = await response.json();

      if (typeof data?.response !== "string") {
        const error = new Error("Invalid WebAI response format");
        await this.errorHandler.handle(error, {
          type: ErrorTypes.API,
          statusCode: response.status || 500,
          context: "api-webai-translation-format",
        });
        return;
      }

      // ذخیره اطلاعات session برای استفاده بعدی
      this.storeSessionContext({
        model: webAIApiModel,
        lastUsed: Date.now(),
      });

      return data.response;
    } catch (error) {
      error = await ErrorHandler.processError(error);

      if (error.sessionConflict) {
        this.resetSessionContext();
      }
      error.type = ErrorTypes.NETWORK;
      error.isWebAINetworkError = true;
      await this.errorHandler.handle(error, {
        type: ErrorTypes.NETWORK,
        context: "api-webai-translation",
      });
      return;
    }
  }

  @logMethod
  async handleOpenAITranslation(text, sourceLang, targetLang) {
    const [openAIApiKey, openAIApiUrl, openAIModel] = await Promise.all([
      getOpenAIApiKeyAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    if (!openAIApiKey) {
      const error = new Error("OpenAI API key is missing");
      await this.errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 601,
        context: "api-openai-translation-apikey",
      });
      return;
    }

    if (!openAIApiUrl) {
      const error = new Error(TRANSLATION_ERRORS.API_URL_MISSING);
      await this.errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 602,
        context: "api-openai-translation-apiurl",
      });
      return;
    }

    try {
      const prompt = await this.createPrompt(text, sourceLang, targetLang);

      const response = await fetch(openAIApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAIApiKey}`,
        },
        body: JSON.stringify({
          model: openAIModel || "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        const error = new Error(errorMessage);
        await this.errorHandler.handle(error, {
          type: ErrorTypes.API,
          statusCode: response.status,
          context: "api-openai-translation-response",
        });
        return;
      }

      const data = await response.json();

      if (!data?.choices?.[0]?.message?.content) {
        const error = new Error("Invalid OpenAI API response format");
        await this.errorHandler.handle(error, {
          type: ErrorTypes.API,
          statusCode: response.status || 500,
          context: "api-openai-translation-response-format",
        });
        return;
      }

      return data.choices[0].message.content;
    } catch (error) {
      error = await ErrorHandler.processError(error);
      await this.errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: error.statusCode || 500,
        context: "api-openai-translation-error",
      });
      return;
    }
  }

  @logMethod
  async handleOpenRouterTranslation(text, sourceLang, targetLang) {
    const [openRouterApiKey, openRouterApiModel] = await Promise.all([
      getOpenRouterApiKeyAsync(),
      getOpenRouterApiModelAsync(),
    ]);

    if (!openRouterApiKey) {
      const error = new Error(TRANSLATION_ERRORS.API_KEY_MISSING);
      await this.errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 601,
        context: "api-openrouter-translation-apikey",
      });
      return;
    }

    try {
      const prompt = await this.createPrompt(text, sourceLang, targetLang);
      const apiUrl = CONFIG.OPENROUTER_API_URL;

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openRouterApiKey}`,
          "HTTP-Referer": window.location.origin, // تنظیم HTTP-Referer به origin اکستنشن
          "X-Title": chrome.runtime.getManifest().name, // تنظیم X-Title به نام اکستنشن
        },
        body: JSON.stringify({
          model: openRouterApiModel || "openai/gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        const error = new Error(errorMessage);
        await this.errorHandler.handle(error, {
          type: ErrorTypes.API || 500,
          statusCode: response.status,
          context: "api-openrouter-translation-response",
        });
        return;
      }

      const data = await response.json();

      if (!data?.choices?.[0]?.message?.content) {
        const error = new Error("Invalid OpenRouter response format");
        await this.errorHandler.handle(error, {
          type: ErrorTypes.API,
          statusCode: response.status || 500,
          context: "api-openrouter-translation-format",
        });
        return;
      }

      return data.choices[0].message.content;
    } catch (error) {
      error = await ErrorHandler.processError(error);
      await this.errorHandler.handle(error, {
        type: error.type || ErrorTypes.API,
        statusCode: error.statusCode || 500,
        context: "api-openrouter-translation",
      });
      return;
    }
  }

  storeSessionContext(context) {
    this.sessionContext = {
      ...context,
      timestamp: Date.now(),
    };
  }

  resetSessionContext() {
    this.sessionContext = null;
  }

  shouldResetSession() {
    // بازنشانی session اگر بیش از 5 دقیقه از آخرین استفاده گذشته باشد
    return (
      this.sessionContext && Date.now() - this.sessionContext.lastUsed > 300000
    );
  }

  @logMethod
  async translateText(text) {
    if (await getUseMockAsync()) {
      await delay(MOCK_DELAY);
      return isPersianText(text) ?
          CONFIG.DEBUG_TRANSLATED_ENGLISH
        : CONFIG.DEBUG_TRANSLATED_PERSIAN;
    }

    if (!text || typeof text !== "string") {
      console.debug("[API] translateText: => Invalid input", text);
      return; // مقدار نامعتبر، اما خطای مهمی نیست
    }

    if (!isExtensionContextValid()) {
      this.errorHandler.handle(new Error(TRANSLATION_ERRORS.INVALID_CONTEXT), {
        type: ErrorTypes.CONTEXT,
        context: "api-translateText-context",
      });
      return;
    }

    try {
      const translationApi = await getTranslationApiAsync();
      const [sourceLang, targetLang] = await Promise.all([
        getSourceLanguageAsync(),
        getTargetLanguageAsync(),
      ]);

      if (translationApi === "webai" && !this.sessionContext) {
        this.resetSessionContext();
      }

      switch (translationApi) {
        case "gemini":
          return await this.handleGeminiTranslation(
            text,
            sourceLang,
            targetLang
          );
        case "webai":
          return await this.handleWebAITranslation(
            text,
            sourceLang,
            targetLang
          );
        case "openai":
          return await this.handleOpenAITranslation(
            text,
            sourceLang,
            targetLang
          );
        case "openrouter":
          return await this.handleOpenRouterTranslation(
            text,
            sourceLang,
            targetLang
          );
        default:
          throw this.errorHandler.handle(
            new Error("Invalid translation API selected"),
            {
              type: ErrorTypes.VALIDATIONMODEL,
              statusCode: 400,
              context: "api-translateText-api-model",
            }
          );
      }
    } catch (error) {
      error = await ErrorHandler.processError(error);

      if (error.sessionConflict) {
        console.warn("[API] Session conflict, retrying...");
        this.resetSessionContext();
        return await this.handleWebAITranslation(
          text,
          sourceLang,
          targetLang,
          true
        );
      }

      await this.errorHandler.handle(error, {
        type: error.type || ErrorTypes.SERVICE,
        statusCode: error.statusCode || 500,
        context: "api-translateText-translation-service",
      });
    }
  }
}

const apiService = new ApiService();
export const translateText = apiService.translateText.bind(apiService);
