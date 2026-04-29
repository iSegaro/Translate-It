// src/shared/error-management/ErrorMatcher.js

import { ErrorTypes } from "./ErrorTypes.js";
import { ProviderTypes } from "@/features/translation/providers/ProviderConstants.js";
import ExtensionContextManager from '@/core/extensionContext.js';

/**
 * Errors that should be handled silently without showing any UI or toast
 */
export const SILENT_ERRORS = new Set([
  ErrorTypes.CONTEXT,
  ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
  ErrorTypes.PAGE_MOVED_TO_CACHE,
  ErrorTypes.TAB_RESTRICTED,
  ErrorTypes.TAB_BROWSER_INTERNAL,
  ErrorTypes.TAB_EXTENSION_PAGE,
  ErrorTypes.TAB_LOCAL_FILE,
  ErrorTypes.TAB_NOT_ACCESSIBLE,
  ErrorTypes.NODE_ALREADY_TRANSLATED,
  ErrorTypes.USER_CANCELLED,
  ErrorTypes.TRANSLATION_CANCELLED,
  ErrorTypes.PAGE_TRANSLATION_STOPPED,
  ErrorTypes.FEATURE_BLOCKED, // New: Intentionally blocked features
]);

/**
 * Errors that should not be logged to console in production
 */
export const SUPPRESS_CONSOLE_ERRORS = new Set([
  ...SILENT_ERRORS,
  ErrorTypes.API,
  ErrorTypes.API_KEY_INVALID,
  ErrorTypes.API_KEY_MISSING,
  ErrorTypes.API_URL_MISSING,
  ErrorTypes.MODEL_MISSING,
  ErrorTypes.MODEL_OVERLOADED,
  ErrorTypes.QUOTA_EXCEEDED,
  ErrorTypes.GEMINI_QUOTA_REGION,
  ErrorTypes.NETWORK_ERROR,
  ErrorTypes.HTTP_ERROR,
  ErrorTypes.INTEGRATION,
  ErrorTypes.SERVICE,
  ErrorTypes.VALIDATION,
  ErrorTypes.UI,
  ErrorTypes.PROMPT_INVALID,
  ErrorTypes.TEXT_EMPTY,
  ErrorTypes.TEXT_TOO_LONG,
  ErrorTypes.TRANSLATION_NOT_FOUND,
  ErrorTypes.TRANSLATION_FAILED,
  ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED,
  ErrorTypes.TAB_AVAILABILITY,
  ErrorTypes.IMPORT_PASSWORD_INCORRECT,
  ErrorTypes.IMPORT_PASSWORD_REQUIRED,
  ErrorTypes.USER_CANCELLED,
]);

/**
 * Errors that should prompt the user to open settings
 */
export const SETTINGS_REQUIRED_ERRORS = new Set([
  ErrorTypes.API_KEY_INVALID,
  ErrorTypes.API_KEY_MISSING,
  ErrorTypes.MODEL_OVERLOADED,
  ErrorTypes.MODEL_MISSING,
  ErrorTypes.API_URL_MISSING,
  ErrorTypes.QUOTA_EXCEEDED,
  ErrorTypes.HTTP_ERROR,
  ErrorTypes.GEMINI_QUOTA_REGION,
  ErrorTypes.INSUFFICIENT_BALANCE,
  ErrorTypes.FORBIDDEN_ERROR,
  ErrorTypes.INVALID_REQUEST,
  ErrorTypes.SERVER_ERROR,
  ErrorTypes.CIRCUIT_BREAKER_OPEN,
]);

/**
 * Critical configuration errors that should always use localized generic messages
 */
