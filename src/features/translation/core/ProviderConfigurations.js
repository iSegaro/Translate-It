/**
 * Provider Configurations - Centralized configuration for all translation providers
 * Defines provider-specific optimizations for rate limiting, batching, streaming, and error handling
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'ProviderConfigurations');

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

/**
 * Standard delimiter for separating text segments in batch translation.
 * Using a resilient pattern that traditional providers are less likely to merge.
 */
export const DEFAULT_TEXT_DELIMITER = '\n[[---]]\n';

/**
 * Alternative delimiters for fallback splitting when the standard delimiter fails.
 */
export const ALTERNATIVE_DELIMITERS = [
  '[[---]]',
  '\n\n---\n\n',
  '\n---\n',
  '---',
  '\n\n',
  '\n',
];

/**
 * Thresholds for deciding when to use streaming (in characters)
 */
export const STREAMING_THRESHOLDS = {
  AI: 500,
  TRADITIONAL: 2000,
};

/**
 * Character limits for conversation history to optimize tokens
 */
export const HISTORY_CHARACTER_LIMITS = {
  AI: 300,      // Max characters per history message for AI providers
  DEEPL: 150,   // Max characters for DeepL context snippets
};

/**
 * Baseline Character Limits for traditional providers
 */
export const BASE_CHARACTER_LIMITS = {
  GOOGLE: 5000,
  BING: 4000,
  YANDEX: 10000,
  DEEPL: 10000,
};

/**
 * Baseline Max Segments per request
 */
export const BASE_MAX_CHUNKS_PER_BATCH = {
  GOOGLE: 150,
  BING: 10,
  YANDEX: 100,
  DEEPL: 150,
};

const UNIFIED_AI_BATCHING_CONFIG = {
  strategy: 'smart',
  optimalSize: 20,
  maxComplexity: 350,
  singleBatchThreshold: 15,
  modeOverrides: {
    select_element: {
      optimalSize: 25,
      maxComplexity: 500,
      singleBatchThreshold: 20,
      maxBatchSizeChars: 3500,
      balancedBatching: true,
    },
  },
};

/**
 * Provider-specific configurations
 * Each provider has optimized settings based on their API characteristics and limitations
 */
