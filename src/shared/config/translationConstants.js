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
    GOOGLE: 3900,
    BING: 800,
    YANDEX: 5000,
    DEEPL: 10000,
  },

  // Provider-specific batch sizes (max segments per request)
  MAX_CHUNKS_PER_BATCH: {
    GOOGLE: 10,
    BING: 15,
    YANDEX: 25,
    DEEPL: 5, // Very conservative for DeepL Free API with beta languages
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
    YANDEX: 'segment_count',
    DEEPL: 'character_limit',
  },
};