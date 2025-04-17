// src/services/ErrorMessagesService.js
import { getTranslationString } from "../utils/i18n.js";

const errorKeys = {
  ERRORS_INVALID_CONTEXT: "ERRORS_INVALID_CONTEXT",
  ERRORS_API_KEY_MISSING: "ERRORS_API_KEY_MISSING",
  ERRORS_API_KEY_WRONG: "ERRORS_API_KEY_WRONG",
  ERRORS_API_KEY_FORBIDDEN: "ERRORS_API_KEY_FORBIDDEN",
  ERRORS_API_URL_MISSING: "ERRORS_API_URL_MISSING",
  ERRORS_AI_MODEL_MISSING: "ERRORS_AI_MODEL_MISSING",
  ERRORS_SERVICE_OVERLOADED: "ERRORS_SERVICE_OVERLOADED",
  ERRORS_NETWORK_FAILURE: "ERRORS_NETWORK_FAILURE",
  ERRORS_INVALID_RESPONSE: "ERRORS_INVALID_RESPONSE",
  ERRORS_CONTEXT_LOST: "ERRORS_CONTEXT_LOST",
};

const errorCache = {};

export async function getErrorMessage(key) {
  if (errorCache[key]) return errorCache[key];

  // کلید ترجمه را از i18n بگیر
  let translated = await getTranslationString(errorKeys[key]);

  // اگر i18n رشتهٔ خالی یا فقط whitespace برگرداند یعنی کلید پیدا نشده است
  if (!translated || !translated.trim()) {
    translated = getFallbackMessage(key);
  }

  // فقط مقدار معتبر را کش کن تا در صورت اضافه شدن فایل locale، متنِ درست نمایش داده شود
  if (translated && translated.trim()) {
    errorCache[key] = translated;
  }
  return translated;
}

function getFallbackMessage(key) {
  switch (key) {
    case "ERRORS_INVALID_CONTEXT":
      return "Extension context invalid. Please refresh the page to continue.";
    case "ERRORS_API_KEY_MISSING":
      return "API Key is missing";
    case "ERRORS_API_KEY_WRONG":
      return "API Key is wrong";
    case "ERRORS_API_KEY_FORBIDDEN":
      return "API Key is forbidden";
    case "ERRORS_API_URL_MISSING":
      return "API URL is missing";
    case "ERRORS_AI_MODEL_MISSING":
      return "AI Model is missing";
    case "ERRORS_SERVICE_OVERLOADED":
      return "Translation service overloaded, try later.";
    case "ERRORS_NETWORK_FAILURE":
      return "Connection to server failed";
    case "ERRORS_INVALID_RESPONSE":
      return "Invalid API response format";
    case "ERRORS_CONTEXT_LOST":
      return "Extension context lost";
    default:
      return "Unknown error";
  }
}
