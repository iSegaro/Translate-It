// src/utils/api.js
import {
  CONFIG,
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

const MOCK_DELAY = 500;
const TRANSLATION_ERRORS = {
  INVALID_CONTEXT:
    "Extension context invalid. Please refresh the page to continue.",
  MISSING_API_KEY: "API key is missing",
  SERVICE_OVERLOADED: "Translation service overloaded:",
};

function handleGeminiErrors(statusCode, errorMessage) {
  const errorMap = {
    400: "Invalid request parameters",
    401: "Authentication failed",
    403: "Permission denied",
    404: "API endpoint not found",
    429: "Too many requests",
    500: "Internal server error",
    503: "Service unavailable",
  };

  // تشخیص خطاهای خاص بر اساس محتوا
  const lowerCaseMessage = errorMessage.toLowerCase();
  if (statusCode === 401 || lowerCaseMessage.includes("api key")) {
    throw new Error(`Invalid API key: ${errorMessage}`);
  }

  if (
    statusCode === 429 ||
    statusCode === 503 ||
    lowerCaseMessage.includes("overloaded")
  ) {
    throw new Error(`${TRANSLATION_ERRORS.SERVICE_OVERLOADED} ${errorMessage}`);
  }

  // استفاده از errorMap برای پیام‌های پیش‌فرض
  const defaultMessage = errorMap[statusCode] || "Translation service error";
  throw new Error(`${defaultMessage} [${statusCode}]: ${errorMessage}`);
}

async function createPrompt(text, sourceLang, targetLang) {
  const promptTemplate = await getPromptAsync();
  return promptTemplate
    .replace(/\${SOURCE}/g, sourceLang)
    .replace(/\${TARGET}/g, targetLang)
    .replace(/\${TEXT}/g, text);
}

function handleNetworkErrors(error) {
  if (error.message.includes("Failed to fetch")) {
    return new Error("Connection to server failed. Check internet connection");
  }
  return error;
}

// تابع مدیریت خطاهای سفارشی
function handleCustomApiErrors(statusCode, message) {
  const errorTemplates = {
    404: `Custom API endpoint not found: ${message}`,
    500: `Custom API internal error: ${message}`,
    default: `Custom API error [${statusCode}]: ${message}`,
  };
  return new Error(errorTemplates[statusCode] || errorTemplates.default);
}

async function handleGeminiTranslation(text, sourceLang, targetLang) {
  if (sourceLang === targetLang) return text;

  const [apiKey, apiUrl] = await Promise.all([
    getApiKeyAsync(),
    getApiUrlAsync(),
  ]);

  if (!apiKey) throw new Error(TRANSLATION_ERRORS.MISSING_API_KEY);

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
      handleGeminiErrors(response.status, errorMessage);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    throw handleNetworkErrors(error);
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
      throw handleCustomApiErrors(response.status, errorText);
    }

    return (await response.json()).response;
  } catch (error) {
    throw handleNetworkErrors(error);
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
        throw new Error("Invalid translation API selected");
    }
  } catch (error) {
    if (error.message.includes("Extension context invalid")) {
      throw new Error(TRANSLATION_ERRORS.INVALID_CONTEXT);
    }

    // مدیریت خطاهای شبکه و سرور
    const finalError =
      error.message.includes("Failed to fetch") ?
        new Error("Translation service unavailable. Check network connection")
      : error;

    // افزودن کد وضعیت به پیام خطا
    finalError.statusCode = error.statusCode || 503;
    throw finalError;
  }
};
