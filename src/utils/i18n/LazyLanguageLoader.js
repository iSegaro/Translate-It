// src/utils/i18n/LazyLanguageLoader.js
// Lazy loading utilities for language data

import {
  loadTranslationLanguagePack,
  clearTranslationLanguageCache
} from './TranslationLanguageLoader.js';

import {
  loadInterfaceLanguagePack,
  clearInterfaceLanguageCache
} from './InterfaceLanguageLoader.js';

import {
  loadTtsLanguagePack,
  clearTtsLanguageCache
} from './TtsLanguageLoader.js';

import {
  detectBrowserLanguage,
  detectLanguageFromText,
  clearDetectionCache
} from './LanguageDetector.js';

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TEXT, 'LazyLanguageLoader');

// Cache for lazy-loaded language data
const lazyLoadCache = new Map();
const loadingPromises = new Map();

// Configuration for lazy loading
const LAZY_LOAD_CONFIG = {
  // Maximum number of languages to keep in cache
  MAX_CACHE_SIZE: 20,
  // Languages to always keep in cache
  PERSISTENT_LANGUAGES: ['en', 'fa'],
  // Preload languages based on browser settings
  PRELOAD_BROWSER_LANG: true,
  // Debounce time for language detection (ms)
  DETECTION_DEBOUNCE: 300
};

/**
 * Lazy load translation language data
 * @param {string} langCode - Language code to load
 * @param {boolean} [force=false] - Force reload even if cached
 * @returns {Promise<Object>} Language data
 */
export async function lazyLoadTranslationLanguage(langCode, force = false) {
  const cacheKey = `translation:${langCode}`;

  // Check cache first
  if (!force && lazyLoadCache.has(cacheKey)) {
    return lazyLoadCache.get(cacheKey);
  }

  // Check if already loading
  if (loadingPromises.has(cacheKey)) {
    return loadingPromises.get(cacheKey);
  }

  // Load language data
  const loadPromise = loadTranslationLanguageData(langCode, cacheKey);
  loadingPromises.set(cacheKey, loadPromise);

  try {
    const result = await loadPromise;
    return result;
  } finally {
    loadingPromises.delete(cacheKey);
  }
}

/**
 * Load translation language data with caching
 * @param {string} langCode - Language code to load
 * @param {string} cacheKey - Cache key
 * @returns {Promise<Object>} Language data
 */
async function loadTranslationLanguageData(langCode, cacheKey) {
  try {
    // Load from specialized loader
    const langData = await loadTranslationLanguagePack(langCode);

    if (langData) {
      // Update cache
      updateLazyCache(cacheKey, langData);
      return langData;
    }

    // Fallback to English
    if (langCode !== 'en') {
      return await lazyLoadTranslationLanguage('en');
    }

    return null;
  } catch (error) {
    logger.error(`Failed to lazy load translation language ${langCode}:`, error);
    return null;
  }
}

/**
 * Lazy load interface language data
 * @param {string} langCode - Language code to load
 * @param {boolean} [force=false] - Force reload even if cached
 * @returns {Promise<Object>} Language data
 */
export async function lazyLoadInterfaceLanguage(langCode, force = false) {
  const cacheKey = `interface:${langCode}`;

  // Check cache first
  if (!force && lazyLoadCache.has(cacheKey)) {
    return lazyLoadCache.get(cacheKey);
  }

  // Check if already loading
  if (loadingPromises.has(cacheKey)) {
    return loadingPromises.get(cacheKey);
  }

  // Load language data
  const loadPromise = loadInterfaceLanguageData(langCode, cacheKey);
  loadingPromises.set(cacheKey, loadPromise);

  try {
    const result = await loadPromise;
    return result;
  } finally {
    loadingPromises.delete(cacheKey);
  }
}

/**
 * Load interface language data with caching
 * @param {string} langCode - Language code to load
 * @param {string} cacheKey - Cache key
 * @returns {Promise<Object>} Language data
 */
async function loadInterfaceLanguageData(langCode, cacheKey) {
  try {
    // Load from specialized loader
    const langData = await loadInterfaceLanguagePack(langCode);

    if (langData) {
      // Interface languages are always persistent
      lazyLoadCache.set(cacheKey, langData);
      return langData;
    }

    // Fallback to English
    if (langCode !== 'en') {
      return await lazyLoadInterfaceLanguage('en');
    }

    return null;
  } catch (error) {
    logger.error(`Failed to lazy load interface language ${langCode}:`, error);
    return null;
  }
}

/**
 * Lazy load TTS language data
 * @param {string} langCode - Language code to load
 * @param {boolean} [force=false] - Force reload even if cached
 * @returns {Promise<Object>} Language data
 */
