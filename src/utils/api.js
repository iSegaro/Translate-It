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
    throw error; // پرتاب خطا به سطح بالاتر
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
      throw error; // پرتاب خطا به سطح بالاتر
    }

    const data = await response.json();

    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const error = new Error("Invalid response format");
      error.statusCode = 500;
      error.type = ErrorTypes.API;
      throw error; // پرتاب خطا به سطح بالاتر
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    error.type = ErrorTypes.API;
    error.statusCode = error.statusCode || 500;
    error.context = "gemini-translation";
    throw error; // پرتاب خطا به سطح بالاتر
  }
}

async function handleWebAITranslation(text, sourceLang, targetLang) {
  const [webAIApiUrl, webAIApiModel] = await Promise.all([
    getWebAIApiUrlAsync(),
    getWebAIApiModelAsync(),
  ]);

  try {
    const prompt = await createPrompt(text, sourceLang, targetLang);

    const response = await fetch(`${webAIApiUrl}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        model: webAIApiModel,
        images: [],
        // پارامترهای اختیاری برای کنترل session
        reset_session: shouldResetSession(), // افزودن منطق بازنشانی session در صورت نیاز
      }),
    });

    // مدیریت خطاهای HTTP
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

      throw errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        service: "webai-api",
      });
    }

    const data = await response.json();

    if (typeof data?.response !== "string") {
      const error = new Error("Invalid WebAI API response format");
      error.statusCode = 500;
      error.type = ErrorTypes.API;
      throw errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 500,
      });
    }

    // ذخیره اطلاعات session برای استفاده بعدی
    storeSessionContext({
      model: webAIApiModel,
      lastUsed: Date.now(),
    });

    return data.response;
    // بازنشانی session در صورت خطای مربوطه
  } catch (error) {
    if (error.sessionConflict) {
      resetSessionContext();
    }
    error.type = ErrorTypes.NETWORK;
    error.context = "webai-translation";
    error.isWebAINetworkError = true;
    throw errorHandler.handle(error, {
      type: ErrorTypes.NETWORK,
      context: "webai-translation",
    });
  }
}

async function handleOpenAITranslation(text, sourceLang, targetLang) {
  const [openAIApiKey, openAIApiUrl, openAIModel] = await Promise.all([
    getOpenAIApiKeyAsync(),
    getOpenAIApiUrlAsync(),
    getOpenAIModelAsync(),
  ]);

  if (!openAIApiKey) {
    const error = new Error("OpenAI API key is missing");
    error.statusCode = 401;
    error.type = ErrorTypes.API;
    throw errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: 401,
    });
  }

  try {
    const prompt = await createPrompt(text, sourceLang, targetLang);

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
      error.statusCode = response.status;
      error.type = ErrorTypes.API;
      throw errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        service: "openai",
      });
    }

    const data = await response.json();

    if (!data?.choices?.[0]?.message?.content) {
      const error = new Error("Invalid OpenAI API response format");
      error.statusCode = 500;
      error.type = ErrorTypes.API;
      throw errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 500,
      });
    }

    return data.choices[0].message.content;
  } catch (error) {
    error.type = ErrorTypes.API;
    error.statusCode = error.statusCode || 500;
    error.context = "openai-translation";
    throw errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: error.statusCode || 500,
      context: "openai-translation",
    });
  }
}

async function handleOpenRouterTranslation(text, sourceLang, targetLang) {
  const [openRouterApiKey, openRouterApiModel] = await Promise.all([
    getOpenRouterApiKeyAsync(),
    getOpenRouterApiModelAsync(),
  ]);

  if (!openRouterApiKey) {
    const error = new Error("OpenRouter API key is missing");
    error.statusCode = 401;
    error.type = ErrorTypes.API;
    throw errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: 401,
    });
  }

  try {
    const prompt = await createPrompt(text, sourceLang, targetLang);
    const apiUrl = CONFIG.OPENROUTER_API_URL; // استفاده از URL از config

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openRouterApiKey}`,
        "HTTP-Referer": window.location.origin, // تنظیم HTTP-Referer به origin اکستنشن
        "X-Title": chrome.runtime.getManifest().name, // تنظیم X-Title به نام اکستنشن
      },
      body: JSON.stringify({
        model: openRouterApiModel || "openai/gpt-3.5-turbo", // استفاده از مدل قابل تنظیم
        messages: [{ role: "user", content: prompt }],
      }),
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
        service: "openrouter",
      });
    }

    const data = await response.json();

    if (!data?.choices?.[0]?.message?.content) {
      const error = new Error("Invalid OpenRouter API response format");
      error.statusCode = 500;
      error.type = ErrorTypes.API;
      throw errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 500,
      });
    }

    return data.choices[0].message.content;
  } catch (error) {
    error.type = ErrorTypes.API;
    error.statusCode = error.statusCode || 500;
    error.context = "openrouter-translation";
    throw errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: error.statusCode || 500,
      context: "openrouter-translation",
    });
  }
}

// توابع کمکی برای مدیریت session
let sessionContext = null;

function storeSessionContext(context) {
  sessionContext = {
    ...context,
    timestamp: Date.now(),
  };
}

function resetSessionContext() {
  sessionContext = null;
}

function shouldResetSession() {
  // بازنشانی session اگر بیش از 5 دقیقه از آخرین استفاده گذشته باشد
  return sessionContext && Date.now() - sessionContext.lastUsed > 300000; // 5 دقیقه
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

    if (translationApi === "webai" && !sessionContext) {
      resetSessionContext();
    }

    switch (translationApi) {
      case "gemini":
        return await handleGeminiTranslation(text, sourceLang, targetLang);
      case "webai":
        return await handleWebAITranslation(text, sourceLang, targetLang);
      case "openai":
        return await handleOpenAITranslation(text, sourceLang, targetLang);
      case "openrouter":
        return await handleOpenRouterTranslation(text, sourceLang, targetLang);
      default:
        const error = new Error("Invalid translation API selected");
        error.type = ErrorTypes.VALIDATIONMODEL;
        error.statusCode = 400;
        throw error;
    }
  } catch (error) {
    // بررسی دقیق‌تر خطای API Key
    if (
      error.statusCode === 401 &&
      error.type === ErrorTypes.API &&
      (error.message.includes("API key") ||
        error.message === TRANSLATION_ERRORS.MISSING_API_KEY)
    ) {
      errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: error.statusCode,
      });
      return;
    }
    if (error.sessionConflict) {
      console.warn("Session conflict, retrying...");
      resetSessionContext();
      return await handleWebAITranslation(text, sourceLang, targetLang);
    }
    if (error.message?.includes("Extension context invalid")) {
      error.type = ErrorTypes.CONTEXT;
      error.statusCode = 403;
      errorHandler.handle(error, {
        type: ErrorTypes.CONTEXT,
        statusCode: 403,
      });
      return;
    }
    if (
      error.type === ErrorTypes.NETWORK ||
      error.message?.includes("Failed to fetch")
    ) {
      if (error.isWebAINetworkError) {
        return;
      }
      const networkError = new Error(TRANSLATION_ERRORS.NETWORK_FAILURE);
      networkError.type = ErrorTypes.NETWORK;
      networkError.statusCode = 503;
      errorHandler.handle(networkError, {
        type: ErrorTypes.NETWORK,
        statusCode: 503,
      });
      return;
    }

    // هندل کردن سایر خطاها
    error.statusCode = error.statusCode || 500;
    error.context = "translation-service";
    errorHandler.handle(error, {
      type: error.type || ErrorTypes.SERVICE,
      statusCode: error.statusCode || 500,
      context: "translation-service",
    });
    return;
  }
};
