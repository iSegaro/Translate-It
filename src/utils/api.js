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
  if (sourceLang === targetLang) return null;

  const [apiKey, apiUrl] = await Promise.all([
    getApiKeyAsync(),
    getApiUrlAsync(),
  ]);

  if (!apiKey) {
    const error = new Error(TRANSLATION_ERRORS.MISSING_API_KEY);
    error.statusCode = 401;
    error.type = ErrorTypes.API;
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: 401,
      context: "handle-gemini-translation",
    });
    throw handlerError;
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
      const handlerError = errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        context: "api-gemini-translation-response",
      });
      throw handlerError;
    }

    const data = await response.json();

    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const error = new Error(
        "No translation result found in Gemini API response"
      );
      error.type = ErrorTypes.API;
      error.statusCode = response.status;
      const handlerError = errorHandler.handle(error, {
        context: "api-gemini-translation-error",
      });
      throw handlerError;
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    error.type = ErrorTypes.API;
    error.statusCode = error.statusCode || 500;
    const handlerError = errorHandler.handle(error, {
      type: error,
      statusCode: error.statusCode || 500,
      context: "api-gemini-translation",
    });
    throw handlerError;
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
        reset_session: shouldResetSession(),
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

      const handlerError = errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        service: "webai-api",
      });
      throw handlerError;
    }

    const data = await response.json();

    if (typeof data?.response !== "string") {
      const error = new Error("Invalid WebAI API response format");
      error.statusCode = 500;
      error.type = ErrorTypes.API;
      const handlerError = errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 500,
      });
      throw handlerError;
    }

    // ذخیره اطلاعات session برای استفاده بعدی
    storeSessionContext({
      model: webAIApiModel,
      lastUsed: Date.now(),
    });

    return data.response;
  } catch (error) {
    if (error.message.includes("Failed to fetch")) {
      error.code = "network-failure";
    }
    if (error.sessionConflict) {
      resetSessionContext();
    }
    error.type = ErrorTypes.NETWORK;
    error.isWebAINetworkError = true;
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.NETWORK,
      context: "webai-translation",
    });
    throw handlerError;
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
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: 401,
    });
    throw handlerError;
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
      const handlerError = errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        service: "openai",
      });
      throw handlerError;
    }

    const data = await response.json();

    if (!data?.choices?.[0]?.message?.content) {
      const error = new Error("Invalid OpenAI API response format");
      error.statusCode = 500;
      error.type = ErrorTypes.API;
      const handlerError = errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 500,
      });
      throw handlerError;
    }

    return data.choices[0].message.content;
  } catch (error) {
    error.type = ErrorTypes.API;
    error.statusCode = error.statusCode || 500;
    error.context = "openai-translation";
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: error.statusCode || 500,
      context: "openai-translation",
    });
    throw handlerError;
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
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: 401,
    });
    throw handlerError;
  }

  try {
    const prompt = await createPrompt(text, sourceLang, targetLang);
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
      error.statusCode = response.status;
      error.type = ErrorTypes.API;
      const handlerError = errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        service: "openrouter",
      });
      throw handlerError;
    }

    const data = await response.json();

    if (!data?.choices?.[0]?.message?.content) {
      const error = new Error("Invalid OpenRouter API response format");
      error.statusCode = 500;
      error.type = ErrorTypes.API;
      const handlerError = errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: 500,
      });
      throw handlerError;
    }

    return data.choices[0].message.content;
  } catch (error) {
    error.type = ErrorTypes.API;
    error.statusCode = error.statusCode || 500;
    error.context = "openrouter-translation";
    const handlerError = errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: error.statusCode || 500,
      context: "openrouter-translation",
    });
    throw handlerError;
  }
}

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
  return sessionContext && Date.now() - sessionContext.lastUsed > 300000;
}

export const translateText = async (text) => {
  if (await getUseMockAsync()) {
    await delay(MOCK_DELAY);
    return isPersianText(text) ?
        CONFIG.DEBUG_TRANSLATED_ENGLISH
      : CONFIG.DEBUG_TRANSLATED_PERSIAN;
  }

  if (!text || typeof text !== "string") {
    return null;
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
        const handlerError = errorHandler.handle(error, {
          type: ErrorTypes.VALIDATIONMODEL,
          statusCode: 400,
        });
        throw handlerError;
    }
  } catch (error) {
    // بررسی دقیق‌تر خطای API Key
    if (
      error.statusCode === 401 &&
      error.type === ErrorTypes.API &&
      (error.message.includes("API key") ||
        error.message === TRANSLATION_ERRORS.MISSING_API_KEY)
    ) {
      const handlerError = errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: error.statusCode,
        context: "api-translateText",
      });
      throw handlerError;
    }

    if (error.sessionConflict) {
      console.warn("Session conflict, retrying...");
      resetSessionContext();
      return await handleWebAITranslation(text, sourceLang, targetLang);
    }

    if (error.message?.includes("context invalid")) {
      error.type = ErrorTypes.CONTEXT;
      error.statusCode = 403;
      const handlerError = errorHandler.handle(error, {
        type: ErrorTypes.CONTEXT,
        statusCode: 403,
      });
      throw handlerError;
    }

    if (
      error.type === ErrorTypes.NETWORK ||
      error.message?.includes("Failed to fetch")
    ) {
      const networkError = new Error(TRANSLATION_ERRORS.NETWORK_FAILURE);
      networkError.type = ErrorTypes.NETWORK;
      networkError.statusCode = 503;
      const handlerError = errorHandler.handle(networkError, {
        type: ErrorTypes.NETWORK,
        statusCode: 503,
      });
      throw handlerError;
    }

    // if (error instanceof Promise) {
    //   // console.debug("Caught a Promise in translateText catch block:");
    //   error
    //     .then((resolvedValue) => {
    //       // console.debug("Promise resolved with:", resolvedValue);
    //       const handlerError = errorHandler.handle(
    //         new Error(String(resolvedValue)),
    //         {
    //           type: ErrorTypes.SERVICE, // نوع خطا را بر اساس محتوا تنظیم کنید
    //           statusCode: 600, // کد وضعیت را بر اساس محتوا تنظیم کنید
    //           context: "promise-error-in-translateText",
    //         }
    //       );
    //       return handledError;
    //     })
    //     .catch((rejectedValue) => {
    //       // console.debug("Promise rejected with:", rejectedValue);
    //       const handlerError = errorHandler.handle(
    //         new Error(String(rejectedValue)),
    //         {
    //           type: ErrorTypes.SERVICE, // نوع خطا را بر اساس محتوا تنظیم کنید
    //           statusCode: 600, // کد وضعیت را بر اساس محتوا تنظیم کنید
    //           context: "promise-rejection-in-translateText",
    //         }
    //       );
    //       return handledError;
    //     });
    //   return; // مهم: برای جلوگیری از اجرای کد پایین‌تر، return کنید
    // }

    error.statusCode = error.statusCode || 500;
    error.context = "translation-service";
    const handlerError = errorHandler.handle(error, {
      type: error.type || ErrorTypes.SERVICE,
      statusCode: error.statusCode || 500,
      context: "translation-service",
    });
    return handlerError;
  }
};
