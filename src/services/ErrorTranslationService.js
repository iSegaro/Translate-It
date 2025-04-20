import { getTranslationString } from "../utils/i18n.js";

// نگاشت پیام‌ها یا عبارات خطا به کلیدهای i18n
const errorKeyMap = [
  { match: "API Key is missing", key: "ERRORS_SMARTTRANSLATE_MISSING_API_KEY" },
  { match: "API Key is wrong", key: "ERRORS_API_KEY_WRONG" },
  { match: "API Key is forbidden", key: "ERRORS_API_KEY_FORBIDDEN" },
  { match: "API Key issue", key: "ERRORS_API_KEY_ISSUE" },
  { match: "API URL is missing", key: "ERRORS_API_URL_MISSING" },
  { match: "AI Model is missing", key: "ERRORS_AI_MODEL_MISSING" },
  { match: "Translation service overloaded", key: "ERRORS_SERVICE_OVERLOADED" },
  { match: "Failed to fetch", key: "ERRORS_NETWORK_FAILURE" },
  { match: "Invalid API response format", key: "ERRORS_INVALID_RESPONSE" },
  { match: "Translation failed", key: "ERRORS_SMARTTRANSLATE_FAILED" },
  { match: "context invalidated", key: "ERRORS_CONTEXT_LOST" },
];

/**
 * پردازش و ترجمه‌ی پیام خطا براساس کلیدهای i18n
 * @param {string|Error} error - پیام خطا یا شیء خطا
 * @returns {Promise<string>} - رشته ترجمه‌شده
 */
export async function translateErrorMessage(error) {
  const message =
    typeof error === "string" ? error : error?.message || "(Unknown Error)";

  for (const item of errorKeyMap) {
    if (message.includes(item.match)) {
      const translated = await getTranslationString(item.key);
      return translated || message;
    }
  }

  // fallback → پیام اصلی را برگردان
  return message;
}
