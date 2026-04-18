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
 * Check if text contains Persian characters (distinguishes from Arabic)
 * @param {string} text - Text to check
 * @returns {boolean} True if text contains Persian characters
 */
export const isPersianText = (text) => {
  if (!text || typeof text !== 'string') return false;

  // Persian-specific characters (not present in Arabic):
  // پ (U+067E), چ (U+0686), ژ (U+0698), گ (U+06AF)
  const persianExclusiveChars = /[\u067E\u0686\u0698\u06AF]/;
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
 * @returns {string|null} Language code ('fa', 'ar') or null if not Arabic script
 */
export const detectArabicScriptLanguage = (text, preferences = {}) => {
  if (!text || typeof text !== 'string') return null;

  // Check if it's Arabic script
  if (!isArabicScriptText(text)) return null;

  // Persian-specific characters (not present in Arabic):
  // پ (U+067E), چ (U+0686), ژ (U+0698), گ (U+06AF)
  const persianExclusiveChars = /[\u067E\u0686\u0698\u06AF]/

  // Arabic-specific characters (less common in Persian):
  // ة (U+0629), ي (U+064A), ك (U+0643), Harakat (U+064B-U+065F)
  const arabicExclusiveChars = /[\u0629\u064A\u0643\u064B-\u065F]/

  // Priority 1: Persian exclusive characters
  if (persianExclusiveChars.test(text)) return 'fa';

  // Priority 2: Arabic exclusive characters
  if (arabicExclusiveChars.test(text)) return 'ar';

  // Priority 3: Use user preference for ambiguous text
  const userPreference = preferences['arabic-script'];
  if (userPreference) {
    return userPreference;
  }

  // Priority 4: Default to Persian (for backward compatibility)
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