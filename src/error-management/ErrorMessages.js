// s../error-management/ErrorMessages.js

import { getTranslationString } from "../utils/i18n.js";
import { ErrorTypes } from "./ErrorTypes.js";

export const errorMessages = {
  // Validation errors
  [ErrorTypes.TEXT_EMPTY]: "Text is empty",
  [ErrorTypes.PROMPT_INVALID]: "Prompt is invalid",
  [ErrorTypes.TEXT_TOO_LONG]: "Text is too long",
  [ErrorTypes.TRANSLATION_NOT_FOUND]: "Translation not found",
  [ErrorTypes.TRANSLATION_FAILED]: "Translation failed",
  [ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED]: "Language pair not supported by the selected translation service",

  // API settings errors
  [ErrorTypes.API]: "API error",
  [ErrorTypes.API_KEY_MISSING]: "API Key is missing",
  [ErrorTypes.API_KEY_INVALID]: "API Key is wrong or invalid",
  [ErrorTypes.API_URL_MISSING]: "API URL is missing",
  [ErrorTypes.MODEL_MISSING]: "AI Model is missing or invalid",
  [ErrorTypes.MODEL_OVERLOADED]: "The Model is overloaded",
  [ErrorTypes.QUOTA_EXCEEDED]: "You exceeded your current quota",
  [ErrorTypes.GEMINI_QUOTA_REGION]:
    "You reached the Gemini quota. (Region issue)",
  [ErrorTypes.INVALID_REQUEST]: "Invalid request format or parameters.", // برای 400, 422
  [ErrorTypes.INSUFFICIENT_BALANCE]:
    "Insufficient balance or credits for the selected API.", // برای 402
  [ErrorTypes.FORBIDDEN_ERROR]:
    "Access denied. Check permissions or potential content moderation.", // برای 403
  [ErrorTypes.RATE_LIMIT_REACHED]:
    "Rate limit reached. Please pace your requests or try again later.", // برای 429
  [ErrorTypes.SERVER_ERROR]:
    "The service provider's server encountered an error. Please try again later.", // برای 500, 502, 503


  // Import/Export password errors
  [ErrorTypes.IMPORT_PASSWORD_REQUIRED]: "Password is required to import encrypted settings",
  [ErrorTypes.IMPORT_PASSWORD_INCORRECT]: "Incorrect password or corrupted data",

  // Screen Capture errors
  [ErrorTypes.SCREEN_CAPTURE_FAILED]: "Failed to capture screen. Please try again.",
  [ErrorTypes.SCREEN_CAPTURE_PERMISSION_DENIED]: "Screen capture permission denied. Please enable permissions and try again.",
  [ErrorTypes.SCREEN_CAPTURE_NOT_SUPPORTED]: "Screen capture is not supported in this browser or context.",
  [ErrorTypes.IMAGE_PROCESSING_FAILED]: "Failed to process captured image. Please try again.",
  [ErrorTypes.PROVIDER_IMAGE_NOT_SUPPORTED]: "Current translation provider does not support image translation. Please select an AI provider.",

  // General errors
  [ErrorTypes.NETWORK_ERROR]: "Connection to server failed",
  [ErrorTypes.HTTP_ERROR]: "HTTP error",
  [ErrorTypes.CONTEXT]: "Extension context lost",
  [ErrorTypes.EXTENSION_CONTEXT_INVALIDATED]: "Extension reloaded, please refresh page",
  [ErrorTypes.UNKNOWN]: "An unknown error occurred",
  [ErrorTypes.TAB_AVAILABILITY]: "Tab not available",
  [ErrorTypes.UI]: "User Interface error",
  [ErrorTypes.INTEGRATION]: "Integration error",
  [ErrorTypes.SERVICE]: "Service error",
  [ErrorTypes.VALIDATION]: "Validation error",
};

/**
 * Returns a localized message for a given error type.
 * It prefixes the type with 'ERRORS_' when looking up in translations.
 */
export async function getErrorMessage(type) {
  // construct translation key (e.g. 'ERRORS_API_KEY_MISSING')
  const translationKey = type?.startsWith("ERRORS_") ? type : `ERRORS_${type}`;
  // attempt to get localized string
  let msg = await getTranslationString(translationKey);
  // fallback to default message or unknown
  if (!msg || !msg.trim()) {
    msg = errorMessages[type] || errorMessages[ErrorTypes.UNKNOWN];
  }
  return msg;
}

/**
 * Retrieves a localized error message by its key.
 * @param {string} key - The error type or message key
 * @returns {string|null} - Localized message or null if not found
 */
export function getErrorMessageByKey(key) {
  if (typeof key !== "string") return null;
  return errorMessages[key] ?? null;
}
