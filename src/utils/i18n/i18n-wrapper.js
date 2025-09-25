// src/utils/i18n/i18n-wrapper.js
// TDZ-Safe wrapper for i18n utilities to prevent Temporal Dead Zone issues

import { utilsFactory } from '../UtilsFactory.js';

// Cache for loaded modules
let i18nCache = null;
let languagesCache = null;

/**
 * TDZ-Safe loader for i18n utilities
 */
async function getI18nUtils() {
  if (!i18nCache) {
    try {
      // Try TDZ-safe loading first
      i18nCache = await utilsFactory.getModuleSafe('i18n');
    } catch (error) {
      console.warn('Failed to load i18n utils safely, trying fallback:', error);
      // Fallback to direct import
      const module = await import('./i18n.js');
      i18nCache = {
        translateText: module.translateText,
        getTranslatedMessage: module.getTranslatedMessage,
        clearTranslationCache: module.clearTranslationCache
      };
    }
  }
  return i18nCache;
}

/**
 * TDZ-Safe loader for languages utilities
 */
async function getLanguagesUtils() {
  if (!languagesCache) {
    try {
      // Try TDZ-safe loading first
      languagesCache = await utilsFactory._loadLanguagesUtilsTzdSafe();
    } catch (error) {
      console.warn('Failed to load languages utils safely, trying fallback:', error);
      // Fallback to direct import
      const module = await import('./languages.js');
      languagesCache = {
        getLanguageCodeForTTS: module.getLanguageCodeForTTS,
        normalizeLanguageCode: module.normalizeLanguageCode,
        languageList: module.languageList
      };
    }
  }
  return languagesCache;
}

// Export individual functions with lazy loading

/**
 * TDZ-Safe wrapper for getTranslationString
 */
export async function getTranslationString(key, lang) {
  try {
    // Try direct import first for the most reliable loading
    const module = await import('./i18n.js');
    return module.getTranslationString(key, lang);
  } catch (error) {
    console.warn('Failed to load getTranslationString directly:', error);
    // Fallback to cached version
    const { translateText } = await getI18nUtils();
    return translateText(key, lang);
  }
}

/**
 * TDZ-Safe wrapper for translateText (alias for getTranslationString)
 */
export async function translateText(key, lang) {
  return getTranslationString(key, lang);
}

/**
 * TDZ-Safe wrapper for getTranslatedMessage
 */
export async function getTranslatedMessage(key, substitutions = []) {
  const { getTranslatedMessage } = await getI18nUtils();
  return getTranslatedMessage(key, substitutions);
}

/**
 * TDZ-Safe wrapper for clearTranslationCache (exported as clearTranslationsCache for compatibility)
 */
export async function clearTranslationsCache() {
  try {
    // Try direct import first for the most reliable loading
    const module = await import('./i18n.js');
    return module.clearTranslationsCache();
  } catch (error) {
    console.warn('Failed to load clearTranslationsCache directly:', error);
    // Fallback to cached version
    const { clearTranslationCache } = await getI18nUtils();
    return clearTranslationCache();
  }
}

/**
 * TDZ-Safe wrapper for getLanguageCodeForTTS
 */
export async function getLanguageCodeForTTS(languageName) {
  const { getLanguageCodeForTTS } = await getLanguagesUtils();
  return getLanguageCodeForTTS(languageName);
}

/**
 * TDZ-Safe wrapper for normalizeLanguageCode
 */
export async function normalizeLanguageCode(languageCode) {
  const { normalizeLanguageCode } = await getLanguagesUtils();
  return normalizeLanguageCode(languageCode);
}

/**
 * TDZ-Safe wrapper for languageList
 */
export async function getLanguageList() {
  const { languageList } = await getLanguagesUtils();
  return languageList;
}

// For backward compatibility, also export sync versions that may throw TDZ errors
// These are deprecated and should be replaced with async versions

/**
 * @deprecated Use async version instead
 */
export function getLanguageCodeForTTSSync(languageName) {
  console.warn('getLanguageCodeForTTSSync is deprecated. Use async getLanguageCodeForTTS instead.');
  // This may throw TDZ errors - use only in non-critical paths
  try {
    const module = require('./languages.js');
    return module.getLanguageCodeForTTS(languageName);
  } catch (e) {
    console.error('TDZ error in getLanguageCodeForTTSSync:', e);
    return 'en'; // Fallback
  }
}

/**
 * Clear all caches (useful for testing)
 */
export function clearI18nWrapperCache() {
  i18nCache = null;
  languagesCache = null;
}