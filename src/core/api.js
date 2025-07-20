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
  getGoogleTranslateUrlAsync,
  getWebAIApiUrlAsync,
  getWebAIApiModelAsync,
  getOpenAIApiKeyAsync,
  getOpenAIApiUrlAsync,
  getOpenAIModelAsync,
  getOpenRouterApiKeyAsync,
  getOpenRouterApiModelAsync,
  getDeepSeekApiKeyAsync,
  getDeepSeekApiModelAsync,
  getCustomApiUrlAsync,
  getCustomApiKeyAsync,
  getCustomApiModelAsync,
  getEnableDictionaryAsync,
  TranslationMode,
} from "../config.js";
import { delay, isExtensionContextValid, logME } from "../utils/helpers.js";
import { buildPrompt } from "../utils/promptBuilder.js";
import { isPersianText } from "../utils/textDetection.js";
import { AUTO_DETECT_VALUE, getLanguageCode } from "tts-utils";
import { ErrorTypes } from "../services/ErrorTypes.js";

const MOCK_DELAY = 500;
const TEXT_DELIMITER = "\n\n---\n\n";

// A simple map for converting full language names to Google Translate's codes.
const langNameToCodeMap = {
  afrikaans: "af",
  albanian: "sq",
  arabic: "ar",
  azerbaijani: "az",
  belarusian: "be",
  bengali: "bn",
  bulgarian: "bg",
  catalan: "ca",
  cebuano: "ceb", // Note: ISO 639-2 code
  "chinese (simplified)": "zh",
  chinese: "zh",
  croatian: "hr",
  czech: "cs",
  danish: "da",
  dutch: "nl",
  english: "en",
  estonian: "et",
  farsi: "fa",
  persian: "fa",
  filipino: "fil", // Note: ISO 639-2 code
  finnish: "fi",
  french: "fr",
  german: "de",
  greek: "el",
  hebrew: "he",
  hindi: "hi",
  hungarian: "hu",
  indonesian: "id",
  italian: "it",
  japanese: "ja",
  kannada: "kn",
  kazakh: "kk",
  korean: "ko",
  latvian: "lv",
  lithuanian: "lt",
  malay: "ms",
  malayalam: "ml",
  marathi: "mr",
  nepali: "ne",
  norwegian: "no",
  odia: "or",
  pashto: "ps",
  polish: "pl",
  portuguese: "pt",
  punjabi: "pa",
  romanian: "ro",
  russian: "ru",
  serbian: "sr",
  sinhala: "si",
  slovak: "sk",
  slovenian: "sl",
  spanish: "es",
  swahili: "sw",
  swedish: "sv",
  tagalog: "tl",
  tamil: "ta",
  telugu: "te",
  thai: "th",
  turkish: "tr",
  ukrainian: "uk",
  urdu: "ur",
  uzbek: "uz",
  vietnamese: "vi",
};

class ApiService {
  constructor() {
    this.sessionContext = null;
  }

