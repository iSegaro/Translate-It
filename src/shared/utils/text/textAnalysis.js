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