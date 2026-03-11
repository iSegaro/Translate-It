// s../error-management/ErrorMatcher.js

import { ErrorTypes } from "./ErrorTypes.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderTypes } from "@/features/translation/providers/ProviderConstants.js";
const logger = getScopedLogger(LOG_COMPONENTS.ERROR, 'ErrorMatcher');


/**
 * Determines if an error is considered "fatal" (should stop translation process)
 * @param {string|Error|object} errorOrType - Error type string, Error object, or response object
 * @returns {boolean}
 */
export function isFatalError(errorOrType) {
  if (!errorOrType) return false;
  
  const type = typeof errorOrType === 'string' 
    ? errorOrType 
    : (errorOrType.type || matchErrorToType(errorOrType));

  const fatalErrorTypes = [
    ErrorTypes.BROWSER_API_UNAVAILABLE,
    ErrorTypes.QUOTA_EXCEEDED,
    ErrorTypes.RATE_LIMIT_REACHED,
    ErrorTypes.API_KEY_INVALID,
    ErrorTypes.API_KEY_MISSING,
    ErrorTypes.API_URL_MISSING,
    ErrorTypes.MODEL_MISSING,
    ErrorTypes.INSUFFICIENT_BALANCE,
    ErrorTypes.FORBIDDEN_ERROR,
    ErrorTypes.DEEPL_QUOTA_EXCEEDED,
    ErrorTypes.GEMINI_QUOTA_REGION,
    ErrorTypes.NETWORK_ERROR,
    ErrorTypes.HTTP_ERROR,
    ErrorTypes.SERVER_ERROR,
    ErrorTypes.INVALID_REQUEST,
    ErrorTypes.MODEL_OVERLOADED
  ];

  const isFatalStatusCode = errorOrType && typeof errorOrType === 'object' && 
    [401, 402, 403, 404, 429].includes(errorOrType.statusCode);

  return fatalErrorTypes.includes(type) || isFatalStatusCode;
}

/**
 * Determines the error type for a given error object or message by prioritizing:
 * 1. An explicit `type` property on the error object.
 * 2. A specific `statusCode` (e.g., 401, 402, 429).
 * 3. Fallback to string matching for cases without a clear status code.
 * @param {Error|string} rawOrError - The error object or message string.
 * @returns {string} One of the keys from ErrorTypes.
 */
