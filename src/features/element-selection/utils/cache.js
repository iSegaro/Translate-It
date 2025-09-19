// Element Selection Cache System
// Dedicated caching system for Select Element feature
// Independent from shared utilities to avoid conflicts

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'cache');

/**
 * Element Selection Cache Manager
 * Manages translation cache and original text storage for Select Element feature
 */
export class ElementSelectionCache {
  constructor() {
    this.translationCache = new Map();
    this.originalTexts = new Map();
    this.elementValidationCache = new WeakMap();
    this.textContentCache = new WeakMap();
    this.initialized = false;
  }

  /**
   * Initialize the cache system
   */
  initialize() {
    if (this.initialized) {
      logger.debug('Cache already initialized, skipping');
      return;
    }

    this.initialized = true;
    logger.debug('Element Selection Cache initialized');
  }

  /**
   * Get translation from cache
   * @param {string} text - Original text
   * @returns {string|null} Cached translation or null
   */
  getTranslation(text) {
    return this.translationCache.get(text) || null;
  }

  /**
   * Set translation in cache
   * @param {string} originalText - Original text
   * @param {string} translatedText - Translated text
   */
  setTranslation(originalText, translatedText) {
    this.translationCache.set(originalText, translatedText);
    logger.debug(`Translation cached: ${originalText.substring(0, 30)}... → ${translatedText.substring(0, 30)}...`);
  }

  /**
   * Check if translation exists in cache
   * @param {string} text - Text to check
   * @returns {boolean} Whether translation exists
   */
  hasTranslation(text) {
    return this.translationCache.has(text);
  }

  /**
   * Get all cached translations
   * @returns {Map} Translation cache
   */
  getAllTranslations() {
    return new Map(this.translationCache);
  }

  /**
   * Store original text with unique ID
   * @param {string} uniqueId - Unique identifier
   * @param {Object} textData - Text data object
   */
  storeOriginalText(uniqueId, textData) {
    this.originalTexts.set(uniqueId, textData);
  }

  /**
   * Get original text by ID
   * @param {string} uniqueId - Unique identifier
   * @returns {Object|null} Original text data or null
   */
  getOriginalText(uniqueId) {
    return this.originalTexts.get(uniqueId) || null;
  }

  /**
   * Remove original text by ID
   * @param {string} uniqueId - Unique identifier
   */
  removeOriginalText(uniqueId) {
    return this.originalTexts.delete(uniqueId);
  }

  /**
   * Get all original texts
   * @returns {Map} Original texts map
   */
  getAllOriginalTexts() {
    return this.originalTexts;
  }

  /**
   * Cache element validation result
   * @param {HTMLElement} element - Element to cache
   * @param {boolean} isValid - Validation result
   */
  cacheElementValidation(element, isValid) {
    this.elementValidationCache.set(element, isValid);
  }

  /**
   * Get cached element validation
   * @param {HTMLElement} element - Element to check
   * @returns {boolean|undefined} Cached validation result
   */
  getCachedElementValidation(element) {
    return this.elementValidationCache.get(element);
  }

  /**
   * Cache text content result
   * @param {HTMLElement} element - Element to cache
   * @param {string} content - Text content
   */
  cacheTextContent(element, content) {
    this.textContentCache.set(element, content);
  }

  /**
   * Get cached text content
   * @param {HTMLElement} element - Element to check
   * @returns {string|undefined} Cached text content
   */
  getCachedTextContent(element) {
    return this.textContentCache.get(element);
  }

  /**
   * Separate cached and new texts for translation
   * @param {Map} originalTextsMap - Map of original texts
   * @returns {Object} Separated texts object
   */
  separateCachedAndNewTexts(originalTextsMap) {
    const textsToTranslate = [];
    const cachedTranslations = new Map();
    const uniqueOriginalTexts = Array.from(originalTextsMap.keys());

    uniqueOriginalTexts.forEach((text) => {
      if (this.hasTranslation(text)) {
        cachedTranslations.set(text, this.getTranslation(text));
      } else {
        textsToTranslate.push(text);
      }
    });

    logger.debug(`Separated texts: ${textsToTranslate.length} new, ${cachedTranslations.size} cached`);
    return { textsToTranslate, cachedTranslations };
  }

  /**
   * Clear translation cache
   */
  clearTranslationCache() {
    const size = this.translationCache.size;
    this.translationCache.clear();
    logger.debug(`Translation cache cleared: ${size} entries removed`);
  }

  /**
   * Clear original texts
   */
  clearOriginalTexts() {
    const size = this.originalTexts.size;
    this.originalTexts.clear();
    logger.debug(`Original texts cleared: ${size} entries removed`);
  }

  /**
   * Clear element validation cache
   */
  clearElementValidationCache() {
    this.elementValidationCache = new WeakMap();
    logger.debug('Element validation cache cleared');
  }

  /**
   * Clear text content cache
   */
  clearTextContentCache() {
    this.textContentCache = new WeakMap();
    logger.debug('Text content cache cleared');
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this.clearTranslationCache();
    this.clearOriginalTexts();
    this.clearElementValidationCache();
    this.clearTextContentCache();
    logger.debug('All Element Selection caches cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      translationCache: this.translationCache.size,
      originalTexts: this.originalTexts.size,
      elementValidationCache: 'WeakMap (size not available)',
      textContentCache: 'WeakMap (size not available)',
      initialized: this.initialized
    };
  }

  /**
   * Cleanup all resources
   */
  cleanup() {
    this.clearAllCaches();
    this.initialized = false;
    logger.debug('Element Selection Cache cleanup completed');
  }
}

// Singleton instance
let cacheInstance = null;

/**
 * Get singleton cache instance
 * @returns {ElementSelectionCache} Cache instance
 */
export function getElementSelectionCache() {
  if (!cacheInstance) {
    cacheInstance = new ElementSelectionCache();
  }
  return cacheInstance;
}

/**
 * Initialize the cache system
 */
export function initializeCache() {
  const cache = getElementSelectionCache();
  cache.initialize();
  return cache;
}