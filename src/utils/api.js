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
  getCustomApiUrlAsync,
  getCustomApiModelAsync,
} from "../config.js";
import { delay } from "./helpers.js";
import { isPersianText } from "./textDetection.js";
import { ErrorHandler, ErrorTypes } from "../services/ErrorService.js";

const errorHandler = new ErrorHandler();
const MOCK_DELAY = 500;

async function createPrompt(text, sourceLang, targetLang) {
  const promptTemplate = await getPromptAsync();
  return promptTemplate
    .replace(/\${SOURCE}/g, sourceLang)
    .replace(/\${TARGET}/g, targetLang)
    .replace(/\${TEXT}/g, text);
}

async function handleGeminiTranslation(text, sourceLang, targetLang) {
  if (sourceLang === targetLang) return text;

  const [apiKey, apiUrl] = await Promise.all([
    getApiKeyAsync(),
    getApiUrlAsync(),
  ]);

  if (!apiKey) {
    const error = new Error(TRANSLATION_ERRORS.MISSING_API_KEY);
    error.statusCode = 401;
    error.type = ErrorTypes.API;
    throw errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: 401,
    });
  }

  try {
    const prompt = await createPrompt(text, sourceLang, targetLang);
    const response = await fetch(`${apiUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || response.statusText;
      const error = new Error(errorMessage);
      error.statusCode = response.status;
      error.type = ErrorTypes.API;
      throw errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        service: "gemini",
      });
    }

    const data = await response.json();

    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const error = new Error("Invalid response format");
      error.statusCode = 500;
      error.type = ErrorTypes.API;
      throw errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 500,
      });
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    error.type = ErrorTypes.API;
    error.statusCode = error.statusCode || 500;
    error.context = "gemini-translation";
    throw errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: error.statusCode || 500,
      context: "gemini-translation",
    });
  }
}

async function handleCustomTranslation(text, sourceLang, targetLang) {
  const [customApiUrl, customApiModel] = await Promise.all([
    getCustomApiUrlAsync(),
    getCustomApiModelAsync(),
  ]);

  try {
    const prompt = await createPrompt(text, sourceLang, targetLang);
    const response = await fetch(`${customApiUrl}/gemini`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        model: customApiModel,
        images: [],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText);
      error.statusCode = response.status;
      error.type = ErrorTypes.API;
      throw errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        service: "custom-api",
      });
    }

    const data = await response.json();

    if (typeof data?.response !== "string") {
      const error = new Error("Invalid custom API response");
      error.statusCode = 500;
      error.type = ErrorTypes.API;
      throw errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 500,
      });
    }

    return data.response;
  } catch (error) {
    error.type = ErrorTypes.NETWORK;
    error.context = "custom-translation";
    error.isCustomNetworkError = true; // اضافه کردن flag
    throw errorHandler.handle(error, {
      type: ErrorTypes.NETWORK,
      context: "custom-translation",
    });
  }
}

// src/utils/api.js

export const translateText = async (text) => {
  if (await getUseMockAsync()) {
    await delay(MOCK_DELAY);
    return isPersianText(text) ?
        CONFIG.DEBUG_TRANSLATED_ENGLISH
      : CONFIG.DEBUG_TRANSLATED_PERSIAN;
  }

  try {
    const translationApi = await getTranslationApiAsync();
    const [sourceLang, targetLang] = await Promise.all([
      getSourceLanguageAsync(),
      getTargetLanguageAsync(),
    ]);

    switch (translationApi) {
      case "gemini":
        return await handleGeminiTranslation(text, sourceLang, targetLang);
      case "custom":
        return await handleCustomTranslation(text, sourceLang, targetLang);
      default:
        const error = new Error("Invalid translation API selected");
        error.type = ErrorTypes.VALIDATION;
        error.statusCode = 400;
        throw errorHandler.handle(error, {
          type: ErrorTypes.VALIDATION,
          statusCode: 400,
        });
    }
  } catch (error) {
    console.debug("Error caught in translateText:", error);
    // مدیریت خطاهای مربوط به context
    if (error.message.includes("Extension context invalid")) {
      error.type = ErrorTypes.CONTEXT;
      error.statusCode = 403;
      throw errorHandler.handle(error, {
        type: ErrorTypes.CONTEXT,
        statusCode: 403,
      });
    }

    // مدیریت خطاهای شبکه
    if (
      error.type === ErrorTypes.NETWORK ||
      error.message.includes("Failed to fetch")
    ) {
      // اگر خطا از handleCustomTranslation آمده و قبلاً به عنوان NETWORK handle شده است، رد شود
      if (error.isCustomNetworkError) {
        return;
      }
      console.deb("Error caught in translateText:Network:", error);
      const networkError = new Error(TRANSLATION_ERRORS.NETWORK_FAILURE);
      networkError.type = ErrorTypes.NETWORK;
      networkError.statusCode = 503;
      throw errorHandler.handle(networkError, {
        type: ErrorTypes.NETWORK,
        statusCode: 503,
      });
    }

    // خطاهای از قبل handle شده نیاز به بازنویسی ندارند
    if (error.isHandled) {
      console.debug("Error caught in translateText:isHandled:", error);
      return error;
    }

    // سایر خطاها
    console.debug("Error caught in translateText:OtherErrors:", error);
    error.type = ErrorTypes.SERVICE;
    error.statusCode = error.statusCode || 500;
    error.context = "translation-service";
    throw errorHandler.handle(error, {
      type: ErrorTypes.SERVICE,
      statusCode: error.statusCode || 500,
      context: "translation-service",
    });
  }
};
