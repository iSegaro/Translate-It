/**
 * Shared Text Analysis Utilities
 * Common text processing functions used across multiple features
 */

/**
 * Check if text is a single word or short phrase
 * @param {string} text - Text to check
 * @returns {boolean} True if text is single word or short phrase
 */
export function isSingleWordOrShortPhrase(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return false;
  }

  // Define thresholds
  const MAX_WORDS = 3;
  const MAX_CHARS = 30;

  const words = trimmedText.split(/\s+/); // Split by one or more whitespace characters

  return words.length <= MAX_WORDS && trimmedText.length <= MAX_CHARS;
}

/**
 * Arabic script language codes for centralized management
 */
export const ARABIC_SCRIPT_LANGUAGES = ['fa', 'ar', 'ur', 'ps'];

/**
 * Check if text contains Persian characters (distinguishes from Arabic)
 * @param {string} text - Text to check
 * @returns {boolean} True if text contains Persian characters
 */
export const isPersianText = (text) => {
  if (!text || typeof text !== 'string') return false;

  // Persian-specific characters (not present in standard Arabic):
  // پ (U+067E), چ (U+0686), ژ (U+0698), گ (U+06AF), ک (U+06A9), ی (U+06CC)
  const persianExclusiveChars = /[\u067E\u0686\u0698\u06AF\u06A9\u06CC]/;
  return persianExclusiveChars.test(text);
};

/**
 * Check if text contains Arabic script (both Arabic and Persian)
 * @param {string} text - Text to check
 * @returns {boolean} True if text contains Arabic script characters
 */
export const isArabicScriptText = (text) => {
  if (!text || typeof text !== 'string') return false;

  // Arabic/Persian Unicode range (U+0600 to U+06FF)
  const arabicScriptRegex = /[\u0600-\u06FF]/;
  return arabicScriptRegex.test(text);
};

/**
 * Detect language for Arabic script text with user preferences
 * @param {string} text - Text to analyze
 * @param {Object} preferences - User language detection preferences
 * @returns {string|null} Language code ('fa', 'ar', 'ur', 'ps') or null if not Arabic script
 */
export const detectArabicScriptLanguage = (text, preferences = {}) => {
  if (!text || typeof text !== 'string') return null;

  // Check if it's Arabic script
  if (!isArabicScriptText(text)) return null;

  // 1. Language-specific unique characters
  
  // Urdu-specific (U+0621, U+0624, U+0626, U+0679, U+0686, U+0688, U+0691, U+06AF, U+06BA, U+06BE, U+06C1, U+06D2)
  const urduExclusiveChars = /[\u0679\u0688\u0691\u06BA\u06BE\u06C1\u06D2]/;
  if (urduExclusiveChars.test(text)) return 'ur';

  // Pashto-specific (U+0672, U+0675, U+0681, U+0685, U+0692, U+069A, U+06BC, U+06CD, U+06D0)
  const pashtoExclusiveChars = /[\u0672\u0675\u0681\u0685\u0692\u069A\u06BC\u06CD\u06D0]/;
  if (pashtoExclusiveChars.test(text)) return 'ps';

  // Persian-specific (not present in standard Arabic):
  // پ (U+067E), چ (U+0686), ژ (U+0698), گ (U+06AF), ک (U+06A9 - Persian Kaf), ی (U+06CC - Persian Yeh)
  const persianExclusiveChars = /[\u067E\u0686\u0698\u06AF\u06A9\u06CC]/;
  if (persianExclusiveChars.test(text)) return 'fa';

  // Arabic-specific (not standard in Persian/Urdu/Pashto):
  // ة (U+0629), ي (U+064A - Arabic Yeh), ك (U+0643 - Arabic Kaf), ى (U+0649 - Alef Maksura)
  const arabicExclusiveChars = /[\u0629\u064A\u0643\u0649]/;
  if (arabicExclusiveChars.test(text)) return 'ar';

  // 2. Use user preference for ambiguous text (like "سلام")
  const userPreference = preferences['arabic-script'];
  if (userPreference && ARABIC_SCRIPT_LANGUAGES.includes(userPreference)) {
    return userPreference;
  }

  // 3. Final Default
  return 'fa';
};

/**
 * Check if RTL (Right-to-Left) should be applied to text
 * @param {string} text - Text to check
 * @returns {boolean} True if RTL should be applied
 */
export const shouldApplyRtl = (text) => {
  if (!text || typeof text !== 'string') return false;

  // Check for RTL characters (Arabic, Hebrew, Persian)
  const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return rtlRegex.test(text);
};

/**
 * Apply text direction to an element
 * @param {HTMLElement} element - Target element
 * @param {boolean} rtl_direction - Whether to apply RTL direction
 */
export const applyElementDirection = (element, rtl_direction = false) => {
  if (!element || !element.style) return;

  element.style.direction = rtl_direction ? "rtl" : "ltr";
  element.style.textAlign = rtl_direction ? "right" : "left";
};

/**
 * Correct text direction of an element based on content
 * @param {HTMLElement} element - Target element
 * @param {string} text - Text content to check
 */
export const correctTextDirection = (element, text) => {
  if (!element) return;

  const isRtl = shouldApplyRtl(text);
  applyElementDirection(element, isRtl);
};