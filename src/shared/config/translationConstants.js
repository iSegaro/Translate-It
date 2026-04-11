/**
 * Translation Constants
 * Shared constants used across translation providers
 */

/**
 * Expected format of the translation response.
 * Used to enforce strict contracts between orchestrators and providers.
 */
export const ResponseFormat = {
  STRING: 'STRING',           // Plain text (Popup, Selection, single segments)
  JSON_ARRAY: 'JSON_ARRAY',   // Array of strings (Standard AI Batching)
  JSON_OBJECT: 'JSON_OBJECT', // Array of objects with IDs (Select Element, Page Translation)
  AUTO: 'AUTO'                // Heuristic-based fallback (legacy)
};

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

  // Thresholds for deciding when to use streaming
  STREAMING_THRESHOLDS: {
    AI: 500,
    TRADITIONAL: 2000,
  },
};