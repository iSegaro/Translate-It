/**
 * Translation Constants
 * Shared constants used across translation providers
 */

export const TRANSLATION_CONSTANTS = {
  // Standard delimiter for separating text segments in batch translation
  TEXT_DELIMITER: '\n\n---\n\n',

  // Alternative delimiters for fallback splitting
  ALTERNATIVE_DELIMITERS: [
    '\n\n---\n',    // Missing newline
    '\n---\n\n',    // Missing newline on other side
    '---',         // Just the separator
    '\n\n',        // Double newlines
    '\n',         // Single newlines (last resort)
  ],

  // Provider-specific character limits
  CHARACTER_LIMITS: {
    GOOGLE: 5000,
    BING: 1000,
    YANDEX: 10000,
    DEEPL: 10000,
  },

  // Provider-specific batch sizes (max segments per request)
  MAX_CHUNKS_PER_BATCH: {
    GOOGLE: 150,
    BING: 10,
    YANDEX: 100,
    DEEPL: 150, 
  },

  // Dictionary support flags
  SUPPORTS_DICTIONARY: {
    GOOGLE: true,
    BING: false,
    YANDEX: true,
    DEEPL: false,
  },

  // Reliable mode flags
  RELIABLE_JSON_MODE: {
    GOOGLE: false,
    BING: false,
    YANDEX: false,
    DEEPL: false,
  },

  // Streaming support flags
  SUPPORTS_STREAMING: {
    GOOGLE: true,
    BING: true,
    YANDEX: true,
    DEEPL: true,
  },

  // Chunking strategies
  CHUNKING_STRATEGIES: {
    GOOGLE: 'character_limit',
    BING: 'character_limit',
    YANDEX: 'character_limit',
    DEEPL: 'character_limit',
  },
};