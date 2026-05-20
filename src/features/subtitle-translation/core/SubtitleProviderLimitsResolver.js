import { PROVIDER_CONFIGURATIONS, BASE_CHARACTER_LIMITS, BASE_MAX_CHUNKS_PER_BATCH, AI_BATCHING_LIMITS } from '@/features/translation/core/ProviderConfigurations.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.SUBTITLE, 'SubtitleProviderLimitsResolver');

/**
 * Resolves translation limits (characters, chunks) for a specific provider
 * tailored for subtitle translation workloads.
 */
export class SubtitleProviderLimitsResolver {
  /**
   * Resolves limits for the given provider.
   * @param {string} providerId - The ID of the provider (e.g., 'Gemini', 'GoogleTranslateV2')
   * @returns {Object} { characterLimit, maxChunks, strategy }
   */
  static resolve(providerId) {
    const config = PROVIDER_CONFIGURATIONS[providerId];
    if (!config) {
      logger.warn(`No configuration found for provider ${providerId}, using safe defaults.`);
      return this.getSafeDefaults();
    }

    const batching = config.batching || {};
    const strategy = batching.strategy || (config.features?.supportsBatchRequests ? 'json' : 'string');

    // Use mode-specific overrides if available, otherwise fallback to standard AI or traditional limits
    const modeOverride = batching.modeOverrides?.[TranslationMode.Subtitle] || 
                         batching.modeOverrides?.[TranslationMode.Page] || {};

    let characterLimit = modeOverride.characterLimit || batching.characterLimit;
    let maxChunks = modeOverride.optimalSize || batching.optimalSize;

    // Fallback to baseline limits if still not resolved
    if (!characterLimit) {
      const upperProviderId = providerId.toUpperCase();
      characterLimit = BASE_CHARACTER_LIMITS[upperProviderId] || AI_BATCHING_LIMITS.CHARACTER_LIMIT || 5000;
    }

    if (!maxChunks) {
      const upperProviderId = providerId.toUpperCase();
      maxChunks = BASE_MAX_CHUNKS_PER_BATCH[upperProviderId] || AI_BATCHING_LIMITS.OPTIMAL_SIZE || 20;
    }

    // Optimization: For subtitle files, we can slightly increase limits for AI providers
    // if they are known to handle large contexts well, but we stay conservative for now.
    
    return {
      characterLimit,
      maxChunks,
      strategy,
      reliableJsonMode: config.features?.reliableJsonMode || false
    };
  }

  /**
   * Safe baseline defaults for unknown providers.
   */
  static getSafeDefaults() {
    return {
      characterLimit: 2000,
      maxChunks: 10,
      strategy: 'string',
      reliableJsonMode: false
    };
  }
}
