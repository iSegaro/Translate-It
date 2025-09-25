// src/utils/i18n/LanguagePackLoader.js
// Dynamic language pack loading system for code splitting

// Cache for loaded language packs
const languagePackCache = new Map();

// Map of language codes to their chunk names
const LANGUAGE_CHUNKS = {
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
  'mt': 'locales/mt',
  'ga': 'locales/ga',
  'cy': 'locales/cy',
  'eu': 'locales/eu',
  'ca': 'locales/ca',
  'gl': 'locales/gl',
  'is': 'locales/is',
  'mk': 'locales/mk',
  'sq': 'locales/sq',
  'bs': 'locales/bs',
  'me': 'locales/me',
  'hr': 'locales/hr',
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
  'gu': 'locales/gu',
  'mr': 'locales/mr',
  'ne': 'locales/ne',
  'pa': 'locales/pa',
  'si': 'locales/si',
  'my': 'locales/my',
  'km': 'locales/km',
  'lo': 'locales/lo',
  'ka': 'locales/ka',
  'hy': 'locales/hy',
  'az': 'locales/az',
  'kk': 'locales/kk',
  'ky': 'locales/ky',
  'uz': 'locales/uz',
  'tg': 'locales/tg',
  'tk': 'locales/tk',
  'mn': 'locales/mn',
  'bo': 'locales/bo',
  'dz': 'locales/dz',
  'am': 'locales/am',
  'ti': 'locales/ti',
  'so': 'locales/so',
  'sw': 'locales/sw',
  'zu': 'locales/zu',
  'af': 'locales/af',
  'xh': 'locales/xh',
  'st': 'locales/st',
  'nso': 'locales/nso',
  'tn': 'locales/tn',
  'ss': 'locales/ss',
  'ts': 'locales/ts',
  've': 'locales/ve',
  'nr': 'locales/nr',
  'om': 'locales/om',
  'ti': 'locales/ti',
  'rw': 'locales/rw',
  'rn': 'locales/rn',
  'lg': 'locales/lg',
  'sn': 'locales/sn',
  'yo': 'locales/yo',
  'ig': 'locales/ig',
  'ha': 'locales/ha',
  'tw': 'locales/tw',
  'ak': 'locales/ak',
  'ee': 'locales/ee',
  'ff': 'locales/ff',
  'wo': 'locales/wo',
  'bm': 'locales/bm',
  'ki': 'locales/ki',
  'sw': 'locales/sw',
  'mg': 'locales/mg',
  'ny': 'locales/ny',
  'ss': 'locales/ss',
  'ts': 'locales/ts',
  'tn': 'locales/tn',
  've': 'locales/ve',
  'xh': 'locales/xh',
  'zu': 'locales/zu',
  'st': 'locales/st',
  'nso': 'locales/nso',
  'nr': 'locales/nr',
  'om': 'locales/om',
  'ti': 'locales/ti',
  'rw': 'locales/rw',
  'rn': 'locales/rn',
  'lg': 'locales/lg',
  'sn': 'locales/sn',
  'yo': 'locales/yo',
  'ig': 'locales/ig',
  'ha': 'locales/ha',
  'tw': 'locales/tw',
  'ak': 'locales/ak',
  'ee': 'locales/ee',
  'ff': 'locales/ff',
  'wo': 'locales/wo',
  'bm': 'locales/bm',
  'ki': 'locales/ki',
  'mg': 'locales/mg',
  'ny': 'locales/ny'
};

// Core languages that should be preloaded
const CORE_LANGUAGES = ['en', 'fa'];

/**
 * Load a language pack dynamically
 * @param {string} langCode - Language code to load
 * @returns {Promise<Object>} Language data
 */
export async function loadLanguagePack(langCode) {
  // Normalize language code
  const normalizedCode = normalizeLanguageCode(langCode);

  // Check cache first
  if (languagePackCache.has(normalizedCode)) {
    return languagePackCache.get(normalizedCode);
  }

  try {
    // Determine the chunk path
    const chunkPath = LANGUAGE_CHUNKS[normalizedCode];
    if (!chunkPath) {
      console.warn(`No language chunk found for: ${normalizedCode}`);
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
    languagePackCache.set(normalizedCode, langData);

    return langData;
  } catch (error) {
    console.error(`Failed to load language pack for ${normalizedCode}:`, error);

    // Fallback to English if available
    if (normalizedCode !== 'en') {
      try {
        const fallback = await loadLanguagePack('en');
        if (fallback) {
          languagePackCache.set(normalizedCode, fallback);
          return fallback;
        }
      } catch (fallbackError) {
        console.error('Failed to load fallback language pack:', fallbackError);
      }
    }

    return null;
  }
}

/**
 * Preload core language packs
 */
export async function preloadCoreLanguagePacks() {
  const promises = CORE_LANGUAGES.map(lang => loadLanguagePack(lang));
  await Promise.allSettled(promises);
}

/**
 * Get all available language codes
 * @returns {Array<string>} List of available language codes
 */
export function getAvailableLanguageCodes() {
  return Object.keys(LANGUAGE_CHUNKS);
}

/**
 * Check if a language pack is available
 * @param {string} langCode - Language code to check
 * @returns {boolean} True if available
 */
export function isLanguagePackAvailable(langCode) {
  return normalizeLanguageCode(langCode) in LANGUAGE_CHUNKS;
}

/**
 * Normalize language code (handle variants like en-US, en-GB, etc.)
 * @param {string} langCode - Language code to normalize
 * @returns {string} Normalized language code
 */
function normalizeLanguageCode(langCode) {
  if (!langCode) return 'en';

  // Convert to lowercase and extract primary language code
  const normalized = langCode.toLowerCase().split('-')[0];

  // Return the normalized code if it exists in our chunks, otherwise default to 'en'
  return LANGUAGE_CHUNKS[normalized] ? normalized : 'en';
}

/**
 * Clear language pack cache
 */
export function clearLanguagePackCache() {
  languagePackCache.clear();
}

/**
 * Get loaded language packs info
 * @returns {Object} Cache statistics
 */
export function getLanguagePackCacheInfo() {
  return {
    size: languagePackCache.size,
    loadedLanguages: Array.from(languagePackCache.keys()),
    totalAvailable: Object.keys(LANGUAGE_CHUNKS).length
  };
}