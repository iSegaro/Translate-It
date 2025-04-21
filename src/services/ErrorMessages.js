// src/services/ErrorMessages.js
import { getTranslationString } from "../utils/i18n.js";

export const errorKeys = {
  ERRORS_API_KEY_WRONG: "API Key is wrong",
  ERRORS_API_KEY_MISSING: "API Key is missing",
  ERRORS_MODEL_MISSING: "AI Model is missing or invalid",
  ERRORS_QUOTA_EXCEEDED: "You exceeded your current quota",
  ERRORS_CONTEXT_LOST: "Extension context lost",
  ERRORS_NETWORK_FAILURE: "Connection to server failed",
  ERRORS_INVALID_RESPONSE: "Invalid API response format",
  ERRORS_SMARTTRANSLATE_FAILED: "Translation failed",
  ERRORS_GEMINI_GENERATE_QUOTA:
    "You reached the Gemini quota for content generation.",
};

export async function getErrorMessageByKey(key) {
  // ترجمه فقط از کش پیام‌ها انجام می‌شود، نه کش زبان
  let translated = await getTranslationString(key);
  if (!translated || !translated.trim()) {
    translated = errorKeys[key] || "Unknown error";
  }
  return translated;
}

export function matchErrorToKey(message = "") {
  const normalized = message
    .toLowerCase()
    .replace(/[.,!?؛،ء]/g, "")
    .trim();

  if (
    normalized.includes("api key not valid") ||
    normalized.includes("wrong api key") ||
    normalized.includes("api key is wrong")
  ) {
    return "ERRORS_API_KEY_WRONG";
  }

  if (normalized.includes("api key is missing")) {
    return "ERRORS_API_KEY_MISSING";
  }

  if (
    normalized.includes("context invalidated") ||
    normalized.includes("extension context lost") ||
    normalized.includes("context lost") ||
    normalized.includes("context invalid") ||
    normalized.includes("context invalid. please refresh")
  ) {
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

  if (
    normalized.includes("quota exceeded") &&
    normalized.includes("generate content api requests per minute")
  ) {
    return "ERRORS_GEMINI_GENERATE_QUOTA";
  }

  if (
    normalized.includes("api key not valid") ||
    normalized.includes("wrong api key") ||
    normalized.includes("api key is wrong") ||
    normalized.includes("incorrect api key provided") ||
    normalized.includes("no auth credentials found") ||
    normalized.includes("invalid api key")
  ) {
    return "ERRORS_API_KEY_WRONG";
  }

  if (
    normalized.includes("is not a valid model id") ||
    normalized.includes("invalid model") ||
    normalized.includes("model is not available") ||
    normalized.includes("model not found")
  ) {
    return "ERRORS_MODEL_MISSING";
  }

  if (
    normalized.includes("you exceeded your current quota") ||
    normalized.includes("check your plan and billing") ||
    normalized.includes("exceeded your quota limit") ||
    normalized.includes("quota exceeded") ||
    normalized.includes("quota has been exceeded")
  ) {
    return "ERRORS_QUOTA_EXCEEDED";
  }

  return null;
}