export async function lazyLoadTtsLanguage(langCode, force = false) {
  const cacheKey = `tts:${langCode}`;

  // Check cache first
  if (!force && lazyLoadCache.has(cacheKey)) {
    return lazyLoadCache.get(cacheKey);
  }

  // Check if already loading
  if (loadingPromises.has(cacheKey)) {
    return loadingPromises.get(cacheKey);
  }

  // Load language data
  const loadPromise = loadTtsLanguageData(langCode, cacheKey);
  loadingPromises.set(cacheKey, loadPromise);

  try {
    const result = await loadPromise;
    return result;
  } finally {
    loadingPromises.delete(cacheKey);
  }
}

/**
 * Load TTS language data with caching
 * @param {string} langCode - Language code to load
 * @param {string} cacheKey - Cache key
 * @returns {Promise<Object>} Language data
 */
async function loadTtsLanguageData(langCode, cacheKey) {
  try {
    // Load from specialized loader
    const langData = await loadTtsLanguagePack(langCode);

    if (langData) {
      // Update cache
      updateLazyCache(cacheKey, langData);
      return langData;
    }

    // Fallback to English
    if (langCode !== 'en') {
      return await lazyLoadTtsLanguage('en');
    }

    return null;
  } catch (error) {
    logger.error(`Failed to lazy load TTS language ${langCode}:`, error);
    return null;
  }
}

/**
 * Update lazy cache with LRU eviction
 * @param {string} key - Cache key
 * @param {Object} value - Cache value
 */
function updateLazyCache(key, value) {
  // Remove oldest entries if cache is full
  if (lazyLoadCache.size >= LAZY_LOAD_CONFIG.MAX_CACHE_SIZE) {
    const keysToDelete = [];
    for (const [cacheKey] of lazyLoadCache) {
      // Skip persistent languages
      if (!LAZY_LOAD_CONFIG.PERSISTENT_LANGUAGES.some(lang => cacheKey.includes(lang))) {
        keysToDelete.push(cacheKey);
        if (keysToDelete.length >= 5) break; // Remove 5 oldest entries
      }
    }

    keysToDelete.forEach(key => lazyLoadCache.delete(key));
  }

  // Add new entry
  lazyLoadCache.set(key, value);
}

/**
 * Preload languages based on user preferences
 */
export async function preloadUserLanguages() {
  const promises = [];

  // Always preload core languages
  LAZY_LOAD_CONFIG.PERSISTENT_LANGUAGES.forEach(lang => {
    promises.push(lazyLoadTranslationLanguage(lang));
    promises.push(lazyLoadInterfaceLanguage(lang));
    promises.push(lazyLoadTtsLanguage(lang));
  });

  // Preload browser language if enabled
  if (LAZY_LOAD_CONFIG.PRELOAD_BROWSER_LANG) {
    const browserLang = detectBrowserLanguage();
    if (browserLang && !LAZY_LOAD_CONFIG.PERSISTENT_LANGUAGES.includes(browserLang)) {
      promises.push(lazyLoadTranslationLanguage(browserLang));
    }
  }

  await Promise.allSettled(promises);
}

/**
 * Get language data by type with lazy loading
 * @param {string} langCode - Language code
 * @param {string} type - Language type ('translation', 'interface', 'tts')
 * @param {boolean} [force=false] - Force reload
 * @returns {Promise<Object>} Language data
 */
export async function getLanguageDataLazy(langCode, type = 'translation', force = false) {
  switch (type) {
    case 'translation':
      return lazyLoadTranslationLanguage(langCode, force);
    case 'interface':
      return lazyLoadInterfaceLanguage(langCode, force);
    case 'tts':
      return lazyLoadTtsLanguage(langCode, force);
    default:
      logger.warn(`Unknown language type: ${type}`);
      return lazyLoadTranslationLanguage(langCode, force);
  }
}

/**
 * Detect language from text with lazy loading
 * @param {string} text - Text to analyze
 * @returns {Promise<{lang: string, confidence: number}>} Detection result
 */
export async function detectLanguageLazy(text) {
  const detectedLang = await detectLanguageFromText(text);

  // Lazy load the detected language
  if (detectedLang) {
    await lazyLoadTranslationLanguage(detectedLang);
  }

  return {
    lang: detectedLang,
    confidence: detectedLang ? 0.8 : 0.0
  };
}

/**
 * Clear all lazy loading caches
 */
export function clearLazyLoadCache() {
  lazyLoadCache.clear();
  loadingPromises.clear();
  clearTranslationLanguageCache();
  clearInterfaceLanguageCache();
  clearTtsLanguageCache();
  clearDetectionCache();
}

/**
 * Get lazy loading cache statistics
 * @returns {Object} Cache info
 */
export function getLazyLoadCacheInfo() {
  return {
    cacheSize: lazyLoadCache.size,
    loadingCount: loadingPromises.size,
    persistentLanguages: LAZY_LOAD_CONFIG.PERSISTENT_LANGUAGES,
    maxCacheSize: LAZY_LOAD_CONFIG.MAX_CACHE_SIZE,
    cachedKeys: Array.from(lazyLoadCache.keys())
  };
}