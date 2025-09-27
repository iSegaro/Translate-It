// src/utils/i18n/languages.js - Dynamically loaded language packs with lazy loading

import { loadLanguagePack, preloadCoreLanguagePacks, getAvailableLanguageCodes, loadLanguagePackByType } from './LanguagePackLoader.js';
import { lazyLoadTranslationLanguage, preloadUserLanguages, getLanguageDataLazy } from './LazyLanguageLoader.js';

// A minimal list of languages for UI elements to avoid loading all language data.
export const basicLanguageList = [
  { code: "en", name: "English" },
  { code: "fa", name: "Farsi" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "zh", name: "Chinese (Simplified)" },
  { code: "es", name: "Spanish" },
  { code: "hi", name: "Hindi" },
  { code: "ar", name: "Arabic" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  // Add other frequently used languages here if needed
];

// Cache for loaded language data (now managed by LanguagePackLoader)
const languageCache = new Map();

/**
 * Dynamically imports the data for a specific language using lazy loading.
 * @param {string} code - The language code (e.g., 'en', 'fa').
 * @returns {Promise<Object|null>} The language data object or null if not found.
 */
export async function getLanguageData(code) {
  if (languageCache.has(code)) {
    return languageCache.get(code);
  }

  try {
    // Use lazy loading for better performance
    const langData = await lazyLoadTranslationLanguage(code);
    if (langData) {
      languageCache.set(code, langData);
    }
    return langData;
  } catch (error) {
    // console.error(`Failed to load language data for ${code}:`, error);
    return null;
  }
}

/**
 * Gets the full list of all languages by loading all data files.
 * Use this sparingly as it can be a heavy operation.
 * @returns {Promise<Array<Object>>} A promise that resolves to the full list of language objects.
 */
export async function getFullLanguageList() {
    const allLanguageCodes = getAvailableLanguageCodes();
    const promises = allLanguageCodes.map(code => getLanguageData(code));
    const results = await Promise.all(promises);
    return results.filter(Boolean); // Filter out any nulls from failed loads
}


/**
 * Asynchronously gets the language code for TTS from a language name.
 * @param {string} languageName - Language name, display name, or code.
 * @returns {Promise<string>} Language code for TTS (e.g., "en").
 */
export async function getLanguageCodeForTTS(languageName) {
  if (!languageName) return "en";

  const lowerCaseName = languageName.toLowerCase();

  // Quick check for code
  if (lowerCaseName.length <= 3) {
      const lang = await getLanguageData(lowerCaseName);
      if(lang) return lowerCaseName;
  }

  // Load the full list to search by name (this is inefficient but necessary for now)
  const fullList = await getFullLanguageList();
  const language = fullList.find(lang => lang.name.toLowerCase() === lowerCaseName);

  return language ? language.code : 'en'; // Default to English
}

/**
 * Asynchronously gets a language object by its code.
 * @param {string} code - The language code.
 * @param {string} [type='translation'] - Language type ('translation', 'interface', 'tts')
 * @returns {Promise<Object|null>} The language object or null.
 */
export async function getLanguageByCode(code, type = 'translation') {
  if (type === 'translation') {
    return await getLanguageData(code);
  }
  // Use lazy loading for other types
  return await getLanguageDataLazy(code, type);
}

/**
 * Asynchronously gets a language object by its name.
 * @param {string} name - The language name.
 * @returns {Promise<Object|null>} The language object or null.
 */
export async function getLanguageByName(name) {
    const lowerCaseName = name.toLowerCase();
    const fullList = await getFullLanguageList();
    return fullList.find(lang => lang.name.toLowerCase() === lowerCaseName);
}

/**
 * Asynchronously finds a language code from an identifier (code or name).
 * @param {string} identifier - The language code or name.
 * @returns {Promise<string|null>} The language code or null.
 */
export async function findLanguageCode(identifier) {
  if (!identifier) return null;
  const lowerIdentifier = identifier.toLowerCase();

  // Handle auto-detect
  if (['auto', 'auto-detect'].includes(lowerIdentifier)) {
      return 'auto';
  }

  // Try to get by code first
  let lang = await getLanguageData(lowerIdentifier);
  if (lang) return lang.code;

  // If not found by code, try by name
  const fullList = await getFullLanguageList();
  lang = fullList.find(l => l.name.toLowerCase() === lowerIdentifier);
  if (lang) return lang.code;

  // Fallback
  return identifier;
}

/**
 * Clear all language caches
 */
export function clearLanguageCache() {
  languageCache.clear();
}

/**
 * Get available languages by type
 * @param {string} [type='translation'] - Language type ('translation', 'interface', 'tts')
 * @returns {Array<string>} List of available language codes
 */
export function getAvailableLanguagesByType(type = 'translation') {
  return getAvailableLanguageCodes();
}

/**
 * Preload user languages based on preferences
 */
export async function preloadLanguages() {
  await preloadUserLanguages();
}

/**
 * Get language data by type with lazy loading
 * @param {string} code - Language code
 * @param {string} [type='translation'] - Language type
 * @returns {Promise<Object|null>} Language data
 */
export async function getLanguageByType(code, type = 'translation') {
  return await getLanguageDataLazy(code, type);
}