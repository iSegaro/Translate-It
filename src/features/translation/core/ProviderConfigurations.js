/**
 * Provider Configurations - Centralized configuration for all translation providers
 * Defines provider-specific optimizations for rate limiting, batching, streaming, and error handling
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'ProviderConfigurations');

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
    batching: UNIFIED_AI_BATCHING_CONFIG,
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
    batching: UNIFIED_AI_BATCHING_CONFIG,
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
    batching: UNIFIED_AI_BATCHING_CONFIG,
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
    batching: UNIFIED_AI_BATCHING_CONFIG,
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
    batching: UNIFIED_AI_BATCHING_CONFIG,
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
      maxConcurrent: 2, // Moderate concurrent requests
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
      characterLimit: 3900, // Google's character limit
      maxChunksPerBatch: 10,
      delimiter: '\n\n---\n\n' // Google's reliable delimiter
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

  // Yandex Translate - Free translation service settings
  YandexTranslate: {
    rateLimit: {
      maxConcurrent: 2, // Moderate concurrent requests
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
      characterLimit: 10000, // Yandex's character limit
      maxChunksPerBatch: 8,
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
      supportsDictionary: false // Yandex doesn't support dictionary
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
      characterLimit: 10000, // DeepL's character limit
      maxChunksPerBatch: 8,
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
      maxConcurrent: 1, // Conservative due to HTML response issues
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
      characterLimit: 4000, // Conservative limit for Bing
      maxChunksPerBatch: 5,
      delimiter: '\n\n---\n\n', // Similar to Google
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
    batching: UNIFIED_AI_BATCHING_CONFIG,
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
 * @returns {object} - Provider configuration
 */
export function getProviderConfiguration(providerName) {
  // Normalize provider name (handle case variations)
  const normalizedName = normalizeProviderName(providerName);
  
  const config = PROVIDER_CONFIGURATIONS[normalizedName];
  if (!config) {
    logger.warn(`[ProviderConfigurations] No configuration found for provider: ${providerName}, using Custom defaults`);
    return PROVIDER_CONFIGURATIONS.Custom;
  }
  
  return config;
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
    'yandextranslate': ProviderNames.YANDEX_TRANSLATE,
    'yandex-translate': ProviderNames.YANDEX_TRANSLATE,
    'yandex': ProviderNames.YANDEX_TRANSLATE,
    'deepl': ProviderNames.DEEPL_TRANSLATE,
    'deepltranslate': ProviderNames.DEEPL_TRANSLATE,
    'deep-l': ProviderNames.DEEPL_TRANSLATE,
    'bingtranslate': ProviderNames.BING_TRANSLATE,
    'bing-translate': ProviderNames.BING_TRANSLATE,
    'bing': ProviderNames.BING_TRANSLATE,
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
 * @returns {object} - Rate limit configuration
 */
export function getProviderRateLimit(providerName) {
  const config = getProviderConfiguration(providerName);
  return config.rateLimit;
}

/**
 * Get batching configuration for a provider
 * @param {string} providerName - Provider name
 * @param {string} translateMode - Translation mode (optional)
 * @returns {object} - Batching configuration
 */
export function getProviderBatching(providerName, translateMode = null) {
  const config = getProviderConfiguration(providerName);

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
 * @returns {object} - Streaming configuration
 */
export function getProviderStreaming(providerName) {
  const config = getProviderConfiguration(providerName);
  return config.streaming;
}

/**
 * Get error handling configuration for a provider
 * @param {string} providerName - Provider name
 * @returns {object} - Error handling configuration
 */
export function getProviderErrorHandling(providerName) {
  const config = getProviderConfiguration(providerName);
  return config.errorHandling;
}

/**
 * Get provider features/capabilities
 * @param {string} providerName - Provider name
 * @returns {object} - Provider features
 */
export function getProviderFeatures(providerName) {
  const config = getProviderConfiguration(providerName);
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