// src/utils/api.js
import {
  CONFIG,
  TRANSLATION_ERRORS,
  getApiKeyAsync,
  getUseMockAsync,
  getApiUrlAsync,
  getSourceLanguageAsync,
  getTargetLanguageAsync,
  getPromptBASESelectAsync,
  getPromptBASEFieldAsync,
  getPromptAsync,
  getTranslationApiAsync,
  getWebAIApiUrlAsync,
  getWebAIApiModelAsync,
  getOpenAIApiKeyAsync,
  getOpenAIApiUrlAsync,
  getOpenAIModelAsync,
  getOpenRouterApiKeyAsync,
  getOpenRouterApiModelAsync,
  getPromptDictionaryAsync,
  getEnableDictionaryAsync,
  state,
  TranslationMode,
  getPromptPopupTranslateAsync,
} from "../config.js";
import { delay, isExtensionContextValid, logMethod, logME } from "./helpers.js";
import { isPersianText } from "./textDetection.js";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";

const MOCK_DELAY = 500;
const TEXT_DELIMITER = "\n\n---\n\n";

class ApiService {
  constructor() {
    this.errorHandler = new ErrorHandler();
    this.sessionContext = null;
  }

  /**
   * Checks if the object is an array of objects, where each object
   * has a 'text' property with a string value.
   * Example: [{"text": "hello"}, {"text": "world"}]
   * @param {any} obj - The object to check.
   * @returns {boolean} - True if it matches the specific JSON format, false otherwise.
   */
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