export const PROVIDER_CONFIGURATIONS = {
  // Google Gemini - Optimized settings for Select Element performance
  Gemini: {
    rateLimit: {
      maxConcurrent: 3, // Increased for even better throughput
      delayBetweenRequests: 0, // No delay for first request, adaptive backoff handles errors
      initialDelay: 0, // First request immediate
      subsequentDelay: 2000, // Reduced from 8000ms to 2000ms for better UX
      burstLimit: 3, // Allow more burst processing for better performance
      burstWindow: 5000, // Reduced burst window
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 2, // Reduced multiplier for less aggressive backoff
        maxDelay: 30000, // Reduced max delay for faster recovery
        resetAfterSuccess: 3 // Faster recovery after success
      },
      // Mode-specific overrides
      modeOverrides: {
        select_element: {
          subsequentDelay: 1000, // Even faster for Select Element mode
          burstLimit: 4, // Allow more burst for better UX
          maxConcurrent: 3 // Maintain concurrency for Select Element
        }
      }
    },
    batching: {
      ...UNIFIED_AI_BATCHING_CONFIG,
      strategy: 'json'
    },
    streaming: {
      enabled: true,
      chunkSize: 'adaptive', // Adapt chunk size based on complexity
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'tokens_per_minute', 
        'requests_per_day',
        'concurrent_requests',
        'model_overloaded'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'tokens_per_minute': { delay: 60000, temporary: true },
        'requests_per_day': { delay: 86400000, temporary: false },
        'concurrent_requests': { delay: 8000, temporary: true },
        'model_overloaded': { delay: 15000, temporary: true } // 503 overload errors
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: true,
      supportsBatchRequests: true,
      supportsThinking: true,
      reliableJsonMode: false
    }
  },

  // OpenAI - Moderate settings with good streaming support
  OpenAI: {
    rateLimit: {
      maxConcurrent: 2,
      delayBetweenRequests: 0, // No delay for first request
      initialDelay: 0,
      subsequentDelay: 1000, // 1 second between subsequent requests
      burstLimit: 3,
      burstWindow: 2000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 1.5,
        maxDelay: 30000, // 30 seconds max delay
        resetAfterSuccess: 2
      }
    },
    batching: {
      ...UNIFIED_AI_BATCHING_CONFIG,
      strategy: 'json'
    },
    streaming: {
      enabled: true,
      chunkSize: 'fixed', // Fixed chunk sizes work well
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'tokens_per_minute',
        'requests_per_day'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'tokens_per_minute': { delay: 60000, temporary: true },
        'requests_per_day': { delay: 86400000, temporary: false }
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: true,
      supportsBatchRequests: true,
      supportsThinking: false,
      reliableJsonMode: true
    }
  },

  // DeepSeek - Optimized settings for better performance
  DeepSeek: {
    rateLimit: {
      maxConcurrent: 2, // Increased from 1 for better throughput
      delayBetweenRequests: 0, // No delay for first request
      initialDelay: 0,
      subsequentDelay: 1200, // Reduced from 2000ms to 1200ms
      burstLimit: 3, // Increased from 2
      burstWindow: 3000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 2,
        maxDelay: 30000,
        resetAfterSuccess: 2
      },
      // Mode-specific overrides
      modeOverrides: {
        select_element: {
          subsequentDelay: 800, // Faster for Select Element mode
          burstLimit: 4, // Allow more burst for better UX
          maxConcurrent: 2 // Maintain concurrency for Select Element
        }
      }
    },
    batching: {
      ...UNIFIED_AI_BATCHING_CONFIG,
      strategy: 'json'
    },
    streaming: {
      enabled: true, // Enable streaming for real-time segment translation
      chunkSize: 'fixed',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'rate_limit'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'rate_limit': { delay: 30000, temporary: true }
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: false,
      supportsBatchRequests: true, // Enable batch requests for streaming
      supportsThinking: true,
      reliableJsonMode: false
    }
  },

  // OpenRouter - Optimized settings for multi-model support
  OpenRouter: {
    rateLimit: {
      maxConcurrent: 2,
      delayBetweenRequests: 0, // No delay for first request
      initialDelay: 0,
      subsequentDelay: 1000, // Reduced from 1500ms to 1000ms
      burstLimit: 3,
      burstWindow: 3000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 1.8,
        maxDelay: 45000,
        resetAfterSuccess: 2
      },
      // Mode-specific overrides
      modeOverrides: {
        select_element: {
          subsequentDelay: 800, // Faster for Select Element mode
          burstLimit: 4, // Allow more burst for better UX
          maxConcurrent: 3 // Increased from 2 for Select Element
        }
      }
    },
    batching: {
      ...UNIFIED_AI_BATCHING_CONFIG,
      strategy: 'json'
    },
    streaming: {
      enabled: true, // Most models support streaming
      chunkSize: 'adaptive',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'tokens_per_minute',
        'model_overloaded'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'tokens_per_minute': { delay: 60000, temporary: true },
        'model_overloaded': { delay: 10000, temporary: true }
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: true, // Depends on model
      supportsBatchRequests: true,
      supportsThinking: false, // Varies by model
      reliableJsonMode: true
    }
  },

  // WebAI - External API service (similar to other providers)
  WebAI: {
    rateLimit: {
      maxConcurrent: 2, // Standard concurrent requests
      delayBetweenRequests: 0, // No delay for first request
      initialDelay: 0,
      subsequentDelay: 1000, // Standard delay for subsequent requests // Standard delay
      burstLimit: 3,
      burstWindow: 2000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 1.5,
        maxDelay: 30000,
        resetAfterSuccess: 2
      }
    },
    batching: {
      ...UNIFIED_AI_BATCHING_CONFIG,
      strategy: 'json'
    },
    streaming: {
      enabled: true, // Enable streaming for real-time segment translation
      chunkSize: 'fixed',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'rate_limit',
        'server_overload'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'rate_limit': { delay: 30000, temporary: true },
        'server_overload': { delay: 10000, temporary: true }
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: false, // Depends on model
      supportsBatchRequests: true, // Enable batch requests
      supportsThinking: false,
      reliableJsonMode: false
    }
  },

  // Google Translate - Free translation service settings
  GoogleTranslate: {
    rateLimit: {
      maxConcurrent: 4, // Moderate concurrent requests
      delayBetweenRequests: 0, // No delay for first request
      initialDelay: 0,
      subsequentDelay: 100, // Fast requests for free service
      burstLimit: 5,
      burstWindow: 1000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 1.5,
        maxDelay: 10000,
        resetAfterSuccess: 2
      }
    },
    batching: {
      strategy: 'character_limit', // Use character-based chunking
      characterLimit: BASE_CHARACTER_LIMITS.GOOGLE,
      maxChunksPerBatch: BASE_MAX_CHUNKS_PER_BATCH.GOOGLE,
      delimiter: DEFAULT_TEXT_DELIMITER // Standard resilient delimiter
    },
    streaming: {
      enabled: true, // Enable streaming for real-time chunk translation
      chunkSize: 'character_based',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'daily_quota',
        'rate_limit'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'daily_quota': { delay: 86400000, temporary: false },
        'rate_limit': { delay: 5000, temporary: true }
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: false,
      supportsBatchRequests: true, // Supports batch via chunking
      supportsThinking: false,
      reliableJsonMode: true,
      supportsDictionary: true // Google supports dictionary
    }
  },

  // Google Translate V2 - Robust translation service settings
  GoogleTranslateV2: {
    rateLimit: {
      maxConcurrent: 4,
      delayBetweenRequests: 0,
      initialDelay: 0,
      subsequentDelay: 200,
      burstLimit: 5,
      burstWindow: 1000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 1.5,
        maxDelay: 20000,
        resetAfterSuccess: 2
      }
    },
    batching: {
      strategy: 'character_limit',
      characterLimit: BASE_CHARACTER_LIMITS.GOOGLE,
      maxChunksPerBatch: 15, // V2 has smaller segment limit per request
      delimiter: DEFAULT_TEXT_DELIMITER
    },
    streaming: {
      enabled: true,
      chunkSize: 'character_based',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'rate_limit',
        'tkk_error'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'rate_limit': { delay: 10000, temporary: true },
        'tkk_error': { delay: 0, temporary: true }
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: false,
      supportsBatchRequests: true,
      supportsThinking: false,
      reliableJsonMode: false,
      supportsDictionary: true
    }
  },

  // Yandex Translate - Free translation service settings
  YandexTranslate: {
    rateLimit: {
      maxConcurrent: 4, // Moderate concurrent requests
      delayBetweenRequests: 0, // No delay for first request
      initialDelay: 0,
      subsequentDelay: 150, // Slightly slower than Google for subsequent requests
      burstLimit: 4,
      burstWindow: 1200,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 1.5,
        maxDelay: 15000,
        resetAfterSuccess: 2
      }
    },
    batching: {
      strategy: 'character_limit', // Use character-based chunking
      characterLimit: BASE_CHARACTER_LIMITS.YANDEX,
      maxChunksPerBatch: BASE_MAX_CHUNKS_PER_BATCH.YANDEX,
      delimiter: null // Yandex uses array format
    },
    streaming: {
      enabled: true, // Enable streaming for real-time chunk translation
      chunkSize: 'character_based',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'daily_quota',
        'rate_limit',
        'server_error'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'daily_quota': { delay: 86400000, temporary: false },
        'rate_limit': { delay: 10000, temporary: true },
        'server_error': { delay: 5000, temporary: true }
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: false,
      supportsBatchRequests: true, // Supports batch via chunking
      supportsThinking: false,
      reliableJsonMode: true,
      supportsDictionary: true // Yandex supports dictionary
    }
  },

  // DeepL Translate - Premium translation service settings
  DeepLTranslate: {
    rateLimit: {
      maxConcurrent: 5, // Higher for paid API
      delayBetweenRequests: 0, // No delay for first request
      initialDelay: 0,
      subsequentDelay: 100, // Fast for paid service
      burstLimit: 10,
      burstWindow: 1000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 1.5,
        maxDelay: 30000,
        resetAfterSuccess: 2
      }
    },
    batching: {
      strategy: 'character_limit', // Use character-based chunking
      characterLimit: BASE_CHARACTER_LIMITS.DEEPL,
      maxChunksPerBatch: BASE_MAX_CHUNKS_PER_BATCH.DEEPL,
      delimiter: null // DeepL uses array format
    },
    streaming: {
      enabled: true, // Enable streaming for real-time chunk translation
      chunkSize: 'character_based',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'character_limit',
        'daily_quota',
        'invalid_api_key'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'character_limit': { delay: 1000, temporary: true, retryWithSmallerChunk: true },
        'daily_quota': { delay: 86400000, temporary: false },
        'invalid_api_key': { delay: 0, temporary: false }
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: false,
      supportsBatchRequests: true, // DeepL supports batch requests
      supportsThinking: false,
      reliableJsonMode: false,
      supportsDictionary: false, // DeepL doesn't support dictionary
      supportsFormality: true // DeepL-specific feature
    }
  },

  // Bing Translate - Microsoft translation service settings
  BingTranslate: {
    rateLimit: {
      maxConcurrent: 3, // Conservative due to HTML response issues
      delayBetweenRequests: 0, // No delay for first request
      initialDelay: 0,
      subsequentDelay: 2000, // 2 seconds between subsequent requests
      burstLimit: 2,
      burstWindow: 3000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 2, // Aggressive backoff for HTML responses
        maxDelay: 30000,
        resetAfterSuccess: 3
      }
    },
    batching: {
      strategy: 'character_limit', // Use character-based chunking
      characterLimit: BASE_CHARACTER_LIMITS.BING,
      maxChunksPerBatch: BASE_MAX_CHUNKS_PER_BATCH.BING,
      delimiter: DEFAULT_TEXT_DELIMITER, // Standard resilient delimiter
      adaptiveChunking: true, // Enable adaptive chunking for errors
      minChunkSize: 100, // Minimum chunk size for retry
      maxRetries: 3 // Maximum retry attempts
    },
    streaming: {
      enabled: true, // Enable streaming for real-time chunk translation
      chunkSize: 'character_based',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'rate_limit',
        'html_response', // Bing-specific error
        'json_parsing_error',
        'server_error'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'rate_limit': { delay: 30000, temporary: true },
        'html_response': { delay: 5000, temporary: true, retryWithSmallerChunk: true },
        'json_parsing_error': { delay: 5000, temporary: true, retryWithSmallerChunk: true },
        'server_error': { delay: 10000, temporary: true }
      },
      enableCircuitBreaker: true,
      circuitBreakThreshold: 3 // Open circuit after 3 failures (reduced from default 5)
    },
    features: {
      supportsImageTranslation: false,
      supportsBatchRequests: true, // Supports batch via chunking
      supportsThinking: false,
      reliableJsonMode: true, // Bing usually provides reliable JSON
      supportsDictionary: false // Bing doesn't support dictionary
    }
  },

  // Microsoft Edge - Official Edge Browser translation service
  MicrosoftEdge: {
    rateLimit: {
      maxConcurrent: 4,
      delayBetweenRequests: 0,
      initialDelay: 0,
      subsequentDelay: 200,
      burstLimit: 10, // Increased burst limit
      burstWindow: 1000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 1.5,
        maxDelay: 20000,
        resetAfterSuccess: 2
      }
    },
    batching: {
      strategy: 'character_limit',
      characterLimit: 5000,
      optimalSize: 40, // Base segment limit for Edge
      maxChunksPerBatch: 100, // Increased from 20 to 100 - Edge API supports large batches
      delimiter: null // Uses JSON array
    },
    streaming: {
      enabled: true,
      chunkSize: 'character_based',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'rate_limit',
        'auth_error'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'rate_limit': { delay: 10000, temporary: true },
        'auth_error': { delay: 0, temporary: true } // Instant retry with new token
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: false,
      supportsBatchRequests: true, // Enable batch requests
      supportsThinking: false,
      reliableJsonMode: true,
      supportsDictionary: false
    }
  },

  // Browser API - Chrome's built-in translation (Local)
  BrowserAPI: {
    rateLimit: {
      maxConcurrent: 5, // High for local processing
      delayBetweenRequests: 0,
      initialDelay: 0,
      subsequentDelay: 0,
      burstLimit: 10,
      burstWindow: 1000
    },
    batching: {
      strategy: 'character_limit',
      characterLimit: 10000,
      maxChunksPerBatch: 50,
      delimiter: DEFAULT_TEXT_DELIMITER
    },
    streaming: {
      enabled: false, // Local API is atomic
      chunkSize: 'character_based',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: ['api_unavailable', 'language_not_supported'],
      retryStrategies: {
        'api_unavailable': { delay: 0, temporary: false },
        'language_not_supported': { delay: 0, temporary: false }
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: false,
      supportsBatchRequests: true,
      supportsThinking: false,
      reliableJsonMode: true
    }
  },

  // Lingva - Open-source Google Translate front-end settings
  Lingva: {
    rateLimit: {
      maxConcurrent: 3, // Conservative for public instances
      delayBetweenRequests: 0,
      initialDelay: 0,
      subsequentDelay: 500,
      burstLimit: 2,
      burstWindow: 2000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 2,
        maxDelay: 30000,
        resetAfterSuccess: 2
      }
    },
    batching: {
      strategy: 'character_limit',
      characterLimit: 1500, // Safe for GET URL lengths
      optimalSize: 15,      // Base segment limit
      maxChunksPerBatch: 30,
      delimiter: null // Uses JSON POST in config, but GET in provider (provider overrides)
    },
    streaming: {
      enabled: true,
      chunkSize: 'character_based',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'rate_limit'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'rate_limit': { delay: 30000, temporary: true }
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: false,
      supportsBatchRequests: true, // Supports batch via chunking
      supportsThinking: false,
      reliableJsonMode: true,
      supportsDictionary: false
    }
  },

  // Custom Provider - Flexible/configurable settings
  Custom: {
    rateLimit: {
      maxConcurrent: 2, // Safe default
      delayBetweenRequests: 0, // No delay for first request
      initialDelay: 0,
      subsequentDelay: 1000, // Standard delay for subsequent requests
      burstLimit: 3,
      burstWindow: 2000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 1.5,
        maxDelay: 30000,
        resetAfterSuccess: 2
      }
    },
    batching: {
      ...UNIFIED_AI_BATCHING_CONFIG,
      strategy: 'json'
    },
    streaming: {
      enabled: true, // Enable streaming for real-time segment translation
      chunkSize: 'fixed',
      realTimeUpdates: true
    },
    errorHandling: {
      quotaTypes: [
        'requests_per_minute',
        'rate_limit',
        'quota_exceeded'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'rate_limit': { delay: 30000, temporary: true },
        'quota_exceeded': { delay: 3600000, temporary: false }
      },
      enableCircuitBreaker: true
    },
    features: {
      supportsImageTranslation: false, // Conservative default
      supportsBatchRequests: true, // Enable batch requests for streaming
      supportsThinking: false,
      reliableJsonMode: false
    }
  }
};

