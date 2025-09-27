// src/utils/i18n/LanguageDetector.js
// Language detection utilities for code splitting

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
    console.warn('Failed to detect browser language:', error);
    return 'en';
  }
}

/**
 * Detect language from text content
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
    // Enhanced heuristics for language detection
    const detection = await detectLanguageHeuristics(sampleText);

    // Update cache
    updateCache(cacheKey, detection);

    return detection;
  } catch (error) {
    console.warn('Failed to detect language from text:', error);
    return { lang: 'en', confidence: 0.0 };
  }
}

/**
 * Enhanced language detection heuristics with confidence scoring
 * @param {string} text - Text to analyze
 * @returns {Promise<{lang: string, confidence: number}>} Detection result
 */
async function detectLanguageHeuristics(text) {
  const sample = text.toLowerCase();
  let detectedLang = 'en';
  let confidence = 0.0;
  let scores = {};

  // Score each language based on character patterns
  const languagePatterns = [
    // Chinese
    { lang: 'zh', pattern: /[\u4e00-\u9fff]/g, weight: 0.9 },
    // Japanese
    { lang: 'ja', pattern: /[\u3040-\u309f\u30a0-\u30ff]/g, weight: 0.9 },
    // Korean
    { lang: 'ko', pattern: /[\uac00-\ud7af]/g, weight: 0.9 },
    // Arabic
    { lang: 'ar', pattern: /[ا-ي]/g, weight: 0.9 },
    // Hebrew
    { lang: 'he', pattern: /[א-ת]/g, weight: 0.9 },
    // Thai
    { lang: 'th', pattern: /[\u0e00-\u0e7f]/g, weight: 0.9 },
    // Devanagari (Hindi)
    { lang: 'hi', pattern: /[\u0900-\u097f]/g, weight: 0.9 },
    // Bengali
    { lang: 'bn', pattern: /[\u0980-\u09ff]/g, weight: 0.9 },
    // Greek
    { lang: 'el', pattern: /[α-ωάέήίόύώ]/g, weight: 0.8 },
    // Cyrillic
    { lang: 'ru', pattern: /[а-яё]/g, weight: 0.7 },
    // Ukrainian (specific characters)
    { lang: 'uk', pattern: /[іїєґ]/g, weight: 0.8 },
    // Persian
    { lang: 'fa', pattern: /[پچژگ]/g, weight: 0.8 },
    // Common Latin-based languages with word patterns
    { lang: 'de', pattern: /\b(der|die|das|und|ist|nicht|für|mit|von|zu)\b/g, weight: 0.6 },
    { lang: 'fr', pattern: /\b(le|la|les|et|est|pas|pour|dans|avec|que)\b/g, weight: 0.6 },
    { lang: 'es', pattern: /\b(el|la|los|las|y|es|no|para|con|que|de)\b/g, weight: 0.6 },
    { lang: 'it', pattern: /\b(il|la|lo|le|e|non|per|con|che|di)\b/g, weight: 0.6 },
    { lang: 'pt', pattern: /\b(o|a|os|as|e|é|não|para|com|que|de)\b/g, weight: 0.6 },
    { lang: 'ru', pattern: /\b(и|в|не|на|я|быть|то|он|с|что)\b/g, weight: 0.5 },
    { lang: 'ja', pattern: /\b(の|に|は|を|と|が|で|も|から|まで)\b/g, weight: 0.5 }
  ];

  // Calculate scores for each language
  languagePatterns.forEach(({ lang, pattern, weight }) => {
    const matches = sample.match(pattern);
    if (matches) {
      scores[lang] = (scores[lang] || 0) + (matches.length * weight);
    }
  });

  // Add character frequency analysis for Latin-based languages
  if (Object.keys(scores).length === 0 || scores['en'] > 0) {
    const latinScores = analyzeLatinScript(sample);
    scores = { ...scores, ...latinScores };
  }

  // Find language with highest score
  let maxScore = 0;
  for (const [lang, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedLang = lang;
    }
  }

  // Calculate confidence based on max score and text length
  confidence = Math.min(maxScore / (sample.length / 100), 1.0);

  // If confidence is too low, default to English
  if (confidence < DETECTION_CONFIG.CONFIDENCE_THRESHOLD) {
    detectedLang = 'en';
    confidence = 0.5;
  }

  return { lang: detectedLang, confidence };
}

/**
 * Analyze Latin script text for language patterns
 * @param {string} text - Text to analyze
 * @returns {Object} Language scores
 */
function analyzeLatinScript(text) {
  const scores = {};
  const commonWords = {
    en: ['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it'],
    de: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich'],
    fr: ['de', 'le', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir'],
    es: ['de', 'la', 'que', 'el', 'en', 'y', 'a', 'ser', 'se', 'no'],
    it: ['di', 'il', 'che', 'e', 'la', 'in', 'a', 'per', 'un', 'è'],
    pt: ['de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para']
  };

  // Count occurrences of common words
  for (const [lang, words] of Object.entries(commonWords)) {
    let count = 0;
    words.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) {
        count += matches.length;
      }
    });
    if (count > 0) {
      scores[lang] = count * 0.3; // Lower weight for Latin scripts
    }
  }

  return scores;
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