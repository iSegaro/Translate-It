// s../error-management/ErrorMessages.js

import { ErrorTypes } from "./ErrorTypes.js";
import { matchErrorToType } from "./ErrorMatcher.js";
import ExtensionContextManager from '@/core/extensionContext.js';
import { utilsFactory } from '@/utils/UtilsFactory.js';

export const errorMessages = {
  // Validation errors
  [ErrorTypes.TEXT_EMPTY]: "Text is empty",
  [ErrorTypes.PROMPT_INVALID]: "Prompt is invalid",
  [ErrorTypes.TEXT_TOO_LONG]: "Text is too long",
  [ErrorTypes.TRANSLATION_NOT_FOUND]: "Translation not found",
  [ErrorTypes.TRANSLATION_FAILED]: "Translation failed",
  [ErrorTypes.TRANSLATION_TIMEOUT]: "Translation timed out",
  [ErrorTypes.SETTINGS_LOADING_TIMEOUT]: "Settings loading timed out",
  [ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED]:
    "Language pair not supported by the selected translation service",
  [ErrorTypes.USER_CANCELLED]: "Translation cancelled by user",
  [ErrorTypes.PAGE_TRANSLATION_STOPPED]: "Whole-page translation stopped: {error}",

  // API settings errors
  [ErrorTypes.BROWSER_API_UNAVAILABLE]: "The translation API is not available or supported in this browser",
  [ErrorTypes.API_RESPONSE_INVALID]: "Invalid API response format",
  [ErrorTypes.API_KEY_MISSING]: "API Key is missing",
  [ErrorTypes.API_KEY_INVALID]: "API Key is wrong or invalid",
  [ErrorTypes.API_URL_MISSING]: "API URL is missing. Please enter it in settings.",
  [ErrorTypes.API_ENDPOINT_INVALID]: "API Endpoint not found (404). Please check your URL.",
  [ErrorTypes.MODEL_MISSING]: "AI Model is missing or invalid",
  [ErrorTypes.MODEL_OVERLOADED]: "The Model is overloaded",
  [ErrorTypes.QUOTA_EXCEEDED]: "You exceeded your current quota",
  [ErrorTypes.GEMINI_QUOTA_REGION]:
    "You reached the Gemini quota. (Region issue)",
  [ErrorTypes.INVALID_REQUEST]: "Invalid request format or parameters.",
  [ErrorTypes.INSUFFICIENT_BALANCE]:
    "Insufficient balance or credits for the selected API.",
  [ErrorTypes.FORBIDDEN_ERROR]:
    "Access denied. Check permissions or potential content moderation.",
  [ErrorTypes.RATE_LIMIT_REACHED]:
    "Rate limit reached. Please try again in a few minutes.",
  [ErrorTypes.SERVER_ERROR]:
    "The service provider's server encountered an error. Please try again later.",
  [ErrorTypes.CIRCUIT_BREAKER_OPEN]:
    "Circuit breaker is open. This provider is temporarily disabled due to too many failures.",

  // Import/Export password errors
  [ErrorTypes.IMPORT_PASSWORD_REQUIRED]:
    "Password is required to import encrypted settings",
  [ErrorTypes.IMPORT_PASSWORD_INCORRECT]:
    "Incorrect password or corrupted data",

  // Screen Capture errors
  [ErrorTypes.SCREEN_CAPTURE_FAILED]:
    "Failed to capture screen. Please try again.",
  [ErrorTypes.SCREEN_CAPTURE_PERMISSION_DENIED]:
    "Screen capture permission denied. Please enable permissions and try again.",
  [ErrorTypes.SCREEN_CAPTURE_NOT_SUPPORTED]:
    "Screen capture is not supported in this browser or context.",
  [ErrorTypes.IMAGE_PROCESSING_FAILED]:
    "Failed to process captured image. Please try again.",
  [ErrorTypes.PROVIDER_IMAGE_NOT_SUPPORTED]:
    "Current translation provider does not support image translation. Please select an AI provider.",

  // General errors
  [ErrorTypes.NETWORK_ERROR]: "Connection to server failed",
  [ErrorTypes.HTTP_ERROR]: "HTTP error",
  [ErrorTypes.CONTEXT]: "Extension context lost",
  [ErrorTypes.EXTENSION_CONTEXT_INVALIDATED]:
    "Extension reloaded, please refresh page",
  [ErrorTypes.UNKNOWN]: "An unknown error occurred",
  [ErrorTypes.TAB_AVAILABILITY]: "Tab not available",
  [ErrorTypes.UI]: "User Interface error",
  [ErrorTypes.INTEGRATION]: "Integration error",
  [ErrorTypes.SERVICE]: "Service error",
  [ErrorTypes.VALIDATION]: "Validation error",
};

/**
 * Returns a localized message for a given error type.
 */
export async function getErrorMessage(type, skipI18n = false) {
  if (skipI18n || ExtensionContextManager.isContextError({ message: type })) {
    return ExtensionContextManager.getContextErrorMessage(type, errorMessages);
  }

  try {
    const translationKey = type?.startsWith("ERRORS_") ? type : `ERRORS_${type}`;
    const { getTranslationString } = await utilsFactory.getI18nUtils();

    const msg = await ExtensionContextManager.safeI18nOperation(
      () => getTranslationString(translationKey),
      `getErrorMessage-${type}`,
      errorMessages[type] || errorMessages[ErrorTypes.UNKNOWN]
    );

    return msg && msg.trim() ? msg : (errorMessages[type] || errorMessages[ErrorTypes.UNKNOWN]);

  } catch {
    return errorMessages[type] || errorMessages[ErrorTypes.UNKNOWN];
  }
}

/**
 * Retrieves a localized error message by its key.
 */
export function getErrorMessageByKey(key) {
  if (typeof key !== "string") return null;
  return errorMessages[key] ?? null;
}

/**
 * Translates an error object or message to a user-friendly string.
 * Consolidates logic from previous ErrorMessagesLocalize.js
 * 
 * @param {string|Error|object} error 
 * @returns {Promise<string>}
 */
export async function translateErrorMessage(error) {
  if (!error) return errorMessages[ErrorTypes.UNKNOWN];

  const type = (typeof error === 'object' && error.type) ? error.type : matchErrorToType(error);
  
  try {
    const translated = await getErrorMessage(type);
    if (translated && translated !== errorMessages[ErrorTypes.UNKNOWN]) return translated;
  } catch {
    // Fallback if i18n fails
  }

  // If we have a known error type message, use it before falling back to raw error
  if (type && errorMessages[type]) {
    return errorMessages[type];
  }

  // Final fallback to raw message
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error.message) return error.message;
  
  return errorMessages[ErrorTypes.UNKNOWN];
}