/**
 * Get configuration for a specific provider
 * @param {string} providerName - Name of the provider
 * @param {number} level - Optimization level (1-5, default 3)
 * @returns {object} - Provider configuration
 */
export function getProviderConfiguration(providerName, level = 3) {
  // Normalize provider name (handle case variations)
  const normalizedName = normalizeProviderName(providerName);

  const baseConfig = PROVIDER_CONFIGURATIONS[normalizedName];
  if (!baseConfig) {
    logger.warn(`[ProviderConfigurations] No configuration found for provider: ${providerName}, using Custom defaults`);
    return applyOptimizationLevel(PROVIDER_CONFIGURATIONS.Custom, level);
  }

  return applyOptimizationLevel(baseConfig, level);
}

/**
 * Apply optimization level (1-5) to a provider's base configuration
 * Level 1: Stability/Economy (Lower concurrency, larger batches for AI, higher delays for traditional)
 * Level 3: Balanced (Default)
 * Level 5: Turbo (Higher concurrency, smaller batches for faster UX, lower delays)
 * @private
 */
function applyOptimizationLevel(config, level) {
  const safeLevel = Math.max(1, Math.min(5, level));
  if (safeLevel === 3) return config; // Already optimized for level 3

  const result = { ...config, rateLimit: { ...config.rateLimit }, batching: { ...config.batching } };

  // 1. Scale Rate Limits
  // Concurrent requests multipliers: Level 1 (0.4), Level 2 (0.7), Level 3 (1.0), Level 4 (1.5), Level 5 (2.0)
  // We use floor for levels < 3 to be more conservative and ceil for levels > 3 to be more aggressive
  const concurrentMultipliers = { 1: 0.4, 2: 0.7, 3: 1, 4: 1.5, 5: 2.0 };
  const baseConcurrent = config.rateLimit.maxConcurrent;
  
  if (safeLevel < 3) {
    result.rateLimit.maxConcurrent = Math.max(1, Math.floor(baseConcurrent * concurrentMultipliers[safeLevel]));
  } else if (safeLevel > 3) {
    result.rateLimit.maxConcurrent = Math.max(baseConcurrent, Math.ceil(baseConcurrent * concurrentMultipliers[safeLevel]));
  }

  // Scale Burst Limit if it exists, using the same logic
  if (config.rateLimit.burstLimit) {
    const baseBurst = config.rateLimit.burstLimit;
    if (safeLevel < 3) {
      result.rateLimit.burstLimit = Math.max(1, Math.floor(baseBurst * concurrentMultipliers[safeLevel]));
    } else if (safeLevel > 3) {
      result.rateLimit.burstLimit = Math.max(baseBurst, Math.ceil(baseBurst * concurrentMultipliers[safeLevel]));
    }
  }

  // Guardrails: Scale with safety
  if (result.rateLimit.maxConcurrent > 1) {
    result.rateLimit.maxConcurrent = Math.min(result.rateLimit.maxConcurrent, 12);
  } else if (safeLevel >= 4) {
    result.rateLimit.maxConcurrent = 2;
  }
  
  // Ensure burstLimit doesn't exceed maxConcurrent
  if (result.rateLimit.burstLimit > result.rateLimit.maxConcurrent) {
    result.rateLimit.burstLimit = result.rateLimit.maxConcurrent;
  }

  // Subsequent Delay multipliers: Level 1 (2.5), Level 2 (1.5), Level 3 (1.0), Level 4 (0.7), Level 5 (0.4)
  const delayMultipliers = { 1: 2.5, 2: 1.5, 3: 1, 4: 0.7, 5: 0.4 };
  result.rateLimit.subsequentDelay = Math.round(config.rateLimit.subsequentDelay * delayMultipliers[safeLevel]);
  
  // Scale Batching Delays if present
  if (result.batching.delayBetweenRequests) {
    result.batching.delayBetweenRequests = Math.round(config.batching.delayBetweenRequests * delayMultipliers[safeLevel]);
  }

  // 2. Scale Batching (Speed vs Cost)
  const isAIStrategy = config.batching.strategy === 'smart' || config.batching.strategy === 'json';

  if (isAIStrategy) {
    // AI Strategy: 
    // Level 1 (Economy): Large batches (multiplier 2.0x-2.5x) -> Minimizes Context/System Prompt overhead (Cost Efficient)
    // Level 5 (Turbo): Small batches (multiplier 0.3x-0.5x) -> Faster streaming/UI updates (Speed Efficient)
    const aiSizeMultipliers = { 1: 2.5, 2: 1.5, 3: 1, 4: 0.6, 5: 0.3 };
    const multiplier = aiSizeMultipliers[safeLevel];

    result.batching.optimalSize = Math.max(5, Math.round(config.batching.optimalSize * multiplier));
    result.batching.maxComplexity = Math.max(100, Math.round(config.batching.maxComplexity * multiplier));
    
    // Scale singleBatchThreshold as well for AI
    if (result.batching.singleBatchThreshold) {
      result.batching.singleBatchThreshold = Math.max(5, Math.round(config.batching.singleBatchThreshold * multiplier));
    }
  } else if (config.batching.strategy === 'character_limit') {
    // Traditional: Level 1 (Economy/Stability) -> Large chunks, Level 5 (Turbo) -> Small chunks
    const sizeMultipliers = { 1: 1.5, 2: 1.2, 3: 1, 4: 0.8, 5: 0.6 };
    const multiplier = sizeMultipliers[safeLevel];

    result.batching.characterLimit = Math.max(500, Math.round(config.batching.characterLimit * multiplier));
    
    // GUARDRAIL: Only scale down maxChunksPerBatch for levels > 3 if the base value is high.
    // For traditional providers, we want to maintain at least 25 segments per request 
    // to avoid the 'Double Fragmentation' issue with the Scheduler.
    if (config.batching.maxChunksPerBatch) {
      const chunkMultiplier = safeLevel > 3 ? Math.max(0.8, multiplier) : multiplier;
      const minSafeSegments = 25;
      
      const newMaxChunks = Math.round(config.batching.maxChunksPerBatch * chunkMultiplier);
      result.batching.maxChunksPerBatch = Math.max(minSafeSegments, newMaxChunks);
    }
    
    if (config.batching.optimalSize) {
      result.batching.optimalSize = Math.max(15, Math.round(config.batching.optimalSize * multiplier));
    }
  }

  return result;
}

