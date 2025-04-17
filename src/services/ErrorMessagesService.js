// src/services/ErrorMessagesService.js
import { getTranslationString } from "../utils/i18n.js";

const errorKeys = {
  INVALID_CONTEXT: "INVALID_CONTEXT",
  API_KEY_MISSING: "API_KEY_MISSING",
  API_KEY_WRONG: "API_KEY_WRONG",
  API_KEY_FORBIDDEN: "API_KEY_FORBIDDEN",
  API_URL_MISSING: "API_URL_MISSING",
  AI_MODEL_MISSING: "AI_MODEL_MISSING",
  SERVICE_OVERLOADED: "SERVICE_OVERLOADED",
  NETWORK_FAILURE: "NETWORK_FAILURE",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  CONTEXT_LOST: "CONTEXT_LOST",
};

const errorCache = {};

export async function getErrorMessage(key) {
  if (errorCache[key]) return errorCache[key];

  const message =
    (await getTranslationString(errorKeys[key])) || getFallbackMessage(key);
  errorCache[key] = message;
  return message;
}

function getFallbackMessage(key) {
  switch (key) {
    case "INVALID_CONTEXT":
      return "Extension context invalid. Please refresh the page to continue.";
    case "API_KEY_MISSING":
      return "API Key is missing";
    case "API_KEY_WRONG":
      return "API Key is wrong";
    case "API_KEY_FORBIDDEN":
      return "API Key is forbidden";
    case "API_URL_MISSING":
      return "API URL is missing";
    case "AI_MODEL_MISSING":
      return "AI Model is missing";
    case "SERVICE_OVERLOADED":
      return "Translation service overloaded, try later.";
    case "NETWORK_FAILURE":
      return "Connection to server failed";
    case "INVALID_RESPONSE":
      return "Invalid API response format";
    case "CONTEXT_LOST":
      return "Extension context lost";
    default:
      return "Unknown error";
  }
}
