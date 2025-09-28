// src/utils/i18n/InterfaceLanguageLoader.js
// Dynamic interface language pack loading system for code splitting

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'InterfaceLanguageLoader');

// Cache for loaded interface language packs
const interfaceLanguageCache = new Map();

// Map of language codes to their chunk names for interface localization
const INTERFACE_LANGUAGE_CHUNKS = {
  'en': 'locales/en',
  'fa': 'locales/fa'
};

// Core interface languages that should be preloaded
const CORE_INTERFACE_LANGUAGES = ['en', 'fa'];

/**
 * Load an interface language pack dynamically
 * @param {string} langCode - Language code to load
 * @returns {Promise<Object>} Language data
 */
export async function loadInterfaceLanguagePack(langCode) {
  // Normalize language code
  const normalizedCode = normalizeInterfaceLanguageCode(langCode);

  // Check cache first
  if (interfaceLanguageCache.has(normalizedCode)) {
    return interfaceLanguageCache.get(normalizedCode);
  }

  try {
    // Determine the chunk path
    const chunkPath = INTERFACE_LANGUAGE_CHUNKS[normalizedCode];
    if (!chunkPath) {
      logger.warn(`No interface language chunk found for: ${normalizedCode}`);
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
    interfaceLanguageCache.set(normalizedCode, langData);

    return langData;
  } catch (error) {
    logger.error(`Failed to load interface language pack for ${normalizedCode}:`, error);

    // Fallback to English if available
    if (normalizedCode !== 'en') {
      try {
        const fallback = await loadInterfaceLanguagePack('en');
        if (fallback) {
          interfaceLanguageCache.set(normalizedCode, fallback);
          return fallback;
        }
      } catch (fallbackError) {
        logger.error('Failed to load fallback interface language pack:', fallbackError);
      }
    }

    return null;
  }
}

/**
 * Preload core interface language packs
 */
export async function preloadCoreInterfaceLanguagePacks() {
  const promises = CORE_INTERFACE_LANGUAGES.map(lang => loadInterfaceLanguagePack(lang));
  await Promise.allSettled(promises);
}

/**
 * Get all available interface language codes
 * @returns {Array<string>} List of available language codes
 */
export function getAvailableInterfaceLanguageCodes() {
  return Object.keys(INTERFACE_LANGUAGE_CHUNKS);
}

/**
 * Check if an interface language pack is available
 * @param {string} langCode - Language code to check
 * @returns {boolean} True if available
 */
export function isInterfaceLanguagePackAvailable(langCode) {
  return normalizeInterfaceLanguageCode(langCode) in INTERFACE_LANGUAGE_CHUNKS;
}

/**
 * Normalize interface language code (handle variants like en-US, en-GB, etc.)
 * @param {string} langCode - Language code to normalize
 * @returns {string} Normalized language code
 */
function normalizeInterfaceLanguageCode(langCode) {
  if (!langCode) return 'en';

  // Convert to lowercase and extract primary language code
  const normalized = langCode.toLowerCase().split('-')[0];

  // Return the normalized code if it exists in our chunks, otherwise default to 'en'
  return INTERFACE_LANGUAGE_CHUNKS[normalized] ? normalized : 'en';
}

/**
 * Clear interface language pack cache
 */
export function clearInterfaceLanguageCache() {
  interfaceLanguageCache.clear();
}

/**
 * Get loaded interface language packs info
 * @returns {Object} Cache statistics
 */
export function getInterfaceLanguageCacheInfo() {
  return {
    size: interfaceLanguageCache.size,
    loadedLanguages: Array.from(interfaceLanguageCache.keys()),
    totalAvailable: Object.keys(INTERFACE_LANGUAGE_CHUNKS).length
  };
}