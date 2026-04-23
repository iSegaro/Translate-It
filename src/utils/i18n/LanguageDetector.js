// src/utils/i18n/LanguageDetector.js
// Compatibility wrapper for language detection utilities used by i18n lazy loading

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';

const logger = getScopedLogger(LOG_COMPONENTS.I18N, 'LanguageDetector');

// Cache for detected languages with LRU eviction
const detectionCache = new Map();

// Configuration
const DETECTION_CONFIG = {
  // Maximum cache size
  MAX_CACHE_SIZE: 100,
  // Cache TTL in milliseconds (1 hour)
  CACHE_TTL: 3600000,
  // Minimum text length for reliable detection
  MIN_TEXT_LENGTH: 10,
  // Maximum text length to process
  MAX_TEXT_LENGTH: 1000,
  // Confidence threshold for detection
  CONFIDENCE_THRESHOLD: 0.7,
  // Browser language detection enabled
  DETECT_BROWSER_LANG: true
};

// Cache entry timestamps for TTL
const cacheTimestamps = new Map();

/**
 * Detect browser language preference
 * @returns {string} Detected language code
 */
export function detectBrowserLanguage() {
  if (!DETECTION_CONFIG.DETECT_BROWSER_LANG) {
    return 'en';
  }

  try {
    // Get browser language
    const browserLang = navigator.language || navigator.userLanguage || 'en';

    // Extract primary language code
    const primaryLang = browserLang.split('-')[0].toLowerCase();

    // Check cache first
    const cacheKey = 'browser';
    const cached = getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Update cache
    updateCache(cacheKey, primaryLang);

    return primaryLang;
  } catch (error) {
    logger.warn('Failed to detect browser language:', error);
    return 'en';
  }
}

/**
 * Detect language from text content
 * Delegates to the centralized LanguageDetectionService to keep a single
 * source of truth for detection policy across the extension.
 *
 * @param {string} text - Text to analyze
 * @returns {Promise<{lang: string, confidence: number}>} Detection result with confidence
 */
export async function detectLanguageFromText(text) {
  if (!text || typeof text !== 'string' || text.trim().length < DETECTION_CONFIG.MIN_TEXT_LENGTH) {
    return { lang: 'en', confidence: 0.0 };
  }

  // Truncate text if too long
  const sampleText = text.length > DETECTION_CONFIG.MAX_TEXT_LENGTH
    ? text.substring(0, DETECTION_CONFIG.MAX_TEXT_LENGTH)
    : text;

  // Create cache key from text hash
  const textHash = await createTextHash(sampleText);
  const cacheKey = `text:${textHash}`;

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const detectedLang = await LanguageDetectionService.detect(sampleText);
    const detection = detectedLang
      ? { lang: detectedLang, confidence: 0.8 }
      : { lang: 'en', confidence: 0.0 };

    // Update cache
    updateCache(cacheKey, detection);

    return detection;
  } catch (error) {
    logger.warn('Failed to detect language from text:', error);
    return { lang: 'en', confidence: 0.0 };
  }
}

/**
 * Create a simple hash from text for caching
 * @param {string} text - Text to hash
 * @returns {Promise<string>} Hash value
 */
async function createTextHash(text) {
  // Simple hash function for caching
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

/**
 * Get value from cache with TTL check
 * @param {string} key - Cache key
 * @returns {any|null} Cached value or null if expired/not found
 */
function getFromCache(key) {
  if (!detectionCache.has(key)) {
    return null;
  }

  const timestamp = cacheTimestamps.get(key);
  if (!timestamp || Date.now() - timestamp > DETECTION_CONFIG.CACHE_TTL) {
    // Cache entry expired
    detectionCache.delete(key);
    cacheTimestamps.delete(key);
    return null;
  }

  return detectionCache.get(key);
}

/**
 * Update cache with LRU eviction
 * @param {string} key - Cache key
 * @param {any} value - Cache value
 */
function updateCache(key, value) {
  // Remove oldest entries if cache is full
  if (detectionCache.size >= DETECTION_CONFIG.MAX_CACHE_SIZE) {
    const oldestKey = detectionCache.keys().next().value;
    detectionCache.delete(oldestKey);
    cacheTimestamps.delete(oldestKey);
  }

  // Add new entry
  detectionCache.set(key, value);
  cacheTimestamps.set(key, Date.now());
}

/**
 * Get supported languages for detection
 * @returns {Array<string>} List of supported language codes
 */
export function getSupportedDetectionLanguages() {
  return [
    'en', 'fa', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ja', 'ko',
    'ar', 'hi', 'bn', 'ur', 'tr', 'nl', 'sv', 'da', 'no', 'fi', 'pl',
    'cs', 'sk', 'hu', 'ro', 'bg', 'hr', 'sr', 'sl', 'et', 'lv', 'lt',
    'el', 'he', 'id', 'ms', 'tl', 'vi', 'th', 'ml', 'ta', 'te', 'kn',
    'gu', 'mr', 'ne', 'pa', 'si', 'sw', 'af', 'kk', 'uz', 'uk', 'sq',
    'ps', 'or'
  ];
}

/**
 * Clear language detection cache
 */
export function clearDetectionCache() {
  detectionCache.clear();
  cacheTimestamps.clear();
}

/**
 * Get detection cache info
 * @returns {Object} Cache statistics
 */
export function getDetectionCacheInfo() {
  const now = Date.now();
  const validEntries = [];
  const expiredEntries = [];

  for (const [key, timestamp] of cacheTimestamps.entries()) {
    if (now - timestamp <= DETECTION_CONFIG.CACHE_TTL) {
      validEntries.push(key);
    } else {
      expiredEntries.push(key);
    }
  }

  return {
    totalSize: detectionCache.size,
    validEntries: validEntries.length,
    expiredEntries: expiredEntries.length,
    maxSize: DETECTION_CONFIG.MAX_CACHE_SIZE,
    ttl: DETECTION_CONFIG.CACHE_TTL,
    sampleEntries: Array.from(detectionCache.keys()).slice(0, 5)
  };
}

/**
 * Configure detection settings
 * @param {Object} config - New configuration
 */
export function configureDetection(config) {
  Object.assign(DETECTION_CONFIG, config);
}