export function matchErrorToType(rawOrError = "") {
  // Priority 0: Check for AbortError (user cancellation)
  if (rawOrError && typeof rawOrError === "object" && rawOrError.name === 'AbortError') {
    return ErrorTypes.USER_CANCELLED;
  }

  // اولویت ۱: اگر نوع خطا به صراحت در آبجکت مشخص شده است
  if (rawOrError && typeof rawOrError === "object" && rawOrError.type) {
    const type = rawOrError.type;
    
    // Ensure API_RESPONSE_INVALID is properly recognized
    if (type === ErrorTypes.API_RESPONSE_INVALID) {
      return ErrorTypes.API_RESPONSE_INVALID;
    }
    
    // If it's a generic translation error or unknown type, we still want to check the message
    // for more specific errors like NETWORK_ERROR, API_KEY_MISSING, etc.
    if (type !== ErrorTypes.TRANSLATION_ERROR && 
        type !== ErrorTypes.TRANSLATION_FAILED && 
        type !== ErrorTypes.UNKNOWN &&
        type !== 'TRANSLATION_ERROR' && 
        type !== 'TRANSLATION_FAILED') {
      return type;
    }
  }

  // اولویت ۲: تشخیص دقیق خطا بر اساس کد وضعیت HTTP
  if (rawOrError && typeof rawOrError === "object" && rawOrError.statusCode) {
    const code = rawOrError.statusCode;
    if (typeof code === "number" && code >= 400 && code < 600) {
      // For ambiguous status codes (400, 422), check message first for more specific error types
      // This provides better error classification for providers that return these codes with specific messages
      if ((code === 400 || code === 422) && rawOrError.message) {
        const errorMsg = String(rawOrError.message).toLowerCase();

        // Check if this is an API key error (even with 400/422 status)
        if (errorMsg.includes("api key") ||
            errorMsg.includes("auth") ||
            errorMsg.includes("authentication") ||
            errorMsg.includes("unauthorized") ||
            errorMsg.includes("credentials") ||
            errorMsg.includes("key not") ||
            errorMsg.includes("invalid key")) {
          return ErrorTypes.API_KEY_INVALID;
        }

        // Check if message is empty (TEXT_EMPTY)
        if (errorMsg.includes("text is empty") || errorMsg.includes("empty text")) {
          return ErrorTypes.TEXT_EMPTY;
        }

        // Check if text is too long (TEXT_TOO_LONG)
        if (errorMsg.includes("text is too long") ||
            errorMsg.includes("too long") ||
            errorMsg.includes("exceeds limit") ||
            errorMsg.includes("maximum length")) {
          return ErrorTypes.TEXT_TOO_LONG;
        }
      }

      // For specific, unambiguous status codes, use direct mapping
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
        case 404: {
          // برای تمام پرووایدرها، ۴۰۴ به معنی عدم دسترسی به آدرس صحیح است و باید فرآیند متوقف شود
          const providerType = rawOrError.providerType;
          const msgLower = (rawOrError.message || "").toLowerCase();
          
          if (providerType === ProviderTypes.AI || msgLower.includes('model')) {
            return ErrorTypes.MODEL_MISSING;
          }
          // If it looks like a browser API issue
          if (msgLower.includes('chrome') || msgLower.includes('translator')) {
            return ErrorTypes.BROWSER_API_UNAVAILABLE;
          }
          return ErrorTypes.API_URL_MISSING;
        }

        // درخواست نامعتبر (پارامترها یا ساختار اشتباه)
        // After message check above, fall back to INVALID_REQUEST
        case 400:
        case 422:
          return ErrorTypes.INVALID_REQUEST;

        // محدودیت تعداد درخواست
        case 429:
          return ErrorTypes.RATE_LIMIT_REACHED;

        // DeepL-specific quota exceeded (HTTP 456)
        case 456:
          return ErrorTypes.DEEPL_QUOTA_EXCEEDED;

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

  // Normalize input to a lowercase string for message-based matching
  const rawMsg = !rawOrError ? "" : 
                 (rawOrError instanceof Error ? rawOrError.message : 
                 (typeof rawOrError === 'string' ? rawOrError : 
                 (rawOrError.message || String(rawOrError))));
  
  const msg = (rawMsg || "").toLowerCase().trim();

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
  if (msg.includes("translation failed") || msg.includes("translation_failed") || msg.includes("batch translation failed") || msg === "translation failed") return ErrorTypes.TRANSLATION_FAILED;
  if (msg.includes("translation error") || msg.includes("translation_error")) return ErrorTypes.TRANSLATION_ERROR;

  // User cancellation errors
  if (
    msg.includes("cancelled by user") ||
    msg.includes("translation cancelled") ||
    msg.includes("user cancelled") ||
    msg.includes("user_cancelled") ||
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

  // Chrome Translation API availability errors
  if (
    msg.includes("chrome translation api not available") ||
    msg.includes("translation api not available") ||
    (msg.includes("requires chrome") && msg.includes("138"))
  )
    return ErrorTypes.BROWSER_API_UNAVAILABLE;

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
    msg.includes("authentication fails") ||
    msg.includes("auth failed") ||
    msg.includes("token is invalid") ||
    msg.includes("invalid token")
  )
    return ErrorTypes.API_KEY_INVALID;
  if (
    msg.includes("api key is missing") || 
    msg.includes("key missing") || 
    msg.includes("key_missing") || 
    msg.includes("api_key_missing") ||
    msg.includes("token is missing") ||
    msg.includes("received empty token") ||
    msg.includes("empty token")
  )
    return ErrorTypes.API_KEY_MISSING;

  // API key validation errors - should trigger failover
  // Check these BEFORE generic INVALID_REQUEST to catch specific API key errors
  if (
    msg.includes("api key not valid") ||
    msg.includes("api key is invalid") ||
    msg.includes("invalid api key") ||
    msg.includes("invalid api key") ||
    msg.includes("api key invalid") ||
    msg.includes("key_invalid") ||
    msg.includes("pass a valid api key") ||
    msg.includes("api key has expired")
  )
    return ErrorTypes.API_KEY_INVALID;

  // Specific HTTP status code matching for string-based errors
  if (
    msg.includes("http 400") ||
    msg.includes("400 error") ||
    msg.includes("status 400") ||
    msg.includes("bing api returned status 400") ||
    msg.includes("http 422") ||
    msg.includes("422 error") ||
    msg.includes("bad request") ||
    msg.includes("invalid request")
  )
    return ErrorTypes.INVALID_REQUEST;

  if (
    msg.includes("http 401") ||
    msg.includes("401 error") ||
    msg.includes("unauthorized") ||
    msg.includes("authentication failed")
  )
    return ErrorTypes.API_KEY_INVALID;

  if (
    msg.includes("http 402") ||
    msg.includes("402 error") ||
    msg.includes("payment required") ||
    msg.includes("insufficient balance")
  )
    return ErrorTypes.INSUFFICIENT_BALANCE;

  if (
    msg.includes("http 403") ||
    msg.includes("403 error") ||
    msg.includes("forbidden") ||
    msg.includes("access denied")
  )
    return ErrorTypes.FORBIDDEN_ERROR;

  if (
    msg.includes("http 404") ||
    msg.includes("404 error") ||
    msg.includes("not found") ||
    msg.includes("resource not found")
  ) {
    if (msg.includes("model")) return ErrorTypes.MODEL_MISSING;
    return ErrorTypes.API_URL_MISSING;
  }

  if (
    msg.includes("http 429") ||
    msg.includes("429 error") ||
    msg.includes("status 429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("rate-limited") ||
    msg.includes("website owner's configuration")
  )
    return ErrorTypes.RATE_LIMIT_REACHED;

  // DeepL-specific HTTP 456 (quota exceeded)
  if (
    msg.includes("http 456") ||
    msg.includes("456 error") ||
    msg.includes("status 456") ||
    (msg.includes("deepl") && (msg.includes("quota exceeded") || msg.includes("character limit")))
  )
    return ErrorTypes.DEEPL_QUOTA_EXCEEDED;

  if (
    msg.includes("http 500") ||
    msg.includes("500 error") ||
    msg.includes("internal server error") ||
    msg.includes("http 502") ||
    msg.includes("502 error") ||
    msg.includes("bad gateway") ||
    msg.includes("http 503") ||
    msg.includes("503 error") ||
    msg.includes("service unavailable") ||
    msg.includes("http 524") ||
    msg.includes("524 error") ||
    msg.includes("timeout occurred")
  )
    return ErrorTypes.SERVER_ERROR;

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
    msg.includes("no endpoints") ||
    msg.includes("api_url_missing")
  )
    return ErrorTypes.API_URL_MISSING;
  if (
    msg.includes("not a valid model id") ||
    msg.includes("invalid model") ||
    msg.includes("model not found") ||
    msg.includes("model is missing") ||
    msg.includes("model not available") ||
    msg.includes("model_missing") ||
    msg.includes("is not found for api version") ||
    (msg.includes("the model `") &&
      msg.includes("does not exist or you do not have access to it"))
  )
    return ErrorTypes.MODEL_MISSING;

  if (msg.includes("the model is overloaded") || msg.includes("overloaded") || msg.includes("model_overloaded"))
    return ErrorTypes.MODEL_OVERLOADED;

  // Quota with region indicates Gemini-specific quota
  if (
    (msg.includes("quota exceeded") && msg.includes("region")) ||
    msg.includes("location is not supported") ||
    msg.includes("gemini_quota_region")
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
    msg.includes("check your plan and billing details") ||
    msg.includes("generativelanguage.googleapis.com") ||
    msg.includes("quota_exceeded")
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

  // Service Worker errors (No SW = No Service Worker)
  // These occur during extension reload when service worker is transitioning
  if (
    msg.includes("no sw") ||
    msg.includes("no service worker") ||
    (msg.includes("service worker") && msg.includes("not available")) ||
    (msg.includes("service worker") && msg.includes("invalid"))
  )
    return ErrorTypes.CONTEXT;

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

  // User cancellation and message channel closed scenarios
  if (
    msg.includes("listener indicated an asynchronous response by returning true, but the message channel closed") ||
    msg.includes("message channel closed before a response was received") ||
    msg.includes("message port closed before a response") ||
    msg.includes("receiving end does not exist")
  ) {
    // These often happen when user cancels operations
    return ErrorTypes.USER_CANCELLED;
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
    msg.includes("message port closed") ||
    msg.includes("page moved to back/forward cache") ||
    msg.includes("page-moved-to-cache") ||
    msg.includes("page moved to cache") ||
    msg.includes("back/forward cache")
  )
    return ErrorTypes.CONTEXT;

  // Otherwise unknown
  return ErrorTypes.UNKNOWN;
}