  /**
   * تبدیل dictionary output Google Translate به فرمت markdown
   * @param {string} candidateText - متن dictionary خام
   * @returns {string} - متن فرماتبندی شده markdown
   */
  _formatDictionaryAsMarkdown(candidateText) {
    if (!candidateText || candidateText.trim() === '') {
      return '';
    }

    const lines = candidateText.trim().split('\n').filter(line => line.trim() !== '');
    
    if (lines.length === 0) {
      return '';
    }

    // ساخت فرمت markdown
    let markdownOutput = '';
    
    lines.forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const partOfSpeech = line.substring(0, colonIndex).trim();
        const terms = line.substring(colonIndex + 1).trim();
        
        if (partOfSpeech && terms) {
          markdownOutput += `**${partOfSpeech}:** ${terms}\n\n`;
        }
      } else if (line.trim()) {
        // اگر خط نقطه‌ای ندارد، به عنوان عنوان در نظر بگیریم
        markdownOutput += `**${line.trim()}**\n\n`;
      }
    });
    
    return markdownOutput.trim();
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
    logME(`[API] _executeApiCall starting for context: ${context}`);
    logME(`[API] _executeApiCall URL: ${url}`);
    logME(`[API] _executeApiCall fetchOptions:`, fetchOptions);
    
    try {
      const response = await fetch(url, fetchOptions);
      logME(`[API] _executeApiCall response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        // Extract error details if available
        let body = {};
        try {
          body = await response.json();
        } catch {
          //
        }
        // Use detail or error.message or statusText, fallback to HTTP status
        const msg =
          body.detail ||
          body.error?.message ||
          response.statusText ||
          `HTTP ${response.status}`;
        
        logME(`[API] _executeApiCall HTTP error: ${msg}`, body);
        const err = new Error(msg);
        // Mark as HTTP error (status codes 4xx/5xx)
        err.type = ErrorTypes.HTTP_ERROR;
        err.statusCode = response.status;
        err.context = context;
        throw err;
      }

      // Parse successful response
      const data = await response.json();
      logME(`[API] _executeApiCall response data:`, data);
      
      const result = extractResponse(data, response.status);
      logME(`[API] _executeApiCall extracted result:`, result);
      
      if (result === undefined) {
        logME(`[API] _executeApiCall result is undefined - treating as invalid response`);
        const err = new Error(ErrorTypes.API_RESPONSE_INVALID);
        err.type = ErrorTypes.API;
        err.statusCode = response.status;
        err.context = context;
        throw err;
      }

      logME(`[API] _executeApiCall success for context: ${context}`);
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

  async handleGoogleTranslate(text, sourceLang, targetLang, translateMode = null) {
    if (sourceLang === targetLang) return null;

    // ▼▼▼ منطق اختصاصی Google Translate ▼▼▼
    // اگر در Field mode هستیم، language swapping انجام می‌دهیم
    if (translateMode === TranslationMode.Field) {
      // در Field mode، targetLang را به sourceLanguage تبدیل می‌کنیم (reverse translation)
      targetLang = sourceLang;
      sourceLang = AUTO_DETECT_VALUE;
    } else {
      // برای سایر حالت‌ها، منطق language detection و swapping
      try {
        const detectionResult = await Browser.i18n.detectLanguage(text);
        if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
          const mainDetection = detectionResult.languages[0];
          const detectedLangCode = mainDetection.language.split("-")[0];
          const targetLangCode = getLanguageCode(targetLang).split("-")[0];

          if (detectedLangCode === targetLangCode) {
            // زبان‌ها را جابجا کن
            [sourceLang, targetLang] = [targetLang, sourceLang];
          }
        } else {
          // Regex fallback
          const targetLangCode = getLanguageCode(targetLang).split("-")[0];
          if (isPersianText(text) && (targetLangCode === "fa" || targetLangCode === "ar")) {
            [sourceLang, targetLang] = [targetLang, sourceLang];
          }
        }
      } catch (e) {
        logME('[handleGoogleTranslate] Language detection failed:', e);
      }
    }
    // ▲▲▲ پایان منطق اختصاصی Google Translate ▲▲▲

    // --- JSON Mode Detection ---
    let isJsonMode = false;
    let originalJsonStruct;
    let textsToTranslate = [text];
    const context = "api-google-translate";

    try {
      const parsed = JSON.parse(text);
      if (this._isSpecificTextJsonFormat(parsed)) {
        isJsonMode = true;
        originalJsonStruct = parsed;
        textsToTranslate = originalJsonStruct.map((item) => item.text);
      }
    } catch  {
      // Not a valid JSON, proceed in plain text mode.
    }

    // --- URL Construction ---
    const apiUrl = await getGoogleTranslateUrlAsync();
    const getLangCode = (lang) => {
      if (!lang || typeof lang !== "string") return "auto";
      const lowerCaseLang = lang.toLowerCase();
      return langNameToCodeMap[lowerCaseLang] || lowerCaseLang;
    };
    const sl =
      sourceLang === AUTO_DETECT_VALUE ? "auto" : getLangCode(sourceLang);
    const tl = getLangCode(targetLang);

    if (sl === tl && !isJsonMode) return text;

    const url = new URL(apiUrl);
    
    // بررسی تنظیمات دیکشنری - در Field mode هرگز دیکشنری نباشد
    const isDictionaryEnabled = await getEnableDictionaryAsync();
    const shouldIncludeDictionary = isDictionaryEnabled && translateMode !== TranslationMode.Field;
    
    // ساخت query string دستی برای پشتیبانی از چندین dt
    const queryParams = [
      `client=gtx`,
      `sl=${sl}`,
      `tl=${tl}`,
      `dt=t`, // Translation text
    ];

    // فقط در صورت فعال بودن دیکشنری و غیرفیلد بودن translateMode، پارامتر bd اضافه شود
    if (shouldIncludeDictionary) {
      queryParams.push(`dt=bd`); // Dictionary data
    }
    
    queryParams.push(`q=${encodeURIComponent(textsToTranslate.join(TEXT_DELIMITER))}`);
    url.search = queryParams.join('&');

    // --- API Call using the centralized handler ---
    const result = await this._executeApiCall({
      url: url.toString(),
      fetchOptions: { method: "GET" },
      extractResponse: (data) => {
        // Check for valid Google Translate response structure
        if (!data?.[0]) {
          // Returning undefined will trigger an API_RESPONSE_INVALID error in _executeApiCall
          return undefined;
        }
        
        // Extract main translation
        const translatedText = data[0].map((segment) => segment[0] || "").join("");
        
        // Extract dictionary data if available and enabled (but never in Field mode)
        let candidateText = "";
        if (shouldIncludeDictionary && data[1]) { // data[1] contains dictionary information
          candidateText = data[1]
            .map((dict) => {
              const pos = dict[0] || ""; // Part of speech
              const terms = dict[1] || []; // Alternative translations
              return `${pos}${pos !== "" ? ": " : ""}${terms.join(", ")}\n`;
            })
            .join("");
        }
        
        return {
          resultText: translatedText,
          candidateText: candidateText.trim()
        };
      },
      context: context,
    });

    // --- Response Processing ---
    if (isJsonMode) {
      const translatedParts = result.resultText.split(TEXT_DELIMITER);
      if (translatedParts.length !== originalJsonStruct.length) {
        logME(
          "Google Translate: JSON reconstruction failed due to segment mismatch."
        );
        return result.resultText; // Fallback to returning the raw translated text
      }
      const translatedJson = originalJsonStruct.map((item, index) => ({
        ...item,
        text: translatedParts[index]?.trim() || "",
      }));
      return JSON.stringify(translatedJson, null, 2);
    } else {
      // Return both translation and dictionary data
      if (result.candidateText) {
        const formattedDictionary = this._formatDictionaryAsMarkdown(result.candidateText);
        return `${result.resultText}\n\n${formattedDictionary}`;
      }
      return result.resultText;
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

    logME("[API] handleGeminiTranslation input text:", text);
    const prompt = await buildPrompt(
      text,
      sourceLang,
      targetLang,
      translateMode
    );
    logME("[API] handleGeminiTranslation built prompt:", prompt);
    const url = `${apiUrl}?key=${apiKey}`;
    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    };

    logME("[API] handleGeminiTranslation about to call _executeApiCall with:", {
      url: url.replace(/key=[^&]+/, 'key=***'),
      context: "api-gemini-translation"
    });

    try {
      const result = await this._executeApiCall({
        url,
        fetchOptions,
        extractResponse: (data) =>
          data?.candidates?.[0]?.content?.parts?.[0]?.text,
        context: "api-gemini-translation",
      });
      
      logME("[API] handleGeminiTranslation _executeApiCall completed with result:", result);
      return result;
    } catch (error) {
      logME("[API] handleGeminiTranslation _executeApiCall failed with error:", error);
      throw error;
    }
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

  async handleCustomTranslation(text, sourceLang, targetLang, translateMode) {
    const [apiUrl, apiKey, model] = await Promise.all([
      getCustomApiUrlAsync(),
      getCustomApiKeyAsync(),
      getCustomApiModelAsync(),
    ]);

    if (!apiUrl) {
      const err = new Error(ErrorTypes.API_URL_MISSING);
      err.type = ErrorTypes.API;
      err.context = "api-custom-url";
      throw err;
    }
    if (!apiKey) {
      const err = new Error(ErrorTypes.API_KEY_MISSING);
      err.type = ErrorTypes.API;
      err.context = "api-custom-apikey";
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
        model: model, // مدل باید توسط کاربر مشخص شود
        messages: [{ role: "user", content: prompt }],
      }),
    };

    return this._executeApiCall({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: "api-custom-translation",
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

  async handleDeepSeekTranslation(text, sourceLang, targetLang, translateMode) {
    const [apiKey, model] = await Promise.all([
      getDeepSeekApiKeyAsync(),
      getDeepSeekApiModelAsync(),
    ]);

    if (!apiKey) {
      const err = new Error(ErrorTypes.API_KEY_MISSING);
      err.type = ErrorTypes.API;
      err.context = "api-deepseek-apikey";
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
        model: model || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    };

    return this._executeApiCall({
      url: CONFIG.DEEPSEEK_API_URL,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: "api-deepseek-translation",
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

    let [sourceLanguage, targetLanguage] = await Promise.all([
      srcLang || getSourceLanguageAsync(),
      tgtLang || getTargetLanguageAsync(),
    ]);

    const api = await getTranslationApiAsync();

    // منطق language swapping به تابع handleGoogleTranslate منتقل شد

    if (
      sourceLanguage === targetLanguage &&
      translateMode !== TranslationMode.Popup_Translate &&
      translateMode !== TranslationMode.Sidepanel_Translate
    ) {
      return null;
    }

    switch (api) {
      case "google":
        return this.handleGoogleTranslate(text, sourceLanguage, targetLanguage, translateMode);
      case "gemini":
        return this.handleGeminiTranslation(
          text,
          sourceLanguage,
          targetLanguage,
          translateMode
        );
      case "webai":
        return this.handleWebAITranslation(
          text,
          sourceLanguage,
          targetLanguage,
          translateMode
        );
      case "openai":
        return this.handleOpenAITranslation(
          text,
          sourceLanguage,
          targetLanguage,
          translateMode
        );
      case "openrouter":
        return this.handleOpenRouterTranslation(
          text,
          sourceLanguage,
          targetLanguage,
          translateMode
        );
      case "deepseek":
        return this.handleDeepSeekTranslation(
          text,
          sourceLanguage,
          targetLanguage,
          translateMode
        );
      case "custom":
        return this.handleCustomTranslation(
          text,
          sourceLanguage,
          targetLanguage,
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
