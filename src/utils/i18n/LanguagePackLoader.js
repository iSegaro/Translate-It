// src/utils/i18n/LanguagePackLoader.js
// Main language pack loading system - now uses specialized loaders

// Import specialized loaders
import {
  loadTranslationLanguagePack,
  preloadCoreTranslationLanguagePacks,
  getAvailableTranslationLanguageCodes,
  isTranslationLanguagePackAvailable,
  clearTranslationLanguageCache,
  getTranslationLanguageCacheInfo
} from './TranslationLanguageLoader.js';

import {
  loadInterfaceLanguagePack,
  preloadCoreInterfaceLanguagePacks,
  getAvailableInterfaceLanguageCodes,
  isInterfaceLanguagePackAvailable,
  clearInterfaceLanguageCache,
  getInterfaceLanguageCacheInfo
} from './InterfaceLanguageLoader.js';

import {
  loadTtsLanguagePack,
  preloadCoreTtsLanguagePacks,
  getAvailableTtsLanguageCodes,
  isTtsLanguagePackAvailable,
  clearTtsLanguageCache,
  getTtsLanguageCacheInfo
} from './TtsLanguageLoader.js';

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'LanguagePackLoader');

/**
 * Load a language pack dynamically (legacy function - uses translation loader)
 * @param {string} langCode - Language code to load
 * @returns {Promise<Object>} Language data
 */
export async function loadLanguagePack(langCode) {
  // For backward compatibility, use translation language loader
  return loadTranslationLanguagePack(langCode);
}

/**
 * Preload core language packs (legacy function)
 */
export async function preloadCoreLanguagePacks() {
  // Preload all specialized loaders
  await Promise.allSettled([
    preloadCoreTranslationLanguagePacks(),
    preloadCoreInterfaceLanguagePacks(),
    preloadCoreTtsLanguagePacks()
  ]);
}

/**
 * Get all available language codes (legacy function - returns translation languages)
 * @returns {Array<string>} List of available language codes
 */
export function getAvailableLanguageCodes() {
  return getAvailableTranslationLanguageCodes();
}

/**
 * Check if a language pack is available (legacy function)
 * @param {string} langCode - Language code to check
 * @returns {boolean} True if available
 */
export function isLanguagePackAvailable(langCode) {
  return isTranslationLanguagePackAvailable(langCode);
}

/**
 * Clear all language pack caches
 */
export function clearLanguagePackCache() {
  clearTranslationLanguageCache();
  clearInterfaceLanguageCache();
  clearTtsLanguageCache();
}

/**
 * Get loaded language packs info for all loaders
 * @returns {Object} Combined cache statistics
 */
export function getLanguagePackCacheInfo() {
  return {
    translation: getTranslationLanguageCacheInfo(),
    interface: getInterfaceLanguageCacheInfo(),
    tts: getTtsLanguageCacheInfo()
  };
}

/**
 * Load language pack by type
 * @param {string} langCode - Language code to load
 * @param {string} type - Type of language pack ('translation', 'interface', 'tts')
 * @returns {Promise<Object>} Language data
 */
export async function loadLanguagePackByType(langCode, type = 'translation') {
  switch (type) {
    case 'translation':
      return loadTranslationLanguagePack(langCode);
    case 'interface':
      return loadInterfaceLanguagePack(langCode);
    case 'tts':
      return loadTtsLanguagePack(langCode);
    default:
      logger.warn(`Unknown language pack type: ${type}`);
      return loadTranslationLanguagePack(langCode);
  }
}

/**
 * Get available languages by type
 * @param {string} type - Type of language pack ('translation', 'interface', 'tts')
 * @returns {Array<string>} List of available language codes
 */
export function getAvailableLanguagesByType(type = 'translation') {
  switch (type) {
    case 'translation':
      return getAvailableTranslationLanguageCodes();
    case 'interface':
      return getAvailableInterfaceLanguageCodes();
    case 'tts':
      return getAvailableTtsLanguageCodes();
    default:
      logger.warn(`Unknown language pack type: ${type}`);
      return getAvailableTranslationLanguageCodes();
  }
}

/**
 * Check if language pack is available by type
 * @param {string} langCode - Language code to check
 * @param {string} type - Type of language pack ('translation', 'interface', 'tts')
 * @returns {boolean} True if available
 */
export function isLanguagePackAvailableByType(langCode, type = 'translation') {
  switch (type) {
    case 'translation':
      return isTranslationLanguagePackAvailable(langCode);
    case 'interface':
      return isInterfaceLanguagePackAvailable(langCode);
    case 'tts':
      return isTtsLanguagePackAvailable(langCode);
    default:
      logger.warn(`Unknown language pack type: ${type}`);
      return isTranslationLanguagePackAvailable(langCode);
  }
}