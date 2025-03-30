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
} from "../config.js";
import { delay, isExtensionContextValid } from "./helpers.js";
import { isPersianText } from "./textDetection.js";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";
import { logMethod } from "./helpers.js";

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

  @logMethod
  async createPrompt(text, sourceLang, targetLang) {
    const promptTemplate = await getPromptAsync(); // Fetch the user-configured prompt
    let Json_or_Text_ForTranslate = text; // Default to the original input text
    let isJsonMode = false; // Flag to indicate if we are in JSON mode

    try {
      const parsedText = JSON.parse(text);
      if (this._isSpecificTextJsonFormat(parsedText)) {
        // It IS the specific JSON format.
        // We will use the original 'text' (the JSON string) directly in the prompt.
        // The prompt template ITSELF needs to instruct the model to handle JSON.
        Json_or_Text_ForTranslate = text; // Keep the JSON string as the text for the prompt
        isJsonMode = true;
        // console.debug(
        //   "[API createPrompt] Detected specific JSON format. Using JSON string directly in prompt. Ensure prompt template handles JSON input."
        // );
      } else {
        // It's some other valid JSON or processing failed before this.
        // Treat as plain text.
        // console.debug(
        //   "[API createPrompt] Input is valid JSON but not the specific array format, or parsing failed earlier. Treating as plain text."
        // );
        Json_or_Text_ForTranslate = text; // Keep original text
      }
    } catch (error) {
      // Not valid JSON, treat as plain text.
      // console.debug(
      //   "[API createPrompt] Input is not valid JSON. Treating as plain text."
      // );
      Json_or_Text_ForTranslate = text; // Keep original text
    }

    // **Crucial:** The effectiveness now heavily depends on the CONTENT of `promptTemplate`.
    // If isJsonMode is true, the promptTemplate MUST contain instructions for the model
    // to parse the $_{TEXT} as JSON, translate values inside, and return JSON.
    // If isJsonMode is false, it should work for plain text.

    let promptBase;
    if (isJsonMode) {
      promptBase = await getPromptBASESelectAsync(); // Fetch the base select element mode prompt;
    } else {
      promptBase = await getPromptBASEFieldAsync(); // Fetch the base field mode prompt;
    }

    // console.debug("Prompt Template:", promptTemplate);

    const userRules = promptTemplate
      .replace(/\$_{SOURCE}/g, sourceLang)
      .replace(/\$_{TARGET}/g, targetLang);

    // console.debug("Prompt userRules:", userRules);

    const base_clean = promptBase
      .replace(/\$_{SOURCE}/g, sourceLang)
      .replace(/\$_{TARGET}/g, targetLang);

    // console.debug("Prompt base_clean:", base_clean);

    const finalPromptWithUserRules = base_clean.replace(
      /\$_{USER_RULES}/g,
      userRules
    );

    return finalPromptWithUserRules.replace(
      /\$_{TEXT}/g,
      Json_or_Text_ForTranslate
    );
  }

  @logMethod
  async handleGeminiTranslation(text, sourceLang, targetLang) {
    if (sourceLang === targetLang) return null; // Return null for same language

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
      console.debug("Gemini Prompt:", prompt); // Log the generated prompt
      const response = await fetch(`${apiUrl}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      // console.warn("Gemini Response:", response); // Debug

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
      // Mock logic might need adjustment if it depends on the input structure,
      // but likely okay as it operates on the final prompt string.
      const sampleTextForMock = text.substring(0, 50); // Use a sample for detection
      return isPersianText(sampleTextForMock) ?
          CONFIG.DEBUG_TRANSLATED_ENGLISH
        : CONFIG.DEBUG_TRANSLATED_PERSIAN;
    }

    // Input validation can remain simple as createPrompt handles the complexity now
    if (!text || typeof text !== "string") {
      console.warn(
        "[API] translateText: Received potentially invalid input type after createPrompt:",
        typeof text
      );
      // Depending on requirements, you might return or throw an error here.
      // Assuming createPrompt always returns a string or we proceed carefully.
    }

    if (!isExtensionContextValid()) {
      this.errorHandler.handle(new Error(TRANSLATION_ERRORS.INVALID_CONTEXT), {
        type: ErrorTypes.CONTEXT,
        context: "api-translateText-context",
      });
      return;
    }

    let sourceLang, targetLang; // Declare here for access in catch block if needed

    try {
      const translationApi = await getTranslationApiAsync();
      [sourceLang, targetLang] = await Promise.all([
        getSourceLanguageAsync(),
        getTargetLanguageAsync(),
      ]);

      // createPrompt is now called within the API-specific handlers
      // because it needs sourceLang and targetLang

      if (translationApi === "webai" && !this.sessionContext) {
        this.resetSessionContext(); // Keep session logic
      }

      // Note: The actual prompt creation happens *inside* each handler now
      // because it needs source/target languages. We pass the original `text`
      // down to the handlers.

      switch (translationApi) {
        case "gemini":
          // Pass the original text; the handler will call createPrompt
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
          // Use ErrorHandler consistently
          await this.errorHandler.handle(
            new Error("Invalid translation API selected"),
            {
              type: ErrorTypes.VALIDATIONMODEL,
              statusCode: 400,
              context: "api-translateText-api-model",
            }
          );
          return; // Return undefined or throw after handling
      }
    } catch (error) {
      error = await ErrorHandler.processError(error);

      // Handle session conflict specifically for WebAI retry
      if (error.sessionConflict && sourceLang && targetLang) {
        // Check if langs are available
        console.warn("[API] Session conflict, retrying WebAI...");
        this.resetSessionContext();
        // Ensure source/targetLang are defined before retrying
        return await this.handleWebAITranslation(
          text,
          sourceLang,
          targetLang,
          true
        );
      }

      // General error handling
      await this.errorHandler.handle(error, {
        type: error.type || ErrorTypes.SERVICE,
        statusCode: error.statusCode || 500,
        context: "api-translateText-translation-service",
      });
      // Depending on policy, you might want to return undefined or re-throw
      return undefined;
    }
  }
}

const apiService = new ApiService();
// Bind the main translateText method for export
export const translateText = apiService.translateText.bind(apiService);
export const API_TEXT_DELIMITER = TEXT_DELIMITER;
