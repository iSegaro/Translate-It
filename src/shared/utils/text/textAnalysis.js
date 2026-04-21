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
 * Includes major languages using the Arabic script family
 */
export const ARABIC_SCRIPT_LANGUAGES = ['fa', 'ar', 'ur', 'ps', 'sd', 'ku', 'ckb', 'ug'];

/**
 * Chinese script language codes for centralized management
 */
export const CHINESE_SCRIPT_LANGUAGES = ['zh-cn', 'zh-tw', 'lzh', 'yue'];

/**
 * Devanagari script language codes for centralized management
 */
export const DEVANAGARI_SCRIPT_LANGUAGES = ['hi', 'mr', 'ne'];

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
 * @param {Object} options - Detection options
 * @param {boolean} options.useDefaults - Whether to return a default language if no unique markers found
 * @returns {string|null} Language code ('fa', 'ar', 'ur', 'ps') or null if not Arabic script
 */
export const detectArabicScriptLanguage = (text, preferences = {}, options = { useDefaults: true }) => {
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

  // Persian-specific (پ، چ، ژ، گ، ک فارسی، ی فارسی)
  const persianExclusiveChars = /[\u067E\u0686\u0698\u06AF\u06A9\u06CC]/;
  if (persianExclusiveChars.test(text)) return 'fa';

  // Arabic-specific (ة، ي عربی، ك عربی، ى)
  const arabicExclusiveChars = /[\u0629\u064A\u0643\u0649]/;
  if (arabicExclusiveChars.test(text)) return 'ar';

  // If no unique markers found and we don't want defaults, return null to allow other layers to decide
  if (!options.useDefaults) return null;

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

/**
 * Check if text contains Chinese characters (CJK Unified Ideographs)
 * @param {string} text - Text to check
 * @returns {boolean} True if text contains Chinese characters
 */
export const isChineseScriptText = (text) => {
  if (!text || typeof text !== 'string') return false;
  // CJK Unified Ideographs range
  return /[\u4E00-\u9FFF]/.test(text);
};

/**
 * Detect specific Chinese variant with user preferences
 * @param {string} text - Text to analyze
 * @param {Object} preferences - User language detection preferences
 * @param {Object} options - Detection options
 * @param {boolean} options.useDefaults - Whether to return a default language if no unique markers found
 * @returns {string|null} Language code ('zh-cn', 'zh-tw', 'lzh', 'yue') or null
 */
export const detectChineseScriptLanguage = (text, preferences = {}, options = { useDefaults: true }) => {
  if (!text || !isChineseScriptText(text)) return null;

  // 1. Heuristic: Unique Markers for Traditional vs Simplified

  // Traditional Chinese unique markers
  const traditionalMarkers = /[\u5011\u570B\u5B78\u6703\u9019]/;
  if (traditionalMarkers.test(text)) return 'zh-tw';

  // Simplified Chinese unique markers
  const simplifiedMarkers = /[\u4EEC\u56FD\u5B66\u4F1A\u8FD9]/;
  if (simplifiedMarkers.test(text)) return 'zh-cn';

  // If no unique markers found and we don't want defaults, return null
  if (!options.useDefaults) return null;

  // 2. Use user preference for ambiguous text
  const userPreference = preferences['chinese-script'];
  if (userPreference && CHINESE_SCRIPT_LANGUAGES.includes(userPreference)) {
    return userPreference;
  }

  // 3. Final Default
  return 'zh-cn';
};
/**
 * Check if text contains Devanagari characters (Hindi, Marathi, Nepali)
 * @param {string} text - Text to check
 * @returns {boolean} True if text contains Devanagari characters
 */
export const isDevanagariScriptText = (text) => {
  if (!text || typeof text !== 'string') return false;
  // Devanagari Unicode range (U+0900 to U+097F)
  return /[\u0900-\u097F]/.test(text);
};

/**
 * Detect language for Devanagari script text with user preferences
 * @param {string} text - Text to analyze
 * @param {Object} preferences - User language detection preferences
 * @param {Object} options - Detection options
 * @param {boolean} options.useDefaults - Whether to return a default language if no unique markers found
 * @returns {string|null} Language code ('hi', 'mr', 'ne') or null
 */
export const detectDevanagariScriptLanguage = (text, preferences = {}, options = { useDefaults: true }) => {
  if (!text || !isDevanagariScriptText(text)) return null;

  // 1. Language-specific unique markers
  
  // Marathi unique characters: ळ (U+0933)
  const marathiMarkers = /[\u0933]/;
  if (marathiMarkers.test(text)) return 'mr';

  // If no unique markers found and we don't want defaults, return null
  if (!options.useDefaults) return null;

  // 2. Use user preference for ambiguous text
  const userPreference = preferences['devanagari-script'];
  if (userPreference && DEVANAGARI_SCRIPT_LANGUAGES.includes(userPreference)) {
    return userPreference;
  }

  // 3. Final Default
  return 'hi';
};

/**
 * Detect language for Latin script text using unique character markers (Diacritics)
 * Highly reliable for short strings containing these specific characters.
 * 
 * @param {string} text - Text to analyze
 * @returns {string|null} Language code or null
 */
export const detectLatinScriptLanguage = (text) => {
  if (!text || typeof text !== 'string') return null;
  const sample = text.trim();

  // German: ä, ö, ü, ß
  if (/[ßäöüÄÖÜ]/.test(sample)) return 'de';
  
  // Spanish: ñ, inverted punctuation (¿, ¡)
  if (/[ñ¿¡]/.test(sample)) return 'es';
  
  // Portuguese specific (tilde)
  if (/[ãõÃÕ]/.test(sample)) return 'pt';

  // Italian specific (grave accents on vowels are common, especially at end)
  if (/[èìòùÈÌÒÙ]/.test(sample)) return 'it';

  // French / Standard Latin variants
  // Only use highly unique markers for deterministic French
  // Common accents like é, è, à are skipped here to allow statistical layer to decide
  if (/[êëîïûùôçÊËÎÏÛÙÔÇ]/.test(sample)) {
    // Turkish overlap check
    if (/[ığşİ]/.test(sample)) return 'tr';
    // Vietnamese overlap check
    if (/[đĐ₫]/.test(sample)) return 'vi';
    return 'fr'; 
  }
  
  // Nordic languages
  if (/[åøæÅØÆ]/.test(sample)) return 'no';
  
  // Cyrillic (Ukrainian/Russian)
  // Check Ukrainian specific markers first
  if (/[ґєії]/.test(sample)) return 'uk';
  // Fallback to Russian for general Cyrillic
  if (/[а-яё]/i.test(sample)) return 'ru';

  return null;
};
