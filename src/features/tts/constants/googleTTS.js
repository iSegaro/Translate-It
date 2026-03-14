/**
 * Constants and helpers for Google TTS
 */

/**
 * Google TTS base URL for translation audio
 */
export const GOOGLE_TTS_BASE_URL = 'https://translate.google.com/translate_tts';

/**
 * Default parameters for Google TTS URL
 */
export const GOOGLE_TTS_DEFAULT_PARAMS = {
  ie: 'UTF-8',
  client: 'tw-ob'
};

/**
 * Path to the offscreen document used in Chromium browsers
 */
export const OFFSCREEN_DOCUMENT_PATH = 'html/offscreen.html';

/**
 * Maximum character limit for Google TTS to avoid HTTP 400 errors
 */
export const MAX_TTS_TEXT_LENGTH = 200;

/**
 * Default fallback language for TTS
 */
export const DEFAULT_TTS_LANGUAGE = 'en';

/**
 * Regex for cleaning text for TTS. 
 * Includes ranges for:
 * - Arabic, Hebrew, Cyrillic
 * - Japanese (Hiragana, Katakana)
 * - Chinese (CJK Unified Ideographs)
 * - Korean (Hangul)
 * - CJK Punctuation, Full-width characters
 * - Latin Accents, Alphanumeric and common punctuation
 */
export const TTS_CLEANING_REGEX = /[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF\u0400-\u04FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u3000-\u303F\uFF00-\uFFEF\u00C0-\u024Fa-zA-Z0-9\s.,!?-]/g;

/**
 * Supported language codes for Google TTS
 */
export const SUPPORTED_TTS_LANGUAGES = new Set([
  'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'zh-cn', 'zh-tw',
  'ar', 'hi', 'tr', 'pl', 'nl', 'sv', 'da', 'no', 'fi', 'el', 'he', 'th',
  'vi', 'id', 'ms', 'tl', 'uk', 'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sl',
  'et', 'lv', 'lt', 'mt', 'ga', 'cy', 'is', 'mk', 'sq', 'az', 'be', 'ka',
  'hy', 'ne', 'si', 'my', 'km', 'lo', 'gu', 'ta', 'te', 'kn', 'ml', 'pa',
  'bn', 'ur', 'fa', 'ps', 'sd', 'ckb', 'ku', 'am', 'om', 'so', 'sw', 'rw',
  'ny', 'mg', 'st', 'zu', 'xh', 'af', 'sq', 'eu', 'ca', 'co', 'eo', 'fy',
  'gl', 'haw', 'hmn', 'is', 'ig', 'jw', 'kk', 'ky', 'lb', 'mi', 'mn', 'sm',
  'gd', 'sn', 'su', 'tg', 'tt', 'to', 'uz', 'yi', 'yo'
]);

/**
 * Generate a Google TTS URL
 * @param {string} text - The text to speak
 * @param {string} language - The language code
 * @returns {string} The formatted Google TTS URL
 */
export const getGoogleTTSUrl = (text, language) => {
  const url = new URL(GOOGLE_TTS_BASE_URL);
  url.searchParams.append('ie', GOOGLE_TTS_DEFAULT_PARAMS.ie);
  url.searchParams.append('q', text);
  url.searchParams.append('tl', language);
  url.searchParams.append('client', GOOGLE_TTS_DEFAULT_PARAMS.client);
  return url.toString();
};