/**
 * Normalize provider name to match configuration keys
 * @param {string} providerName - Provider name
 * @returns {string} - Normalized provider name
 */
function normalizeProviderName(providerName) {
  if (!providerName || typeof providerName !== 'string') {
    return ProviderNames.CUSTOM;
  }

  const name = providerName.toLowerCase();

  // Map common variations to standard names using ProviderNames constants
  const nameMapping = {
    'gemini': ProviderNames.GEMINI,
    'google-gemini': ProviderNames.GEMINI,
    'googlegemini': ProviderNames.GEMINI,
    'openai': ProviderNames.OPENAI,
    'gpt': ProviderNames.OPENAI,
    'chatgpt': ProviderNames.OPENAI,
    'deepseek': ProviderNames.DEEPSEEK,
    'openrouter': ProviderNames.OPENROUTER,
    'webai': ProviderNames.WEBAI,
    'googletranslate': ProviderNames.GOOGLE_TRANSLATE,
    'google-translate': ProviderNames.GOOGLE_TRANSLATE,
    'googletranslatev2': ProviderNames.GOOGLE_TRANSLATE_V2,
    'googlev2': ProviderNames.GOOGLE_TRANSLATE_V2,
    'google-v2': ProviderNames.GOOGLE_TRANSLATE_V2,
    'google-robust': ProviderNames.GOOGLE_TRANSLATE_V2,
    'yandextranslate': ProviderNames.YANDEX_TRANSLATE,
    'yandex-translate': ProviderNames.YANDEX_TRANSLATE,
    'yandex': ProviderNames.YANDEX_TRANSLATE,
    'deepl': ProviderNames.DEEPL_TRANSLATE,
    'deepltranslate': ProviderNames.DEEPL_TRANSLATE,
    'deep-l': ProviderNames.DEEPL_TRANSLATE,
    'bingtranslate': ProviderNames.BING_TRANSLATE,
    'bing-translate': ProviderNames.BING_TRANSLATE,
    'bing': ProviderNames.BING_TRANSLATE,
    'edge': ProviderNames.MICROSOFT_EDGE,
    'microsoftedge': ProviderNames.MICROSOFT_EDGE,
    'microsoft-edge': ProviderNames.MICROSOFT_EDGE,
    'lingva': ProviderNames.LINGVA,
    'lingvatranslate': ProviderNames.LINGVA,
    'lingva-translate': ProviderNames.LINGVA,
    'browser': ProviderNames.BROWSER_API,
    'browserranslate': ProviderNames.BROWSER_API,
    'custom': ProviderNames.CUSTOM,
    'custom-openai': ProviderNames.CUSTOM
  };

  return nameMapping[name] || ProviderNames.CUSTOM;
}

