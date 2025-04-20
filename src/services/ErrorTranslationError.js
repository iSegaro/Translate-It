// src/services/ErrorTranslationError.js

import { getTranslationString } from "../utils/i18n.js";
import { errorKeys } from "./ErrorMessagesError.js";

/**
 * بررسی محتوای پیام خطا و تطبیق با کلیدهای ترجمه.
 * در صورت یافتن، مقدار ترجمه‌شدهٔ آن کلید بازگردانده می‌شود.
 * اگر هیچ کلیدی یافت نشد، خود پیام اصلی برگردانده می‌شود.
 *
 * @param {string|Error} error - شیء Error یا رشته
 * @returns {Promise<string>} - پیام ترجمه‌شده یا پیام اصلی
 */
export async function translateErrorMessage(error) {
  const message =
    typeof error === "string" ? error : error?.message || "(Unknown Error)";

  const normalized = message.toLowerCase();

  const keyMatches = {
    [errorKeys.ERRORS_API_KEY_MISSING]: ["api key is missing", "no api key"],
    [errorKeys.ERRORS_API_KEY_WRONG]: [
      "api key not valid",
      "api key is wrong",
      "invalid api key",
    ],
    [errorKeys.ERRORS_API_KEY_FORBIDDEN]: [
      "api key is forbidden",
      "access denied",
    ],
    [errorKeys.ERRORS_API_URL_MISSING]: ["api url is missing", "no api url"],
    [errorKeys.ERRORS_AI_MODEL_MISSING]: [
      "model is missing",
      "ai model not provided",
    ],
    [errorKeys.ERRORS_SERVICE_OVERLOADED]: [
      "overloaded",
      "too many requests",
      "rate limit",
    ],
    [errorKeys.ERRORS_NETWORK_FAILURE]: [
      "failed to fetch",
      "network error",
      "connection timeout",
    ],
    [errorKeys.ERRORS_INVALID_RESPONSE]: [
      "invalid response format",
      "unexpected token",
    ],
    [errorKeys.ERRORS_CONTEXT_LOST]: [
      "context invalidated",
      "extension context invalid",
    ],
  };

  for (const [key, phrases] of Object.entries(keyMatches)) {
    if (phrases.some((p) => normalized.includes(p))) {
      const translated = await getTranslationString(key);
      return translated || message;
    }
  }

  return message;
}

/**
 * دریافت کلید ترجمه مناسب برای پیام خطا.
 * اگر عبارتی از خطا با یکی از الگوها مطابقت داشت، کلید آن پیام را بازمی‌گرداند.
 *
 * توجه: کلیدها باید با فایل messages.json هماهنگ باشند.
 *
 * @param {string} message
 * @returns {string|null} – کلید ترجمه مانند 'errors_api_key_wrong'
 */
export function matchErrorToKey(message = "") {
  const normalized = message.toLowerCase();

  const patterns = {
    ERRORS_API_KEY_MISSING: [
      "api key is missing",
      "no api key",
      "missing api key",
    ],
    ERRORS_API_KEY_WRONG: [
      "api key not valid",
      "api key is wrong",
      "invalid api key",
      "wrong api key",
    ],
    ERRORS_API_KEY_FORBIDDEN: ["access denied", "api key is forbidden"],
    ERRORS_API_URL_MISSING: ["api url is missing", "no api url"],
    ERRORS_API_MODEL_MISSING: [
      "model is missing",
      "no model",
      "model not provided",
    ],
    ERRORS_SERVICE_OVERLOADED: [
      "overloaded",
      "rate limit",
      "too many requests",
      "server is busy",
    ],
    ERRORS_NETWORK_FAILURE: [
      "failed to fetch",
      "network error",
      "connection timeout",
    ],
    ERRORS_INVALID_RESPONSE: [
      "invalid response format",
      "unexpected token",
      "malformed json",
    ],
    ERRORS_CONTEXT_LOST: [
      "context invalidated",
      "extension context invalid",
      "document is not active",
    ],
    ERRORS_SMARTTRANSLATE_FAILED: ["translation failed", "cannot translate"],
  };

  for (const [key, phrases] of Object.entries(patterns)) {
    if (phrases.some((phrase) => normalized.includes(phrase))) {
      return key;
    }
  }

  return null;
}
