/**
 * Translation Constants (Legacy Proxy)
 * 
 * CRITICAL: This file is a proxy to ProviderConfigurations.js which is now 
 * the Single Source of Truth for all translation settings.
 * 
 * New code should import directly from:
 * '@/features/translation/core/ProviderConfigurations.js'
 */

import { 
  ResponseFormat as NewResponseFormat, 
  DEFAULT_TEXT_DELIMITER,
  ALTERNATIVE_DELIMITERS,
  STREAMING_THRESHOLDS as NewStreamingThresholds,
  HISTORY_CHARACTER_LIMITS as NewHistoryLimits,
  BASE_CHARACTER_LIMITS,
  BASE_MAX_CHUNKS_PER_BATCH
} from '@/features/translation/core/ProviderConfigurations.js';

// Re-export ResponseFormat for backward compatibility
export const ResponseFormat = NewResponseFormat;

/**
 * TRANSLATION_CONSTANTS
 * Legacy object maintained for backward compatibility.
 * All values now pull from the central ProviderConfigurations.
 */
export const TRANSLATION_CONSTANTS = {
  // Delimiters
  TEXT_DELIMITER: DEFAULT_TEXT_DELIMITER,
  ALTERNATIVE_DELIMITERS: ALTERNATIVE_DELIMITERS,

  // Character limits (Baseline values)
  CHARACTER_LIMITS: {
    GOOGLE: BASE_CHARACTER_LIMITS.GOOGLE,
    BING: BASE_CHARACTER_LIMITS.BING,
    YANDEX: BASE_CHARACTER_LIMITS.YANDEX,
    DEEPL: BASE_CHARACTER_LIMITS.DEEPL,
  },

  // Batch sizes (Baseline values)
  MAX_CHUNKS_PER_BATCH: {
    GOOGLE: BASE_MAX_CHUNKS_PER_BATCH.GOOGLE,
    BING: BASE_MAX_CHUNKS_PER_BATCH.BING,
    YANDEX: BASE_MAX_CHUNKS_PER_BATCH.YANDEX,
    DEEPL: BASE_MAX_CHUNKS_PER_BATCH.DEEPL, 
  },

  // Capability flags (Static defaults for legacy code)
  SUPPORTS_DICTIONARY: {
    GOOGLE: true,
    BING: false,
    YANDEX: true,
    DEEPL: false,
  },

  RELIABLE_JSON_MODE: {
    GOOGLE: false,
    BING: true,
    YANDEX: true,
    DEEPL: false,
  },

  SUPPORTS_STREAMING: {
    GOOGLE: true,
    BING: true,
    YANDEX: true,
    DEEPL: true,
  },

  CHUNKING_STRATEGIES: {
    GOOGLE: 'character_limit',
    BING: 'character_limit',
    YANDEX: 'character_limit',
    DEEPL: 'character_limit',
  },

  // Thresholds
  STREAMING_THRESHOLDS: NewStreamingThresholds,

  // History limits
  HISTORY_CHARACTER_LIMITS: NewHistoryLimits
};
