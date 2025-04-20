// src/services/ErrorMessagesService.js
import { getTranslationString } from "../utils/i18n.js";

export const errorKeys = {
  ERRORS_API_KEY_WRONG: "API Key is wrong",
  ERRORS_API_KEY_MISSING: "API Key is missing",
  ERRORS_CONTEXT_LOST: "Extension context lost",
  ERRORS_NETWORK_FAILURE: "Connection to server failed",
  ERRORS_INVALID_RESPONSE: "Invalid API response format",
  ERRORS_SMARTTRANSLATE_FAILED: "Translation failed",
};

const errorCache = {};

export async function getErrorMessageByKey(key) {
  if (errorCache[key]) return errorCache[key];
  let translated = await getTranslationString(key);
  if (!translated || !translated.trim()) {
    translated = errorKeys[key] || "Unknown error";
  }
  errorCache[key] = translated;
  return translated;
}

export function matchErrorToKey(message = "") {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("api key not valid") ||
    normalized.includes("wrong api key")
  ) {
    return "ERRORS_API_KEY_WRONG";
  }
  if (normalized.includes("api key is missing")) {
    return "ERRORS_API_KEY_MISSING";
  }
  if (normalized.includes("context invalidated")) {
    return "ERRORS_CONTEXT_LOST";
  }
  if (normalized.includes("failed to fetch")) {
    return "ERRORS_NETWORK_FAILURE";
  }
  if (normalized.includes("invalid api response")) {
    return "ERRORS_INVALID_RESPONSE";
  }
  if (normalized.includes("translation failed")) {
    return "ERRORS_SMARTTRANSLATE_FAILED";
  }
  return null;
}
