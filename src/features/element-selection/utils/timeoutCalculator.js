/**
 * Dynamic Timeout Calculator for Translation Operations
 * Copied from @/features/translation/utils/timeoutCalculator.js
 * Simplified for element-selection independence
 */

/**
 * Default timeout configuration
 */
export const DEFAULT_TIMEOUT_CONFIG = {
  BASE_TIMEOUT: 60000,      // 1 minute base timeout
  TIME_PER_SEGMENT: 5000,   // 5 seconds per segment
  MAX_TIMEOUT: 1800000,     // 30 minutes maximum timeout
  MIN_TIMEOUT: 60000,       // 1 minute minimum timeout
  FALLBACK_TIMEOUT: 15000   // 15 seconds fallback for invalid inputs
};

/**
 * Calculate dynamic timeout based on the number of segments to translate
 * Uses a configurable algorithm with min/max constraints
 *
 * @param {number} segmentCount - Number of translation segments
 * @param {Object} config - Optional timeout configuration override
 * @returns {number} - Timeout in milliseconds
 */
export function calculateDynamicTimeout(segmentCount, config = DEFAULT_TIMEOUT_CONFIG) {
  // Validate input
  if (!segmentCount || segmentCount <= 0 || !Number.isInteger(segmentCount)) {
    console.debug(`[TimeoutCalculator] Invalid segment count (${segmentCount}), using fallback timeout`);
    return config.FALLBACK_TIMEOUT || DEFAULT_TIMEOUT_CONFIG.FALLBACK_TIMEOUT;
  }

  // Validate configuration
  const safeConfig = {
    BASE_TIMEOUT: config.BASE_TIMEOUT || DEFAULT_TIMEOUT_CONFIG.BASE_TIMEOUT,
    TIME_PER_SEGMENT: config.TIME_PER_SEGMENT || DEFAULT_TIMEOUT_CONFIG.TIME_PER_SEGMENT,
    MAX_TIMEOUT: config.MAX_TIMEOUT || DEFAULT_TIMEOUT_CONFIG.MAX_TIMEOUT,
    MIN_TIMEOUT: config.MIN_TIMEOUT || DEFAULT_TIMEOUT_CONFIG.MIN_TIMEOUT
  };

  // Calculate timeout: base + (segments × time per segment)
  const calculatedTimeout = safeConfig.BASE_TIMEOUT + (segmentCount * safeConfig.TIME_PER_SEGMENT);

  // Apply min/max constraints
  const finalTimeout = Math.max(
    safeConfig.MIN_TIMEOUT,
    Math.min(calculatedTimeout, safeConfig.MAX_TIMEOUT)
  );

  console.debug(`[TimeoutCalculator] Dynamic timeout calculated: ${segmentCount} segments → ${finalTimeout}ms (${finalTimeout / 1000}s)`, {
    segmentCount,
    calculatedTimeout,
    finalTimeout,
    config: safeConfig
  });

  return finalTimeout;
}