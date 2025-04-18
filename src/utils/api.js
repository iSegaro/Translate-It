// src/utils/api.js
import Browser from "webextension-polyfill";
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
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";
import { buildPrompt } from "./promptBuilder.js";
import { isPersianText } from "./textDetection.js";
import { AUTO_DETECT_VALUE } from "./tts.js";

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
   * متدی برای ساخت payload پیام جهت ارسال به پس‌زمینه.
   * تلاش می‌کند از fetchOptions.body مقدار promptText را استخراج کند.
   * همچنین اگر اطلاعات sourceLanguage، targetLanguage و translationMode در options موجود نباشد،
   * به صورت پیش‌فرض آن‌ها را به رشته خالی ست می‌کند.
   */
  _buildMessagePayload(options) {
    let promptText = "";
    try {
      const bodyObj = JSON.parse(options.fetchOptions.body);
      // پشتیبانی از قالب‌های مختلف:
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
    } catch (e) {
      // در صورت بروز خطا، promptText خالی می‌ماند.
    }
    return {
      promptText,
      sourceLanguage: options.sourceLanguage || AUTO_DETECT_VALUE,
      targetLanguage: options.targetLanguage || AUTO_DETECT_VALUE,
      translationMode: options.translationMode || "",
    };
  }

  /**
   * اجرای درخواست API.
   *
   * @param {Object} options شامل: url, fetchOptions, extractResponse, context, و اختیاری: sourceLanguage, targetLanguage, translationMode
   * @returns {Promise<string|undefined>}
   */
  /** اجرای درخواست API و برگرداندن خطا به لایهٔ بالاتر */
  async _executeApiCall(opts) {
    try {
      const res = await fetch(opts.url, opts.fetchOptions);

      /* ───── خطای HTTP ───── */
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.detail || body.error?.message || res.statusText;

        const apiErr = new Error(msg);
        apiErr.statusCode = res.status;
        apiErr.type = ErrorTypes.API;
        apiErr.sessionConflict = res.status === 409;

        /* ⬅️ فقط پرتاب می‌کنیم؛
         هیچ اعلان UI در این لایه ساخته نمی‌شود */
        throw apiErr;
      }

      /* ───── واکشی موفق ───── */
      const data = await res.json();
      const result = opts.extractResponse(data, res.status);
      if (result === undefined) {
        const fmtErr = new Error("Invalid response format");
        fmtErr.type = ErrorTypes.API;
        fmtErr.statusCode = res.status || 500;
        throw fmtErr;
      }
      return result;
    } catch (err) {
      /* network / هر خطای دیگر */
      const e = await ErrorHandler.processError(err);
      /* فقط پرتاب؛ نمایش اعلان در لایهٔ بالاتر */
      throw e;
    }
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
      return await this.errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 601,
        context: "api-gemini-translation-apikey",
      });
    }

    if (!apiUrl) {
      const error = new Error(TRANSLATION_ERRORS.API_URL_MISSING);
      return await this.errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 602,
        context: "api-gemini-translation-apiurl",
      });
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
    isCallInsideThisMethod = false,
    translateMode
  ) {
    const [webAIApiUrl, webAIApiModel] = await Promise.all([
      getWebAIApiUrlAsync(),
      getWebAIApiModelAsync(),
    ]);

    const prompt = await buildPrompt(
      text,
      sourceLang,
      targetLang,
      translateMode
    );

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
  async handleOpenAITranslation(text, sourceLang, targetLang, translateMode) {
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

    const prompt = await buildPrompt(
      text,
      sourceLang,
      targetLang,
      translateMode
    );
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
  async handleOpenRouterTranslation(
    text,
    sourceLang,
    targetLang,
    translateMode
  ) {
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

    const prompt = await buildPrompt(
      text,
      sourceLang,
      targetLang,
      translateMode
    );
    const url = CONFIG.OPENROUTER_API_URL;
    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": Browser.runtime.getManifest().name,
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
    } catch (err) {
      /* ----------------------------------
         اگر رشته‌ای از _executeApiCall آمده،
         دست نزنیم و همان را پرتاب کنیم
      ----------------------------------- */
      if (typeof err === "string") {
        throw err; // 🔴 همانی که _executeApiCall ساخته بود
      }

      /* اگر واقعاً Error است (مثلاً SessionConflict) */
      if (err.sessionConflict && source_Lang && target_Lang) {
        this.resetSessionContext();
        return await this.handleWebAITranslation(
          text,
          source_Lang,
          target_Lang,
          true
        );
      }

      await this.errorHandler.handle(err, {
        type: err.type || ErrorTypes.NETWORK,
        statusCode: err.statusCode || 500,
        context: "api-translateText-translation-service",
      });

      throw err.message || "Unknown translation error"; // فقط متن خطا
    }
  }
}

const apiService = new ApiService();
export const translateText = apiService.translateText.bind(apiService);
export const API_TEXT_DELIMITER = TEXT_DELIMITER;
