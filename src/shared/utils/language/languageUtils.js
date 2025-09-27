/**
 * Shared Language Utilities
 * Common language detection and text direction functions used across multiple features
 */

import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js'

const logger = getScopedLogger(LOG_COMPONENTS.UTILS, 'languageUtils')

/**
 * Detect language of text using browser i18n API
 * @param {string} text - Text to detect language for
 * @returns {Promise<string|null>} Detected language code or null
 */
export async function detectTextLanguage(text) {
  try {
    const result = await browser.i18n.detectLanguage(text);
    if (result.languages.length > 0) {
      return result.languages[0].language;
    }
  } catch (error) {
    // Use ErrorHandler for language detection errors
    const errorHandler = ErrorHandler.getInstance();
    errorHandler.handle(error, {
      context: 'language-detection',
      isSilent: true, // Language detection failures are not critical
      showToast: false
    });

    logger.error("Language detection failed:", error);
  }
  return null;
}

/**
 * Get language information from language code
 * @param {string} detectedLanguageCode - Language code to look up
 * @returns {Object|null} Language info object with code, name, direction
 */
export function getLanguageInfoFromCode(detectedLanguageCode) {
  if (!detectedLanguageCode) return null;

  // This would need to be imported from a shared language list
  // For now, returning null to avoid circular dependencies
  // You may need to pass the language list as a parameter
  return null;
}

/**
 * Get language information from language name
 * @param {string} detectedLanguageName - Language name to look up
 * @param {Array} languageList - List of language objects (optional)
 * @returns {Object|null} Language info object with code, name, direction
 */
export function getLanguageInfoFromName(detectedLanguageName, languageList = null) {
  if (!detectedLanguageName) return null;

  // If languageList is provided, use it to search
  if (languageList && Array.isArray(languageList)) {
    const language = languageList.find(
      (lang) => lang.name.toLowerCase() === detectedLanguageName.toLowerCase()
    );

    if (language) {
      return {
        code: language.code,
        name: language.name,
        direction: language.direction || "ltr",
      };
    }

    // Try to find by partial match
    const partialMatch = languageList.find((lang) =>
      lang.name.toLowerCase().includes(detectedLanguageName.toLowerCase())
    );

    if (partialMatch) {
      return {
        code: partialMatch.code,
        name: partialMatch.name,
        direction: partialMatch.direction || "ltr",
      };
    }
  }

  // Fallback for common language names
  const fallbackMap = {
    english: { code: "en", name: "English", direction: "ltr" },
    persian: { code: "fa", name: "Persian", direction: "rtl" },
    arabic: { code: "ar", name: "Arabic", direction: "rtl" },
    chinese: { code: "zh", name: "Chinese", direction: "ltr" },
    spanish: { code: "es", name: "Spanish", direction: "ltr" },
    french: { code: "fr", name: "French", direction: "ltr" },
    german: { code: "de", name: "German", direction: "ltr" },
    japanese: { code: "ja", name: "Japanese", direction: "ltr" },
    korean: { code: "ko", name: "Korean", direction: "ltr" },
    russian: { code: "ru", name: "Russian", direction: "ltr" },
  };

  return fallbackMap[detectedLanguageName.toLowerCase()] || null;
}

/**
 * Apply text direction to an element
 * @param {HTMLElement} element - Target element
 * @param {boolean} rtl_direction - Whether to apply RTL direction
 */
export function applyElementDirection(element, rtl_direction = false) {
  if (!element || !element.style) return;

  element.style.direction = rtl_direction ? "rtl" : "ltr";
  element.style.textAlign = rtl_direction ? "right" : "left";
}