export const CRITICAL_CONFIG_ERRORS = new Set([
  ErrorTypes.BROWSER_API_UNAVAILABLE,
  ErrorTypes.API_KEY_MISSING,
  ErrorTypes.API_KEY_INVALID,
  ErrorTypes.API_URL_MISSING,
  ErrorTypes.MODEL_MISSING,
  ErrorTypes.QUOTA_EXCEEDED,
  ErrorTypes.RATE_LIMIT_REACHED,
  ErrorTypes.INSUFFICIENT_BALANCE,
  ErrorTypes.DEEPL_QUOTA_EXCEEDED,
  ErrorTypes.GEMINI_QUOTA_REGION,
  ErrorTypes.CIRCUIT_BREAKER_OPEN,
  ErrorTypes.SETTINGS_LOADING_TIMEOUT
]);

/**
 * Errors that are generally non-recoverable without user intervention or configuration change
 */
export const FATAL_ERRORS = new Set([
  ...CRITICAL_CONFIG_ERRORS,
  ErrorTypes.FORBIDDEN_ERROR,
  ErrorTypes.NETWORK_ERROR,
  ErrorTypes.HTTP_ERROR,
  ErrorTypes.SERVER_ERROR,
  ErrorTypes.MODEL_OVERLOADED,
  ErrorTypes.INVALID_REQUEST,
  ErrorTypes.TRANSLATION_FAILED,
  ErrorTypes.TRANSLATION_ERROR,
  ErrorTypes.USER_CANCELLED,
  ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
  ErrorTypes.CONTEXT,
  ErrorTypes.PAGE_MOVED_TO_CACHE,
  ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED,
  ErrorTypes.API_RESPONSE_INVALID,
  ErrorTypes.API_ENDPOINT_INVALID,
  ErrorTypes.SETTINGS_LOADING_TIMEOUT,
  ErrorTypes.CONNECTION_LOST,
  ErrorTypes.BROWSER_API_UNAVAILABLE
]);

/**
 * ErrorMatcher - Centralizes the logic for identifying and classifying errors
 * based on their messages, codes, or types.
 */
export class ErrorMatcher {
  static matchErrorToType(error) { return matchErrorToType(error); }
  static isSilent(type) { return isSilentError(type); }
  static isFatal(type) { return isFatalError(type); }
  static needsSettings(type) { return needsSettings(type); }
  static shouldSuppressConsole(type) { return shouldSuppressConsole(type); }
  static isCancellation(error) { return isCancellationError(error); }
}

/**
 * Determines if an error is a cancellation error
 */
export function isCancellationError(error) {
  if (!error) return false;
  if (error.isCancelled) return true;
  
  const type = typeof error === 'string' ? error : (error.type || matchErrorToType(error));
  return type === ErrorTypes.USER_CANCELLED || type === ErrorTypes.TRANSLATION_CANCELLED;
}

/**
 * Determines if an error is considered "fatal" (should stop translation process)
 */
export function isFatalError(errorOrType) {
  if (!errorOrType) return false;
  
  const type = typeof errorOrType === 'string' 
    ? errorOrType 
    : (errorOrType.type || matchErrorToType(errorOrType));

  const isFatalStatusCode = errorOrType && typeof errorOrType === 'object' && 
    [401, 402, 403, 404, 429].includes(errorOrType.statusCode);

  return FATAL_ERRORS.has(type) || isFatalStatusCode;
}

/**
 * Determines if an error should trigger a retry or fallback
 */
export function isRetryableError(errorOrType) {
  return !isFatalError(errorOrType);
}

/**
 * Determines if an error should be handled silently
 */
export function isSilentError(errorOrType) {
  // If context is already invalidated, everything should be silent
  if (!ExtensionContextManager.isValidSync()) {
    return true;
  }

  const type = typeof errorOrType === 'string' ? errorOrType : (errorOrType?.type || matchErrorToType(errorOrType));
  return SILENT_ERRORS.has(type);
}

/**
 * Determines if console logging should be suppressed for this error
 */
export function shouldSuppressConsole(errorOrType) {
  const type = typeof errorOrType === 'string' ? errorOrType : (errorOrType?.type || matchErrorToType(errorOrType));
  return SUPPRESS_CONSOLE_ERRORS.has(type);
}

