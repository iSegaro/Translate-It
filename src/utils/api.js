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
    const error = new Error(TRANSLATION_ERRORS.API_KEY_MISSING);
    throw await errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: 601,
      context: "api-gemini-translation-apikey",
    });
  }

  if (!apiUrl) {
    const error = new Error(TRANSLATION_ERRORS.API_URL_MISSING);
    throw await errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: 602,
      context: "api-gemini-translation-apiurl",
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
      throw await errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        context: "api-gemini-translation-response",
      });
    }

    const data = await response.json();

    if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      const error = new Error("Invalid Gemini response format");
      throw errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status || 500,
        context: "api-gemini-translation-format",
      });
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    error = await ErrorHandler.processError(error);
    throw await errorHandler.handle(error, {
      type: error.type || ErrorTypes.API,
      statusCode: error.statusCode || 500,
      context: "api-gemini-translation",
    });
  }
}

async function handleWebAITranslation(
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

      throw await errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        context: "api-webai-translation-response",
      });
    }

    const data = await response.json();

    if (typeof data?.response !== "string") {
      const error = new Error("Invalid WebAI response format");
      throw await errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status || 500,
        context: "api-webai-translation-format",
      });
    }

    // ذخیره اطلاعات session برای استفاده بعدی
    storeSessionContext({
      model: webAIApiModel,
      lastUsed: Date.now(),
    });

    return data.response;
  } catch (error) {
    error = await ErrorHandler.processError(error);

    if (error.sessionConflict) {
      resetSessionContext();
    }
    error.type = ErrorTypes.NETWORK;
    error.isWebAINetworkError = true;
    throw await errorHandler.handle(error, {
      type: ErrorTypes.NETWORK,
      context: "api-webai-translation",
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
    throw await errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: 601,
      context: "api-openai-translation-apikey",
    });
  }

  if (!openAIApiUrl) {
    const error = new Error(TRANSLATION_ERRORS.API_URL_MISSING);
    throw await errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: 602,
      context: "api-openai-translation-apiurl",
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
      throw await errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        context: "api-openai-translation-response",
      });
    }

    const data = await response.json();

    if (!data?.choices?.[0]?.message?.content) {
      const error = new Error("Invalid OpenAI API response format");
      throw await errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status || 500,
        context: "api-openai-translation-response-format",
      });
    }

    return data.choices[0].message.content;
  } catch (error) {
    error = await ErrorHandler.processError(error);
    throw await errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: error.statusCode || 500,
      context: "api-openai-translation-error",
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
    throw await errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: 401,
      context: "api-openrouter-translation-apikey",
    });
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
      throw await errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status,
        context: "api-openrouter-translation-response",
      });
    }

    const data = await response.json();

    if (!data?.choices?.[0]?.message?.content) {
      const error = new Error("Invalid OpenRouter response format");
      throw await errorHandler.handle(error, {
        type: ErrorTypes.API,
        statusCode: response.status || 500,
        context: "api-openrouter-translation-format",
      });
    }

    return data.choices[0].message.content;
  } catch (error) {
    error = await ErrorHandler.processError(error);
    throw (handlerError = errorHandler.handle(error, {
      type: ErrorTypes.API,
      statusCode: error.statusCode || 500,
      context: "api-openrouter-translation",
    }));
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
    console.debug("api.js:translateText: => Invalid input", text);
    return null; // مقدار نامعتبر، اما خطای مهمی نیست
  }

  if (!isExtensionContextValid()) {
    throw errorHandler.handle(new Error(TRANSLATION_ERRORS.INVALID_CONTEXT), {
      type: ErrorTypes.CONTEXT,
      context: "api-translateText-context",
    });
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
        throw errorHandler.handle(
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
      console.warn("Session conflict, retrying...");
      resetSessionContext();
      return await handleWebAITranslation(text, sourceLang, targetLang, true);
    }

    throw errorHandler.handle(error, {
      type: error.type || ErrorTypes.SERVICE,
      statusCode: error.statusCode || 500,
      context: "api-translateText-translation-service",
    });
  }
};
