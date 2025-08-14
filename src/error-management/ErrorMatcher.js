// s../error-management/ErrorMatcher.js

import { ErrorTypes } from "./ErrorTypes.js";
import { getScopedLogger } from '@/utils/core/logger.js';
const logger = getScopedLogger('Error', 'ErrorMatcher');


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

  // اولویت ۳: فال‌بک به روش قدیمی مبتنی بر متن خطا (برای مواردی که statusCode ندارند)
  if (typeof rawOrError === "string") {
    const rawKey = rawOrError.trim();
    if (Object.values(ErrorTypes).includes(rawKey)) {
      return rawKey;
    }
  }

  const msg = String(rawOrError).toLowerCase().trim();

  //--- این بخش به عنوان فال‌بک برای مواردی که کد وضعیت در دسترس نیست، حفظ می‌شود --- //

  // Common string-based matching
  if (msg.includes("text is empty")) return ErrorTypes.TEXT_EMPTY;
  if (msg.includes("prompt is invalid")) return ErrorTypes.PROMPT_INVALID;
  if (msg.includes("text is too long") || msg.includes("too long"))
    return ErrorTypes.TEXT_TOO_LONG;
  if (msg.includes("translation not found"))
    return ErrorTypes.TRANSLATION_NOT_FOUND;
  if (msg.includes("translation failed")) return ErrorTypes.TRANSLATION_FAILED;

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
    getLogger().error('Quota exceeded with region, indicating Gemini-specific quota.',  );
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

  // Extension Context Invalidated (specific case)
  if (
    msg.includes("extension context invalidated") ||
    (msg.includes("extension context") && msg.includes("invalidated"))
  )
    return ErrorTypes.EXTENSION_CONTEXT_INVALIDATED;

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
    msg.includes("message port closed")
  )
    return ErrorTypes.CONTEXT;

  // Otherwise unknown
  return ErrorTypes.UNKNOWN;
}