/**
 * Determines if the error requires user to check settings
 */
export function needsSettings(errorOrType) {
  const type = typeof errorOrType === 'string' ? errorOrType : (errorOrType?.type || matchErrorToType(errorOrType));
  return SETTINGS_REQUIRED_ERRORS.has(type);
}

/**
 * Determines the error type for a given error object or message
 * @param {Error|string|Object} rawOrError - The error object or message string.
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
    
    if (type === ErrorTypes.API_RESPONSE_INVALID) return ErrorTypes.API_RESPONSE_INVALID;
    
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
    const code = Number(rawOrError.statusCode);
    if (!isNaN(code) && code >= 400) {
      const errorMsg = String(rawOrError.message || "").toLowerCase();
      
      if (code === 400 || code === 422) {
        if (errorMsg.includes("api key") || errorMsg.includes("auth") || errorMsg.includes("invalid key")) return ErrorTypes.API_KEY_INVALID;
        if (errorMsg.includes("text is empty") || errorMsg.includes("empty text")) return ErrorTypes.TEXT_EMPTY;
        if (errorMsg.includes("too long") || errorMsg.includes("limit") || errorMsg.includes("maximum length")) return ErrorTypes.TEXT_TOO_LONG;
      }

      if (code === 404) {
        const providerType = rawOrError.providerType;
        if (providerType === ProviderTypes.AI || errorMsg.includes('model')) return ErrorTypes.MODEL_MISSING;
        if (errorMsg.includes('chrome') || errorMsg.includes('translator')) return ErrorTypes.BROWSER_API_UNAVAILABLE;
        return ErrorTypes.API_URL_MISSING;
      }

      if (code === 401) return ErrorTypes.API_KEY_INVALID;
      if (code === 402) return ErrorTypes.INSUFFICIENT_BALANCE;
      if (code === 403) return ErrorTypes.FORBIDDEN_ERROR;
      if (code === 429) return ErrorTypes.RATE_LIMIT_REACHED;
      if (code === 456) return ErrorTypes.DEEPL_QUOTA_EXCEEDED;
      
      if (code === 503 || code === 504 || code === 500) {
        if (errorMsg.includes("overloaded") || errorMsg.includes("high demand") || errorMsg.includes("busy") || errorMsg.includes("unavailable")) {
          return ErrorTypes.MODEL_OVERLOADED;
        }
      }

      if (code >= 500 && code <= 599) return ErrorTypes.SERVER_ERROR;
      return ErrorTypes.HTTP_ERROR;
    }
  }

  // Normalize input to a lowercase string for message-based matching
  let msg = "";
  try {
    const rawMsg = !rawOrError ? "" : 
                   (rawOrError instanceof Error ? rawOrError.message : 
                   (typeof rawOrError === 'string' ? rawOrError : 
                   (typeof rawOrError.message === 'string' ? rawOrError.message : 
                   (rawOrError.code || rawOrError.status || ""))));
    
    const trimmedRaw = String(rawMsg || "").trim();
    if (trimmedRaw && Object.values(ErrorTypes).includes(trimmedRaw)) {
      return trimmedRaw;
    }

    msg = String(rawMsg || "").toLowerCase().trim();
  } catch {
    msg = "unknown error";
  }

  // اولویت ۳: فال‌بک به روش قدیمی مبتنی بر متن خطا
  if (typeof rawOrError === "string") {
    const rawKey = rawOrError.trim();
    if (Object.values(ErrorTypes).includes(rawKey)) {
      return rawKey;
    }
  }

  if (msg.includes("api response invalid") || msg.includes("invalid api response")) return ErrorTypes.API_RESPONSE_INVALID;
  if (msg.includes("already been translated")) return ErrorTypes.NODE_ALREADY_TRANSLATED;
  
  // URL Construction / Endpoint errors
  if (msg.includes("failed to construct 'url'") || msg.includes("invalid url") || msg.includes("failed to construct url")) {
    return ErrorTypes.API_ENDPOINT_INVALID;
  }

  // Feature Blocked / Exclusion matching
  if (msg.includes("feature blocked") || msg.includes("blocked on this page") || msg.includes("blocked by exclusion")) {
    return ErrorTypes.FEATURE_BLOCKED;
  }

  // JavaScript / System errors
  if (msg.includes("typeerror") || msg.includes("referenceerror") || msg.includes("syntaxerror")) {
    return ErrorTypes.TRANSLATION_ERROR;
  }

  // String-based matching fallback
  if (msg.includes('settings loading timeout')) return ErrorTypes.SETTINGS_LOADING_TIMEOUT;
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('time out')) return ErrorTypes.TRANSLATION_TIMEOUT;
  if (msg.includes("text is empty")) return ErrorTypes.TEXT_EMPTY;
  if (msg.includes("prompt is invalid")) return ErrorTypes.PROMPT_INVALID;
  if (msg.includes("text is too long") || msg.includes("too long")) return ErrorTypes.TEXT_TOO_LONG;
  if (msg.includes("translation not found")) return ErrorTypes.TRANSLATION_NOT_FOUND;
  if (msg.includes("translation failed") || msg.includes("translation_failed") || msg.includes("batch translation failed") || msg === "translation failed") return ErrorTypes.TRANSLATION_FAILED;
  if (msg.includes("translation error") || msg.includes("translation_error")) return ErrorTypes.TRANSLATION_ERROR;

  if (msg.includes("cancelled by user") || 
      msg.includes("translation cancelled") || 
      msg.includes("user cancelled") || 
      msg.includes("user_cancelled") || 
      msg.includes("operation cancelled") ||
      msg === "cancelled" ||
      msg === "handler cancelled" ||
      msg === "request cancelled") return ErrorTypes.USER_CANCELLED;

  if (msg.includes("html response") || msg.includes("returned html") || msg.includes("html instead of json")) return ErrorTypes.HTML_RESPONSE_ERROR;
  if (msg.includes("json parsing") || msg.includes("json parse") || msg.includes("unexpected end of json input")) return ErrorTypes.JSON_PARSING_ERROR;
  if (msg.includes("unexpected response") || msg.includes("unexpected format")) return ErrorTypes.UNEXPECTED_RESPONSE_FORMAT;

  if (msg.includes("translation not available") || msg.includes("language pair not supported") || msg.includes("language not supported")) return ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED;
  if (msg.includes("chrome translation api not available") || msg.includes("translation api not available") || (msg.includes("requires chrome") && msg.includes("138"))) return ErrorTypes.BROWSER_API_UNAVAILABLE;

  if (msg.includes("password is required to import") || msg.includes("password is required for decryption") || msg.includes("password required to decrypt")) return ErrorTypes.IMPORT_PASSWORD_REQUIRED;
  if (msg.includes("incorrect password") || msg.includes("wrong password") || msg.includes("invalid password") || msg.includes("password or corrupted data")) return ErrorTypes.IMPORT_PASSWORD_INCORRECT;

  if (msg.includes("wrong api key") || msg.includes("api key not valid") || msg.includes("no auth credentials") || msg.includes("incorrect api key provided") || msg.includes("api key expired") || msg.includes("renew the api key") || msg.includes("authentication fails") || msg.includes("auth failed") || msg.includes("token is invalid") || msg.includes("invalid token")) return ErrorTypes.API_KEY_INVALID;
  if (msg.includes("api key is missing") || msg.includes("key missing") || msg.includes("key_missing") || msg.includes("api_key_missing") || msg.includes("token is missing") || msg.includes("received empty token") || msg.includes("empty token")) return ErrorTypes.API_KEY_MISSING;

  if (msg.includes("http 400") || msg.includes("400 error") || msg.includes("status 400") || msg.includes("bad request") || msg.includes("invalid request")) return ErrorTypes.INVALID_REQUEST;
  if (msg.includes("http 401") || msg.includes("401 error") || msg.includes("unauthorized") || msg.includes("authentication failed")) return ErrorTypes.API_KEY_INVALID;
  if (msg.includes("http 402") || msg.includes("402 error") || msg.includes("payment required") || msg.includes("insufficient balance")) return ErrorTypes.INSUFFICIENT_BALANCE;
  if (msg.includes("http 403") || msg.includes("403 error") || msg.includes("forbidden") || msg.includes("access denied")) return ErrorTypes.FORBIDDEN_ERROR;
  if (msg.includes("http 404") || msg.includes("404 error") || msg.includes("not found")) {
    if (msg.includes("model")) return ErrorTypes.MODEL_MISSING;
    return ErrorTypes.API_ENDPOINT_INVALID;
  }
  if (msg.includes("http 429") || msg.includes("429 error") || msg.includes("status 429") || msg.includes("rate limit") || msg.includes("too many requests")) return ErrorTypes.RATE_LIMIT_REACHED;
  if (msg.includes("http 456") || msg.includes("456 error") || (msg.includes("deepl") && (msg.includes("quota exceeded") || msg.includes("character limit")))) return ErrorTypes.DEEPL_QUOTA_EXCEEDED;
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504") || msg.includes("internal server error") || msg.includes("service unavailable") || msg.includes("gateway timeout")) return ErrorTypes.SERVER_ERROR;

  if ((msg.includes("api url") && msg.includes("missing")) || msg.includes("no endpoints found") || msg === "api_url_missing") return ErrorTypes.API_URL_MISSING;
  if (msg.includes("not a valid model id") || msg.includes("invalid model") || msg.includes("model not found") || msg.includes("model_missing")) return ErrorTypes.MODEL_MISSING;
  if (msg.includes("the model is overloaded") || msg.includes("overloaded") || msg.includes("model_overloaded") || msg.includes("high demand") || msg.includes("service unavailable")) return ErrorTypes.MODEL_OVERLOADED;
  if (msg.includes("circuit breaker open")) return ErrorTypes.CIRCUIT_BREAKER_OPEN;

  if ((msg.includes("quota exceeded") && msg.includes("region")) || msg.includes("location is not supported") || msg.includes("gemini_quota_region")) return ErrorTypes.GEMINI_QUOTA_REGION;
  if (msg.includes("quota exceeded") || msg.includes("resource has been exhausted") || msg.includes("quota_exceeded") || msg.includes("limit exceeded")) return ErrorTypes.QUOTA_EXCEEDED;
  if (msg.includes("insufficient balance") || msg.includes("insufficient_balance") || msg.includes("billing") || msg.includes("check your plan") || msg.includes("more credits") || msg.includes("credits") || msg.includes("api credit") || msg.includes("out of credit")) return ErrorTypes.INSUFFICIENT_BALANCE;

  if (msg.includes("failed to fetch") || msg.includes("network failure") || msg.includes("networkerror")) return ErrorTypes.NETWORK_ERROR;
  if (msg.includes("http error") || msg.includes("http status") || msg.includes("the operation was aborted.")) return ErrorTypes.HTTP_ERROR;

  if (msg.includes("extension context invalidated") || 
      (msg.includes("extension context") && msg.includes("invalidated")) ||
      msg.includes("extension context invalid before operation") ||
      msg.includes("receiving end does not exist") ||
      msg.includes("message channel closed") ||
      msg.includes("listener indicated an asynchronous response")) return ErrorTypes.EXTENSION_CONTEXT_INVALIDATED;
  
  if (msg.includes("no sw") || msg.includes("no service worker") || (msg.includes("service worker") && msg.includes("not available"))) return ErrorTypes.CONTEXT;

  return ErrorTypes.UNKNOWN;
}

export default ErrorMatcher;