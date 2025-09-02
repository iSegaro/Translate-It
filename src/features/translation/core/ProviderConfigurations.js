/**
 * Provider Configurations - Centralized configuration for all translation providers
 * Defines provider-specific optimizations for rate limiting, batching, streaming, and error handling
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'ProviderConfigurations');

/**
 * Provider-specific configurations
 * Each provider has optimized settings based on their API characteristics and limitations
 */
export const PROVIDER_CONFIGURATIONS = {
  // Google Gemini - Conservative settings due to strict quotas
  Gemini: {
    rateLimit: {
      maxConcurrent: 1,
      delayBetweenRequests: 5000, // 5 seconds between requests
      burstLimit: 1,
      burstWindow: 5000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 2,
        maxDelay: 45000, // 45 seconds max delay
        resetAfterSuccess: 3
      }
    },
    batching: {
      strategy: 'smart', // Use smart batching
      optimalSize: 25, // Larger batches for efficiency
      maxComplexity: 400, // Higher complexity threshold
      singleBatchThreshold: 20 // Use single batch for ≤20 segments
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
        'concurrent_requests'
      ],
      retryStrategies: {
        'requests_per_minute': { delay: 60000, temporary: true },
        'tokens_per_minute': { delay: 60000, temporary: true },
        'requests_per_day': { delay: 86400000, temporary: false },
        'concurrent_requests': { delay: 5000, temporary: true }
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
      delayBetweenRequests: 1000, // 1 second between requests
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
      strategy: 'smart',
      optimalSize: 15, // Smaller batches than Gemini
      maxComplexity: 300,
      singleBatchThreshold: 15
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

  // DeepSeek - Conservative settings due to newer/less stable API
  DeepSeek: {
    rateLimit: {
      maxConcurrent: 1,
      delayBetweenRequests: 2000, // 2 seconds between requests
      burstLimit: 2,
      burstWindow: 3000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 2,
        maxDelay: 30000,
        resetAfterSuccess: 2
      }
    },
    batching: {
      strategy: 'fixed', // More predictable for newer APIs
      optimalSize: 10, // Smaller batches for safety
      maxComplexity: 200,
      singleBatchThreshold: 10
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

  // OpenRouter - Flexible settings that adapt to underlying model
  OpenRouter: {
    rateLimit: {
      maxConcurrent: 2,
      delayBetweenRequests: 1500, // 1.5 seconds
      burstLimit: 3,
      burstWindow: 3000,
      adaptiveBackoff: {
        enabled: true,
        baseMultiplier: 1.8,
        maxDelay: 45000,
        resetAfterSuccess: 2
      }
    },
    batching: {
      strategy: 'smart',
      optimalSize: 12, // Conservative for multi-model support
      maxComplexity: 250,
      singleBatchThreshold: 12
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
      delayBetweenRequests: 1000, // Standard delay
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
      strategy: 'smart', // Use smart batching like other providers
      optimalSize: 15, // Moderate batch size
      maxComplexity: 300,
      singleBatchThreshold: 15
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

  // Custom Provider - Flexible/configurable settings
  Custom: {
    rateLimit: {
      maxConcurrent: 2, // Safe default
      delayBetweenRequests: 1000,
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
      strategy: 'fixed', // Safe default for unknown APIs
      optimalSize: 10,
      maxComplexity: 200,
      singleBatchThreshold: 10
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
    return 'Custom';
  }
  
  const name = providerName.toLowerCase();
  
  // Map common variations to standard names
  const nameMapping = {
    'gemini': 'Gemini',
    'google-gemini': 'Gemini',
    'googlegemini': 'Gemini',
    'openai': 'OpenAI',
    'gpt': 'OpenAI',
    'chatgpt': 'OpenAI',
    'deepseek': 'DeepSeek',
    'openrouter': 'OpenRouter',
    'webai': 'WebAI',
    'custom': 'Custom',
    'custom-openai': 'Custom'
  };
  
  return nameMapping[name] || 'Custom';
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
 * @returns {object} - Batching configuration
 */
export function getProviderBatching(providerName) {
  const config = getProviderConfiguration(providerName);
  return config.batching;
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