/**
 * OCR Language Mapping Utility
 *
 * Provides centralized mapping between extension language codes and Tesseract.js language codes.
 * This is the single source of truth for OCR language code conversions.
 *
 * @module ocrLanguageMap
 */

/**
 * Mapping of extension language codes to Tesseract.js language codes.
 * Keys: Extension language codes (e.g., 'en', 'fa', 'zh-cn')
 * Values: Tesseract.js language codes (e.g., 'eng', 'fas', 'chi_sim')
 */
export const OCR_LANGUAGE_MAP = {
  en: 'eng',
  fa: 'fas',
  fr: 'fra',
  de: 'deu',
  es: 'spa',
  it: 'ita',
  pt: 'por',
  ru: 'rus',
  'zh-cn': 'chi_sim',
  'zh-tw': 'chi_tra',
  ja: 'jpn',
  ko: 'kor',
  ar: 'ara',
  hi: 'hin',
  tr: 'tur',
  nl: 'nld',
  pl: 'pol',
  vi: 'vie',
  id: 'ind',
  th: 'tha'
};

/**
 * Convert extension language code to Tesseract.js language code.
 *
 * @param {string} languageCode - Extension language code (e.g., 'en', 'fa', 'zh-cn')
 * @param {string} [fallback='eng'] - Fallback language code if mapping not found
 * @returns {string} Tesseract.js language code
 *
 * @example
 * toTesseractLanguageCode('en') // Returns 'eng'
 * toTesseractLanguageCode('fa') // Returns 'fas'
 * toTesseractLanguageCode('unknown') // Returns 'eng' (fallback)
 * toTesseractLanguageCode('unknown', 'fra') // Returns 'fra' (custom fallback)
 */
export function toTesseractLanguageCode(languageCode, fallback = 'eng') {
  // Handle special cases
  if (!languageCode || languageCode === 'auto' || languageCode === 'detect') {
    return fallback;
  }

  return OCR_LANGUAGE_MAP[languageCode] || languageCode || fallback;
}

/**
 * Get all supported extension language codes.
 *
 * @returns {string[]} Array of extension language codes
 */
export function getSupportedLanguageCodes() {
  return Object.keys(OCR_LANGUAGE_MAP);
}

/**
 * Check if a language code is supported for OCR.
 *
 * @param {string} languageCode - Extension language code to check
 * @returns {boolean} True if language is supported
 */
export function isLanguageSupported(languageCode) {
  return languageCode in OCR_LANGUAGE_MAP;
}