/**
 * Get rate limit configuration for a provider
 * @param {string} providerName - Provider name
 * @param {number} level - Optimization level
 * @returns {object} - Rate limit configuration
 */
export function getProviderRateLimit(providerName, level = 3) {
  const config = getProviderConfiguration(providerName, level);
  return config.rateLimit;
}

/**
 * Get batching configuration for a provider
 * @param {string} providerName - Provider name
 * @param {string} translateMode - Translation mode (optional)
 * @param {number} level - Optimization level
 * @returns {object} - Batching configuration
 */
export function getProviderBatching(providerName, translateMode = null, level = 3) {
  const config = getProviderConfiguration(providerName, level);

  if (!translateMode || !config.batching.modeOverrides || !config.batching.modeOverrides[translateMode]) {
    return config.batching;
  }

  // Merge base config with mode-specific overrides
  return {
    ...config.batching,
    ...config.batching.modeOverrides[translateMode]
  };
}

/**
 * Get streaming configuration for a provider
 * @param {string} providerName - Provider name
 * @param {number} level - Optimization level
 * @returns {object} - Streaming configuration
 */
export function getProviderStreaming(providerName, level = 3) {
  const config = getProviderConfiguration(providerName, level);
  return config.streaming;
}

/**
 * Get error handling configuration for a provider
 * @param {string} providerName - Provider name
 * @param {number} level - Optimization level
 * @returns {object} - Error handling configuration
 */