  /**
   * A generic helper to perform API calls.
   * @param {Object} options - Configuration options for the API call.
   * @param {string} options.url - The API URL.
   * @param {Object} options.fetchOptions - Options to pass to fetch (method, headers, body).
   * @param {Function} options.extractResponse - A function to extract the desired result from the response JSON.
   * @param {string} options.context - Context string for error handling.
   * @returns {Promise<string|undefined>} - The extracted response or undefined in case of error.
   */
  async _executeApiCall({ url, fetchOptions, extractResponse, context }) {
    try {
      const response = await fetch(url, fetchOptions);

      // logME("API Response (Raw):", {
      //   status: response.status,
      //   statusText: response.statusText,
      //   headers: Object.fromEntries(response.headers.entries()),
      //   ok: response.ok,
      //   url: response.url,
      // });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.detail || errorData.error?.message || response.statusText;
        const error = new Error(errorMessage);
        error.statusCode = response.status;
        error.type = ErrorTypes.API;
        // مدیریت خطای خاص session در WebAI
        if (response.status === 409) {
          error.sessionConflict = true;
        }
        await this.errorHandler.handle(error, {
          type: error.type,
          statusCode: response.status,
          context,
        });
        return;
      }
      const data = await response.json();
      const result = extractResponse(data, response.status);
      if (result === undefined) {
        const error = new Error("Invalid response format");
        await this.errorHandler.handle(error, {
          type: ErrorTypes.API,
          statusCode: response.status || 500,
          context,
        });
        return;
      }
      return result;
    } catch (error) {
      error = await ErrorHandler.processError(error);
      await this.errorHandler.handle(error, {
        type: error.type || ErrorTypes.API,
        statusCode: error.statusCode || 500,
        context,
      });
      return;
    }
  }

  @logMethod
  async createPrompt(
    text,
    sourceLang,
    targetLang,
    translateMode = TranslationMode.Field
  ) {
    const promptTemplate = await getPromptAsync(); // Fetch the user-configured prompt
    let Json_or_Text_ForTranslate = text;
    let isJsonMode = false;

    try {
      const parsedText = JSON.parse(text);
      if (this._isSpecificTextJsonFormat(parsedText)) {
        Json_or_Text_ForTranslate = text;
        isJsonMode = true;
      } else {
        Json_or_Text_ForTranslate = text;
      }
    } catch (error) {
      Json_or_Text_ForTranslate = text;
    }

    let promptBase;
    if (isJsonMode) {
      promptBase = await getPromptBASESelectAsync();
    } else {
      if (translateMode === TranslationMode.Popup_Translate) {
        promptBase = await getPromptPopupTranslateAsync();
      } else if ((await getEnableDictionaryAsync()) === true) {
        if (translateMode === TranslationMode.Dictionary_Translation) {
          promptBase = await getPromptDictionaryAsync();
        } else {
          promptBase = await getPromptBASEFieldAsync();
        }
      } else {
        promptBase = await getPromptBASEFieldAsync();
      }
    }

    const userRules = promptTemplate
      .replace(/\$_{SOURCE}/g, sourceLang)
      .replace(/\$_{TARGET}/g, targetLang);

    const base_clean = promptBase
      .replace(/\$_{SOURCE}/g, sourceLang)
      .replace(/\$_{TARGET}/g, targetLang);

    const finalPromptWithUserRules = base_clean.replace(
      /\$_{USER_RULES}/g,
      userRules
    );

    logME("Prompt : ", finalPromptWithUserRules);

    const finalPrompt = finalPromptWithUserRules.replace(
      /\$_{TEXT}/g,
      Json_or_Text_ForTranslate
    );

    return finalPrompt;
  }

  @logMethod
  async handleGeminiTranslation(text, sourceLang, targetLang, translateMode) {
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

    const prompt = await this.createPrompt(
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

    return await this._executeApiCall({
      url,
      fetchOptions,
      context: "api-gemini-translation",
      extractResponse: (data) =>
        data?.candidates?.[0]?.content?.parts?.[0]?.text,
    });
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

    const prompt = await this.createPrompt(text, sourceLang, targetLang);
    const url = webAIApiUrl;
    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        model: webAIApiModel,
        images: [],
        reset_session: this.shouldResetSession(),
      }),
    };

    const result = await this._executeApiCall({
      url,
      fetchOptions,
      context: "api-webai-translation",
      extractResponse: (data) =>
        typeof data.response === "string" ? data.response : undefined,
    });

    // ذخیره اطلاعات session در صورت موفقیت
    if (result) {
      this.storeSessionContext({
        model: webAIApiModel,
        lastUsed: Date.now(),
      });
    }
    return result;
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

    const prompt = await this.createPrompt(text, sourceLang, targetLang);
    const url = openAIApiUrl;
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAIApiKey}`,
      },
      body: JSON.stringify({
        model: openAIModel || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      }),
    };

    return await this._executeApiCall({
      url,
      fetchOptions,
      context: "api-openai-translation",
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
    });
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

    const prompt = await this.createPrompt(text, sourceLang, targetLang);
    const url = CONFIG.OPENROUTER_API_URL;
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": chrome.runtime.getManifest().name,
      },
      body: JSON.stringify({
        model: openRouterApiModel || "openai/gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      }),
    };

    return await this._executeApiCall({
      url,
      fetchOptions,
      context: "api-openrouter-translation",
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
    });
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
    return (
      this.sessionContext && Date.now() - this.sessionContext.lastUsed > 300000
    );
  }

  @logMethod
  async translateText(text, translateMode, source_Lang, target_Lang) {
    if (await getUseMockAsync()) {
      await delay(MOCK_DELAY);
      const sampleTextForMock = text.substring(0, 50);
      return isPersianText(sampleTextForMock) ?
          CONFIG.DEBUG_TRANSLATED_ENGLISH
        : CONFIG.DEBUG_TRANSLATED_PERSIAN;
    }

    if (!text || typeof text !== "string") {
      logME(
        "[API] translateText: Received potentially invalid input type after createPrompt:",
        typeof text
      );
    }

    if (!isExtensionContextValid()) {
      await this.errorHandler.handle(
        new Error(TRANSLATION_ERRORS.INVALID_CONTEXT),
        {
          type: ErrorTypes.CONTEXT,
          context: "api-translateText-context",
          code: "context-invalid",
          statusCode: "context-invalid",
        }
      );
      return;
    }

    try {
      const translationApi = await getTranslationApiAsync();

      let [sourceLang, targetLang] = await Promise.all([
        source_Lang || getSourceLanguageAsync(),
        target_Lang || getTargetLanguageAsync(),
      ]);
      if (translationApi === "webai" && !this.sessionContext) {
        this.resetSessionContext();
      }

      /**
       * در منطق ترجمه، اگر زبان مبدا و مقصد یکسان باشد، به زبان مقصد تغییر می‌کند.
       * این شرایط فقط برای زمانی که ترجمه از طریق Popup انجام شده است، اعمال می‌شود.
       * چون موقع ترجمه از زبان مبدا، نوع زبان را مشخص نمی کنیم تا توسط API تشخیص داده شود.
       */
      if (sourceLang === targetLang) {
        if (translateMode === TranslationMode.Popup_Translate) {
          sourceLang = await getTargetLanguageAsync();
        } else {
          return null;
        }
      }

      switch (translationApi) {
        case "gemini":
          return await this.handleGeminiTranslation(
            text,
            sourceLang,
            targetLang,
            translateMode
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
          await this.errorHandler.handle(
            new Error("Invalid translation API selected"),
            {
              type: ErrorTypes.VALIDATIONMODEL,
              statusCode: 400,
              context: "api-translateText-api-model",
            }
          );
          return;
      }
    } catch (error) {
      error = await ErrorHandler.processError(error);
      if (error.sessionConflict && sourceLang && targetLang) {
        logME("[API] Session conflict, retrying WebAI...");
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
      return undefined;
    }
  }
}

const apiService = new ApiService();
export const translateText = apiService.translateText.bind(apiService);
export const API_TEXT_DELIMITER = TEXT_DELIMITER;
