// src/utils/i18n/TtsLanguageLoader.js
// Dynamic TTS language pack loading system for code splitting

// Cache for loaded TTS language packs
const ttsLanguageCache = new Map();

// Map of language codes to their chunk names for TTS providers
const TTS_LANGUAGE_CHUNKS = {
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

// Core TTS languages that should be preloaded
const CORE_TTS_LANGUAGES = ['en', 'fa'];

/**
 * Load a TTS language pack dynamically
 * @param {string} langCode - Language code to load
 * @returns {Promise<Object>} Language data
 */
export async function loadTtsLanguagePack(langCode) {
  // Normalize language code
  const normalizedCode = normalizeTtsLanguageCode(langCode);

  // Check cache first
  if (ttsLanguageCache.has(normalizedCode)) {
    return ttsLanguageCache.get(normalizedCode);
  }

  try {
    // Determine the chunk path
    const chunkPath = TTS_LANGUAGE_CHUNKS[normalizedCode];
    if (!chunkPath) {
      console.warn(`No TTS language chunk found for: ${normalizedCode}`);
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
    ttsLanguageCache.set(normalizedCode, langData);

    return langData;
  } catch (error) {
    console.error(`Failed to load TTS language pack for ${normalizedCode}:`, error);

    // Fallback to English if available
    if (normalizedCode !== 'en') {
      try {
        const fallback = await loadTtsLanguagePack('en');
        if (fallback) {
          ttsLanguageCache.set(normalizedCode, fallback);
          return fallback;
        }
      } catch (fallbackError) {
        console.error('Failed to load fallback TTS language pack:', fallbackError);
      }
    }

    return null;
  }
}

/**
 * Preload core TTS language packs
 */
export async function preloadCoreTtsLanguagePacks() {
  const promises = CORE_TTS_LANGUAGES.map(lang => loadTtsLanguagePack(lang));
  await Promise.allSettled(promises);
}

/**
 * Get all available TTS language codes
 * @returns {Array<string>} List of available language codes
 */
export function getAvailableTtsLanguageCodes() {
  return Object.keys(TTS_LANGUAGE_CHUNKS);
}

/**
 * Check if a TTS language pack is available
 * @param {string} langCode - Language code to check
 * @returns {boolean} True if available
 */
export function isTtsLanguagePackAvailable(langCode) {
  return normalizeTtsLanguageCode(langCode) in TTS_LANGUAGE_CHUNKS;
}

/**
 * Normalize TTS language code (handle variants like en-US, en-GB, etc.)
 * @param {string} langCode - Language code to normalize
 * @returns {string} Normalized language code
 */
function normalizeTtsLanguageCode(langCode) {
  if (!langCode) return 'en';

  // Convert to lowercase and extract primary language code
  const normalized = langCode.toLowerCase().split('-')[0];

  // Return the normalized code if it exists in our chunks, otherwise default to 'en'
  return TTS_LANGUAGE_CHUNKS[normalized] ? normalized : 'en';
}

/**
 * Clear TTS language pack cache
 */
export function clearTtsLanguageCache() {
  ttsLanguageCache.clear();
}

/**
 * Get loaded TTS language packs info
 * @returns {Object} Cache statistics
 */
export function getTtsLanguageCacheInfo() {
  return {
    size: ttsLanguageCache.size,
    loadedLanguages: Array.from(ttsLanguageCache.keys()),
    totalAvailable: Object.keys(TTS_LANGUAGE_CHUNKS).length
  };
}