export function getProviderErrorHandling(providerName, level = 3) {
  const config = getProviderConfiguration(providerName, level);
  return config.errorHandling;
}

/**
 * Get provider features/capabilities
 * @param {string} providerName - Provider name
 * @param {number} level - Optimization level
 * @returns {object} - Provider features
 */
export function getProviderFeatures(providerName, level = 3) {
  const config = getProviderConfiguration(providerName, level);
  return config.features;
}

/**
 * Check if provider supports streaming
 * @param {string} providerName - Provider name
 * @returns {boolean} - Whether provider supports streaming
 */
export function isStreamingSupported(providerName) {
  const config = getProviderConfiguration(providerName);
  return config.streaming.enabled;
}

/**
 * Check if provider supports batch requests
 * @param {string} providerName - Provider name
 * @returns {boolean} - Whether provider supports batch requests
 */
export function isBatchSupported(providerName) {
  const config = getProviderConfiguration(providerName);
  return config.features.supportsBatchRequests;
}

/**
 * Update provider configuration dynamically
 * @param {string} providerName - Provider name
 * @param {object} updates - Configuration updates
 */
export function updateProviderConfiguration(providerName, updates) {
  const normalizedName = normalizeProviderName(providerName);
  
  if (!PROVIDER_CONFIGURATIONS[normalizedName]) {
    logger.warn(`[ProviderConfigurations] Cannot update unknown provider: ${providerName}`);
    return;
  }
  
  // Deep merge the updates
  PROVIDER_CONFIGURATIONS[normalizedName] = deepMerge(
    PROVIDER_CONFIGURATIONS[normalizedName],
    updates
  );
  
  logger.debug(`[ProviderConfigurations] Updated configuration for ${normalizedName}:`, updates);
}

/**
 * Deep merge two objects
 * @param {object} target - Target object
 * @param {object} source - Source object
 * @returns {object} - Merged object
 */
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  
  return result;
}

/**
 * Get all supported provider names
 * @returns {string[]} - Array of provider names
 */
export function getSupportedProviders() {
  return Object.keys(PROVIDER_CONFIGURATIONS);
}

/**
 * Export configurations for debugging/monitoring
 * @returns {object} - All provider configurations
 */
export function getAllConfigurations() {
  return { ...PROVIDER_CONFIGURATIONS };
}

logger.debug('[ProviderConfigurations] Initialized with providers:', Object.keys(PROVIDER_CONFIGURATIONS));