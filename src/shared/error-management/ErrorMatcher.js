// s../error-management/ErrorMatcher.js

import { ErrorTypes } from "./ErrorTypes.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.ERROR, 'ErrorMatcher');


/**
 * Determines the error type for a given error object or message by prioritizing:
 * 1. An explicit `type` property on the error object.
 * 2. A specific `statusCode` (e.g., 401, 402, 429).
 * 3. Fallback to string matching for cases without a clear status code.
 * @param {Error|string} rawOrError - The error object or message string.
 * @returns {string} One of the keys from ErrorTypes.
 */
export function matchErrorToType(rawOrError = "") {
  // اولویت ۱: اگر نوع خطا به صراحت در آبجکت مشخص شده است
  if (rawOrError && typeof rawOrError === "object" && rawOrError.type) {
    // Ensure API_RESPONSE_INVALID is properly recognized
    if (rawOrError.type === ErrorTypes.API_RESPONSE_INVALID) {
      return ErrorTypes.API_RESPONSE_INVALID;
    }
    return rawOrError.type;
  }

  // اولویت ۲: تشخیص دقیق خطا بر اساس کد وضعیت HTTP
  if (rawOrError && typeof rawOrError === "object" && rawOrError.statusCode) {
    const code = rawOrError.statusCode;
    if (typeof code === "number" && code >= 400 && code < 600) {
      switch (code) {
        // خطای مربوط به کلید API
        case 401:
          return ErrorTypes.API_KEY_INVALID;

        // خطای مربوط به اتمام اعتبار
        case 402:
          return ErrorTypes.INSUFFICIENT_BALANCE;

        // خطای دسترسی (مجوز، منطقه جغرافیایی، فیلتر محتوا)
        case 403:
          return ErrorTypes.FORBIDDEN_ERROR;

        // منبع یا مدل پیدا نشد
        case 404:
          return ErrorTypes.MODEL_MISSING;

        // درخواست نامعتبر (پارامترها یا ساختار اشتباه)
        case 400:
        case 422:
          return ErrorTypes.INVALID_REQUEST;

        // محدودیت تعداد درخواست
        case 429:
          return ErrorTypes.RATE_LIMIT_REACHED;

        // خطاهای عمومی سمت سرور
        case 500: // خطای داخلی سرور
        case 502: // Bad Gateway (مدل در دسترس نیست)
        case 503: // Service Unavailable / Overloaded
        case 524: // Origin Server Timeout
          return ErrorTypes.SERVER_ERROR;

        // سایر خطاهای HTTP
        default:
          return ErrorTypes.HTTP_ERROR;
      }
    }
  }

  const msg = String(rawOrError).toLowerCase().trim();

  // اولویت ۳: فال‌بک به روش قدیمی مبتنی بر متن خطا (برای مواردی که statusCode ندارند)
  if (typeof rawOrError === "string") {
    const rawKey = rawOrError.trim();
    if (Object.values(ErrorTypes).includes(rawKey)) {
      return rawKey;
    }
  }

  // Check for API_RESPONSE_INVALID error message specifically
  if (msg.includes("api response invalid") || msg.includes("invalid api response")) {
    return ErrorTypes.API_RESPONSE_INVALID;
  }

  //--- این بخش به عنوان فال‌بک برای مواردی که کد وضعیت در دسترس نیست، حفظ می‌شود --- //

  // Common string-based matching
  // Handle explicit timeout cases as a distinct translation timeout error
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('time out'))
    return ErrorTypes.TRANSLATION_TIMEOUT;

  if (msg.includes("text is empty")) return ErrorTypes.TEXT_EMPTY;
  if (msg.includes("prompt is invalid")) return ErrorTypes.PROMPT_INVALID;
  if (msg.includes("text is too long") || msg.includes("too long"))
    return ErrorTypes.TEXT_TOO_LONG;
  if (msg.includes("translation not found"))
    return ErrorTypes.TRANSLATION_NOT_FOUND;
  if (msg.includes("translation failed")) return ErrorTypes.TRANSLATION_FAILED;

  // User cancellation errors
  if (
    msg.includes("cancelled by user") ||
    msg.includes("translation cancelled") ||
    msg.includes("user cancelled") ||
    msg.includes("operation cancelled")
  )
    return ErrorTypes.USER_CANCELLED;

  // Provider-specific response errors
  if (msg.includes("html response") || msg.includes("returned html") || msg.includes("html instead of json"))
    return ErrorTypes.HTML_RESPONSE_ERROR;
  if (msg.includes("json parsing") || msg.includes("json parse") || msg.includes("unexpected end of json input"))
    return ErrorTypes.JSON_PARSING_ERROR;
  if (msg.includes("unexpected response") || msg.includes("unexpected format"))
    return ErrorTypes.UNEXPECTED_RESPONSE_FORMAT;

  // browser Translation API specific errors
  if (
    msg.includes("translation not available") ||
    msg.includes("language pair not supported") ||
    msg.includes("language not supported")
  )
    return ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED;

  // Import/Export password issues
  if (
    msg.includes("password is required to import") ||
    msg.includes("password is required for decryption") ||
    msg.includes("password required to decrypt")
  )
    return ErrorTypes.IMPORT_PASSWORD_REQUIRED;
  if (
    msg.includes("incorrect password") ||
    msg.includes("wrong password") ||
    msg.includes("invalid password") ||
    msg.includes("password or corrupted data")
  )
    return ErrorTypes.IMPORT_PASSWORD_INCORRECT;

  // API Key issues
  if (
    msg.includes("wrong api key") ||
    msg.includes("api key not valid") ||
    msg.includes("no auth credentials") ||
    msg.includes("incorrect api key provided") ||
    msg.includes("api key expired") ||
    msg.includes("renew the api key") ||
    msg.includes("api key expired") ||
    msg.includes("renew the api key") ||
    msg.includes("authentication fails")
  )
    return ErrorTypes.API_KEY_INVALID;
  if (msg.includes("api key is missing") || msg.includes("key missing"))
    return ErrorTypes.API_KEY_MISSING;

  // Google Translate
  if (
    msg.includes("http 400 error") ||
    msg.includes("http 400") ||
    msg.includes("400 error")
  )
    return ErrorTypes.INVALID_REQUEST;

  // API URL or model errors
  if (
    (msg.includes("api url") && msg.includes("missing")) ||
    msg.includes("no endpoints found") ||
    msg.includes("no endpoint") ||
    msg.includes("no endpoints")
  )
    return ErrorTypes.API_URL_MISSING;
  if (
    msg.includes("not a valid model id") ||
    msg.includes("invalid model") ||
    msg.includes("model not found") ||
    msg.includes("model is missing") ||
    msg.includes("model not available") ||
    msg.includes("is not found for api version") ||
    (msg.includes("the model `") &&
      msg.includes("does not exist or you do not have access to it"))
  )
    return ErrorTypes.MODEL_MISSING;

  if (msg.includes("the model is overloaded") || msg.includes("overloaded"))
    return ErrorTypes.MODEL_OVERLOADED;

  // Quota with region indicates Gemini-specific quota
  if (
    (msg.includes("quota exceeded") && msg.includes("region")) ||
    msg.includes("location is not supported")
  ) {
    logger.error('Quota exceeded with region, indicating Gemini-specific quota.',  );
    return ErrorTypes.GEMINI_QUOTA_REGION;
  }

  // Quota
  if (
    msg.includes("quota exceeded") ||
    msg.includes("gemini quota") ||
    msg.includes("resource has been exhausted") ||
    msg.includes("check quota") ||
    msg.includes("requires more credits") ||
    msg.includes("fewer max_tokens") ||
    msg.includes("insufficient balance") ||
    msg.includes("exceeded your current quota") ||
    msg.includes("check your plan and billing details")
  )
    return ErrorTypes.QUOTA_EXCEEDED;

  // Network issues
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network failure") ||
    msg.includes("connection failed") ||
    msg.includes("networkerror") ||
    msg.includes("networkerror when attempting to fetch resource")
  )
    return ErrorTypes.NETWORK_ERROR;

  // HTTP generic fallback
  if (
    msg.includes("http error") ||
    msg.includes("http status") ||
    msg.includes("http response") ||
    msg.includes("operation was aborted") ||
    msg.includes("the operation was aborted.")
  )
    return ErrorTypes.HTTP_ERROR;

  // TTS specific errors
  if (
    msg.includes("no response received for tts_stop") ||
    msg.includes("no response received for google_tts_stop")
  )
    return ErrorTypes.TTS_NO_RESPONSE;

  if (
    msg.includes("offscreen document") ||
    (msg.includes("tts") && (msg.includes("closed") || msg.includes("disconnected")))
  )
    return ErrorTypes.TTS_OFFSCREEN_CLOSED;

  if (msg.includes("tts") && msg.includes("stop") && msg.includes("failed"))
    return ErrorTypes.TTS_STOP_FAILED;

  // Extension Context Invalidated (specific case)
  if (
    msg.includes("extension context invalidated") ||
    (msg.includes("extension context") && msg.includes("invalidated"))
  )
    return ErrorTypes.EXTENSION_CONTEXT_INVALIDATED;

  // Tab Accessibility errors (specific to browser pages)
  if (
    msg.includes("feature not available on browser internal pages") ||
    (msg.includes("browser internal") && msg.includes("not available"))
  )
    return ErrorTypes.TAB_BROWSER_INTERNAL;

  if (
    msg.includes("feature not available on extension pages") ||
    (msg.includes("extension pages") && msg.includes("not available"))
  )
    return ErrorTypes.TAB_EXTENSION_PAGE;

  if (
    msg.includes("feature not available on local files") ||
    (msg.includes("local files") && msg.includes("not available"))
  )
    return ErrorTypes.TAB_LOCAL_FILE;

  if (
    msg.includes("tab is not accessible") ||
    msg.includes("tab not accessible") ||
    msg.includes("page not accessible")
  )
    return ErrorTypes.TAB_NOT_ACCESSIBLE;

  // Check for tab restriction in error object properties
  if (rawOrError && typeof rawOrError === "object") {
    // Check if error indicates a restricted page
    if (rawOrError.isRestrictedPage === true) {
      return ErrorTypes.TAB_RESTRICTED;
    }

    // Check if success is false and message indicates tab restrictions
    if (rawOrError.success === false && rawOrError.message) {
      const responseMsg = String(rawOrError.message).toLowerCase().trim();
      if (responseMsg.includes("feature not available on browser internal pages")) {
        return ErrorTypes.TAB_BROWSER_INTERNAL;
      }
      if (responseMsg.includes("feature not available on extension pages")) {
        return ErrorTypes.TAB_EXTENSION_PAGE;
      }
      if (responseMsg.includes("feature not available on local files")) {
        return ErrorTypes.TAB_LOCAL_FILE;
      }
      if (responseMsg.includes("not accessible")) {
        return ErrorTypes.TAB_NOT_ACCESSIBLE;
      }
    }
  }

  // General Context
  if (
    msg.includes("context") ||
    msg.includes("context invalid") ||
    msg.includes("extension context") ||
    msg.includes("context invalidated") ||
    msg.includes("not establish") ||
    msg.includes("not establish connection") ||
    msg.includes("could not establish connection") ||
    msg.includes("receiving end does not exist") ||
    msg.includes("message port closed") ||
    msg.includes("message channel closed") ||
    msg.includes("message channel closed before a response was received") ||
    msg.includes("page moved to back/forward cache") ||
    msg.includes("page-moved-to-cache") ||
    msg.includes("page moved to cache") ||
    msg.includes("back/forward cache")
  )
    return ErrorTypes.CONTEXT;

  // Otherwise unknown
  return ErrorTypes.UNKNOWN;
}
