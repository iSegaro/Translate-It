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
    throw errorHandler.handle(new Error(TRANSLATION_ERRORS.MISSING_API_KEY), {
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

      throw errorHandler.handle(new Error(errorMessage), {
        type: ErrorTypes.API,
        statusCode: response.status,
        service: "gemini",
      });
    }

    const data = await response.json();

    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw errorHandler.handle(new Error("Invalid response format"), {
        type: ErrorTypes.API,
        statusCode: 500,
      });
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
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
      throw errorHandler.handle(new Error(errorText), {
        type: ErrorTypes.API,
        statusCode: response.status,
        service: "custom-api",
      });
    }

    const data = await response.json();

    if (typeof data?.response !== "string") {
      throw errorHandler.handle(new Error("Invalid custom API response"), {
        type: ErrorTypes.API,
        statusCode: 500,
      });
    }

    return data.response;
  } catch (error) {
    throw errorHandler.handle(error, {
      type: ErrorTypes.NETWORK,
      context: "custom-translation",
    });
  }
}

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
        throw errorHandler.handle(
          new Error("Invalid translation API selected"),
          {
            type: ErrorTypes.VALIDATION,
            statusCode: 400,
          }
        );
    }
  } catch (error) {
    if (error.message.includes("Extension context invalid")) {
      throw errorHandler.handle(error, {
        type: ErrorTypes.CONTEXT,
        statusCode: 403,
      });
    }

    // مدیریت خطاهای شبکه
    if (error.message.includes("Failed to fetch")) {
      throw errorHandler.handle(error, {
        type: ErrorTypes.NETWORK,
        statusCode: 503,
      });
    }

    // خطاهای از قبل handle شده نیاز به بازنویسی ندارند
    if (error.isHandled) {
      return error;
    }

    // سایر خطاها
    throw errorHandler.handle(error, {
      type: ErrorTypes.SERVICE,
      statusCode: error.statusCode || 500,
      context: "translation-service",
    });
  }
};
