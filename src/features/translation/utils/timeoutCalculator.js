/**
 * Dynamic Timeout Calculator for Translation Operations
 * Provides consistent timeout calculation across different translation components
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TimeoutCalculator');

/**
 * Default timeout configuration
 * Can be overridden by importing components
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
    logger.debug(`Invalid segment count (${segmentCount}), using fallback timeout`);
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

  logger.debug(`Dynamic timeout calculated: ${segmentCount} segments → ${finalTimeout}ms (${finalTimeout/1000}s)`, {
    segmentCount,
    calculatedTimeout,
    finalTimeout,
    config: safeConfig
  });

  return finalTimeout;
}

/**
 * Calculate timeout for batch processing (used in BaseAIProvider)
 * Optimized for AI provider batch operations
 * 
 * @param {number} batchSize - Size of the batch being processed
 * @param {string} providerName - Name of the provider for logging
 * @returns {number} - Timeout in milliseconds
 */
export function calculateBatchTimeout(batchSize, providerName = 'unknown') {
  const timeout = calculateDynamicTimeout(batchSize);
  
  logger.debug(`Batch timeout calculated for ${providerName}: ${batchSize} items → ${timeout}ms (${timeout/1000}s)`);
  
  return timeout;
}

/**
 * Get human-readable timeout description
 * 
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {string} - Human-readable description
 */
export function formatTimeout(timeoutMs) {
  if (timeoutMs < 60000) {
    return `${Math.round(timeoutMs / 1000)}s`;
  } else if (timeoutMs < 3600000) {
    return `${Math.round(timeoutMs / 60000)}m`;
  } else {
    return `${Math.round(timeoutMs / 3600000)}h`;
  }
}

/**
 * Create a timeout promise for race conditions
 * 
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operation - Operation name for error message
 * @returns {Promise} - Promise that rejects after timeout
 */
export function createTimeoutPromise(timeoutMs, operation = 'operation') {
  return new Promise((_, reject) => {
    setTimeout(() => {
      const formattedTimeout = formatTimeout(timeoutMs);
      reject(new Error(`${operation} timeout after ${formattedTimeout}`));
    }, timeoutMs);
  });
}

export default {
  calculateDynamicTimeout,
  calculateBatchTimeout,
  formatTimeout,
  createTimeoutPromise,
  DEFAULT_TIMEOUT_CONFIG
};