// src/utils/i18n/TranslationLanguageLoader.js
// Dynamic translation language pack loading system for code splitting

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'TranslationLanguageLoader');

// Cache for loaded translation language packs
const translationLanguageCache = new Map();

// Map of language codes to their chunk names for translation providers
const TRANSLATION_LANGUAGE_CHUNKS = {
  'en': 'locales/en',
  'fa': 'locales/fa',
  'de': 'locales/de',
  'fr': 'locales/fr',
  'es': 'locales/es',
  'it': 'locales/it',
  'pt': 'locales/pt',
  'ru': 'locales/ru',
  'zh': 'locales/zh',
  'ja': 'locales/ja',
  'ko': 'locales/ko',
  'ar': 'locales/ar',
  'hi': 'locales/hi',
  'bn': 'locales/bn',
  'ur': 'locales/ur',
  'tr': 'locales/tr',
  'nl': 'locales/nl',
  'sv': 'locales/sv',
  'da': 'locales/da',
  'no': 'locales/no',
  'fi': 'locales/fi',
  'pl': 'locales/pl',
  'cs': 'locales/cs',
  'sk': 'locales/sk',
  'hu': 'locales/hu',
  'ro': 'locales/ro',
  'bg': 'locales/bg',
  'hr': 'locales/hr',
  'sr': 'locales/sr',
  'sl': 'locales/sl',
  'et': 'locales/et',
  'lv': 'locales/lv',
  'lt': 'locales/lt',
  'el': 'locales/el',
  'he': 'locales/he',
  'id': 'locales/id',
  'ms': 'locales/ms',
  'tl': 'locales/tl',
  'vi': 'locales/vi',
  'th': 'locales/th',
  'ml': 'locales/ml',
  'ta': 'locales/ta',
  'te': 'locales/te',
  'kn': 'locales/kn',
    'mr': 'locales/mr',
  'ne': 'locales/ne',
  'pa': 'locales/pa',
  'si': 'locales/si',
  'sw': 'locales/sw',
  'af': 'locales/af',
  'kk': 'locales/kk',
  'uz': 'locales/uz',
  'uk': 'locales/uk',
  'sq': 'locales/sq',
  'ps': 'locales/ps',
  'or': 'locales/or',
  'az': 'locales/az',
  'be': 'locales/be',
  'ca': 'locales/ca',
  'fil': 'locales/fil'
};

// Core translation languages that should be preloaded
const CORE_TRANSLATION_LANGUAGES = ['en', 'fa'];

/**
 * Load a translation language pack dynamically
 * @param {string} langCode - Language code to load
 * @returns {Promise<Object>} Language data
 */
export async function loadTranslationLanguagePack(langCode) {
  // Normalize language code
  const normalizedCode = normalizeTranslationLanguageCode(langCode);

  // Check cache first
  if (translationLanguageCache.has(normalizedCode)) {
    return translationLanguageCache.get(normalizedCode);
  }

  try {
    // Determine the chunk path
    const chunkPath = TRANSLATION_LANGUAGE_CHUNKS[normalizedCode];
    if (!chunkPath) {
      logger.warn(`No translation language chunk found for: ${normalizedCode}`);
      return null;
    }

    // Dynamically import the language chunk
    const langModule = await import(
      /* webpackChunkName: "locales/[request]" */
      /* webpackMode: "lazy-once" */
      `./locales/${normalizedCode}.json`
    );

    const langData = langModule.default || langModule;

    // Cache the loaded data
    translationLanguageCache.set(normalizedCode, langData);

    return langData;
  } catch (error) {
    logger.error(`Failed to load translation language pack for ${normalizedCode}:`, error);

    // Fallback to English if available
    if (normalizedCode !== 'en') {
      try {
        const fallback = await loadTranslationLanguagePack('en');
        if (fallback) {
          translationLanguageCache.set(normalizedCode, fallback);
          return fallback;
        }
      } catch (fallbackError) {
        logger.error('Failed to load fallback translation language pack:', fallbackError);
      }
    }

    return null;
  }
}

/**
 * Preload core translation language packs
 */
export async function preloadCoreTranslationLanguagePacks() {
  const promises = CORE_TRANSLATION_LANGUAGES.map(lang => loadTranslationLanguagePack(lang));
  await Promise.allSettled(promises);
}

/**
 * Get all available translation language codes
 * @returns {Array<string>} List of available language codes
 */
export function getAvailableTranslationLanguageCodes() {
  return Object.keys(TRANSLATION_LANGUAGE_CHUNKS);
}

/**
 * Check if a translation language pack is available
 * @param {string} langCode - Language code to check
 * @returns {boolean} True if available
 */
export function isTranslationLanguagePackAvailable(langCode) {
  return normalizeTranslationLanguageCode(langCode) in TRANSLATION_LANGUAGE_CHUNKS;
}

/**
 * Normalize translation language code (handle variants like en-US, en-GB, etc.)
 * @param {string} langCode - Language code to normalize
 * @returns {string} Normalized language code
 */
function normalizeTranslationLanguageCode(langCode) {
  if (!langCode) return 'en';

  // Convert to lowercase and extract primary language code
  const normalized = langCode.toLowerCase().split('-')[0];

  // Return the normalized code if it exists in our chunks, otherwise default to 'en'
  return TRANSLATION_LANGUAGE_CHUNKS[normalized] ? normalized : 'en';
}

/**
 * Clear translation language pack cache
 */
export function clearTranslationLanguageCache() {
  translationLanguageCache.clear();
}

/**
 * Get loaded translation language packs info
 * @returns {Object} Cache statistics
 */
export function getTranslationLanguageCacheInfo() {
  return {
    size: translationLanguageCache.size,
    loadedLanguages: Array.from(translationLanguageCache.keys()),
    totalAvailable: Object.keys(TRANSLATION_LANGUAGE_CHUNKS).length
  };
}