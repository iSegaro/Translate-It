// src/services/ErrorMessagesLocalize.js

import { getErrorMessageByKey, matchErrorToKey } from "./ErrorMessages.js";

/**
 * ترجمه‌ی پیام خطا براساس کلیدهای شناخته‌شده.
 * اگر کلیدی برای پیام خطا پیدا شود، ترجمه آن از فایل messages.json بازگردانده می‌شود.
 * در غیر این صورت، خود پیام اصلی نمایش داده می‌شود.
 *
 * @param {string|Error} error
 * @returns {Promise<string>}
 */
export async function translateErrorMessage(error) {
  const raw =
    typeof error === "string" ? error
    : error instanceof Error ? error.message
    : typeof error?.message === "string" ? error.message
    : "(Unknown Error)";

  const key = matchErrorToKey(raw);
  if (key) {
    const translated = await getErrorMessageByKey(key);
    return translated || raw;
  }

  return raw;
}
