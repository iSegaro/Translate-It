// src/utils/translationModeHelper.js

import { TranslationMode } from "../config.js";

// TODO: این فقط یک تست اولیه بود که هیچ تغییر نکرده
// TODO: نیاز به بازبینی و پیاده سازی یک روش پویاتر است

// همان stop-words و محدودیت‌ها که در متد اول استفاده شده
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "in",
  "on",
  "at",
  "to",
  "of",
  "for",
  "with",
  "by",
  "from",
]);

const MAX_DICT_CHARS = 15;

/**
 * بررسی می‌کند که آیا باید از حالت Dictionary_Translation استفاده شود یا خیر.
 * @param {string} text متن ورودی
 * @returns {boolean}
 */
export function isDictionaryTranslation(text) {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  const len = trimmed.length;

  const singleWord =
    words.length === 1 &&
    !STOP_WORDS.has(words[0].toLowerCase()) &&
    len <= MAX_DICT_CHARS;

  const multiWord = words.length > 1 && len <= MAX_DICT_CHARS;

  return singleWord || multiWord;
}

/**
 * بر اساس متن و حالت پیش‌فرض، حالت ترجمه را برمی‌گرداند.
 * @param {string} text
 * @param {string} defaultMode (مثلاً TranslationMode.Popup_Translate یا TranslationMode.Field)
 * @returns {string} یا همان defaultMode یا TranslationMode.Dictionary_Translation
 */
export function determineTranslationMode(text, defaultMode) {
  return isDictionaryTranslation(text)
    ? TranslationMode.Dictionary_Translation
    : defaultMode;
}
