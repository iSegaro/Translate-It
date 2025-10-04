/**
 * Rate Limit Manager - Intelligent request throttling for translation providers
 * Prevents API rate limiting by controlling request timing and concurrency
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { requestHealthMonitor } from './RequestHealthMonitor.js';
import { getProviderRateLimit } from './ProviderConfigurations.js';
import { ErrorClassifier } from './ErrorClassifier.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'RateLimitManager');

/**
 * Default fallback configuration for unknown providers
 */
const DEFAULT_RATE_LIMIT_CONFIG = {
  maxConcurrent: 2,
  delayBetweenRequests: 0, // No delay for first request
  initialDelay: 0,
  subsequentDelay: 1000, // 1 second for subsequent requests
  burstLimit: 3,
  burstWindow: 2000,
  adaptiveBackoff: {
    enabled: true,
    baseMultiplier: 1.5,
    maxDelay: 30000,
    resetAfterSuccess: 2
  }
};

/**
 * Rate Limit Manager - Singleton class for managing API request rates
 */
export class RateLimitManager {
  constructor() {
    if (RateLimitManager.instance) {
      return RateLimitManager.instance;
    }
    
    // Provider state tracking
    this.providerStates = new Map();
    
    // Global state
    this.isInitialized = false;
    
    RateLimitManager.instance = this;
    logger.init('RateLimitManager singleton created');
  }
  
  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!RateLimitManager.instance) {
      RateLimitManager.instance = new RateLimitManager();
    }
    return RateLimitManager.instance;
  }
  
  /**
   * Initialize provider state if not exists
   */
  _initializeProvider(providerName) {
    if (this.providerStates.has(providerName)) {
      return this.providerStates.get(providerName);
    }
    
    // Get configuration from centralized ProviderConfigurations system
    let config;
    try {
      config = getProviderRateLimit(providerName);
      // Using provider configuration for ${providerName}
    } catch (error) {
      logger.debug(`Failed to load configuration for ${providerName}, using default:`, error.message);
      config = DEFAULT_RATE_LIMIT_CONFIG;
    }
    const state = {
      config: { ...config },
      activeRequests: 0,
      requestQueue: [],
      lastRequestTime: 0,
      requestHistory: [], // For burst detection
      isProcessingQueue: false,
      // Circuit breaker properties
      consecutiveFailures: 0,
      isCircuitOpen: false,
      circuitOpenTime: 0,
      circuitBreakThreshold: 5, // Circuit opens after 5 consecutive failures
      circuitRecoveryTime: 30000, // 30 seconds
      maxPendingRequests: 10, // Maximum pending requests per provider
      // Adaptive backoff properties
      currentBackoffMultiplier: 1,
      successfulRequestsCount: 0,
      lastFailureTime: 0
    };
    
    this.providerStates.set(providerName, state);
    // Rate limiting initialized for provider: ${providerName}
    return state;
  }
  
  /**
   * Check if provider can make a request immediately
   * @param {string} providerName - Provider name
   * @param {string} context - Request context (e.g., "segment-1/2", "standard")
   */
  canMakeRequest(providerName, context = 'standard', translateMode = null) {
    const state = this._initializeProvider(providerName);
    const now = Date.now();
    
    // Determine if this is a multi-segment Select Element operation
    const isMultiSegmentSelectElement = this._isMultiSegmentSelectElement(context, translateMode);
    
    // For non-multi-segment operations, allow immediate execution (no rate limiting)
    if (!isMultiSegmentSelectElement) {
      // Still respect concurrent limit for all operations
      if (state.activeRequests >= state.config.maxConcurrent) {
        return false;
      }
      return true;
    }
    
    // Apply full rate limiting only for multi-segment Select Element operations
    // Check concurrent limit
    if (state.activeRequests >= state.config.maxConcurrent) {
      return false;
    }
    
    // For first request (lastRequestTime = 0), allow immediate execution
    if (state.lastRequestTime === 0) {
      return true;
    }
    
    // Check time-based delay with adaptive backoff for subsequent requests
    const baseDelay = state.config.subsequentDelay || state.config.delayBetweenRequests;
    let adjustedDelay = baseDelay;
    
    // Apply adaptive backoff if enabled
    if (state.config.adaptiveBackoff?.enabled && state.currentBackoffMultiplier > 1) {
      adjustedDelay = Math.min(
        baseDelay * state.currentBackoffMultiplier,
        state.config.adaptiveBackoff.maxDelay
      );
    }
    
    const timeSinceLastRequest = now - state.lastRequestTime;
    if (timeSinceLastRequest < adjustedDelay) {
      return false;
    }
    
    // Check burst limit
    const recentRequests = state.requestHistory.filter(
      time => (now - time) < state.config.burstWindow
    );
    if (recentRequests.length >= state.config.burstLimit) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Execute a request with rate limiting
   * Returns a Promise that resolves when the request can be made
   */
  async executeWithRateLimit(providerName, requestFunction, context = 'standard', translateMode = null) {
    const state = this._initializeProvider(providerName);
    
    // Note: Fast-fail logic for deterministic errors is handled in the catch block
    // to prevent duplicate API calls while still catching configuration errors immediately
    
    // Check circuit breaker
    if (this._isCircuitOpen(state)) {
      const error = new Error(`Circuit breaker is open for ${providerName}. Too many recent failures.`);
      error.type = 'CIRCUIT_BREAKER_OPEN';
      throw error;
    }
    
    // Check pending requests limit
    const totalPending = state.activeRequests + state.requestQueue.length;
    if (totalPending >= state.maxPendingRequests) {
      const error = new Error(`Too many pending requests for ${providerName} (${totalPending}/${state.maxPendingRequests})`);
      error.type = 'QUEUE_FULL';
      throw error;
    }
    
    const startTime = Date.now();
    
    // Wait for our turn
    await this._waitForSlot(providerName, context, translateMode);
    
    const waitTime = Date.now() - startTime;
    if (waitTime > 0) {
      logger.debug(`Rate limit wait: ${waitTime}ms for ${providerName} (${context})`);
    }
    
    // Mark request as active
    state.activeRequests++;
    state.lastRequestTime = Date.now();
    state.requestHistory.push(state.lastRequestTime);
    
    // Clean old history entries
    const cutoffTime = state.lastRequestTime - state.config.burstWindow;
    state.requestHistory = state.requestHistory.filter(time => time > cutoffTime);
    
    // Defensive check to prevent activeRequests from growing indefinitely
    if (state.activeRequests > state.config.maxConcurrent * 3) {
      logger.warn(`Resetting activeRequests counter for ${providerName}: was ${state.activeRequests}, max should be ${state.config.maxConcurrent}`);
      state.activeRequests = state.config.maxConcurrent;
    }
    
    const requestStartTime = Date.now();
    
    try {
      logger.debug(`Executing request for ${providerName} (active: ${state.activeRequests})`);
      const result = await requestFunction();
      const responseTime = Date.now() - requestStartTime;
      
      // Success - reset circuit breaker and record health
      this._recordSuccess(state);
      requestHealthMonitor.recordSuccess(providerName, responseTime, { context });
      
      return result;
    } catch (error) {
      const responseTime = Date.now() - requestStartTime;
      
      // Fast-fail for deterministic errors - don't update circuit breaker or health monitor
      if (ErrorClassifier.isDeterministicError(error)) {
        logger.debug(`Fast-fail: Deterministic error, skipping circuit breaker update for ${providerName}: ${error.message}`);
        throw error;
      }
      
      // Failure - update circuit breaker and record health (only for retryable errors)
      this._recordFailure(state, error, providerName);
      requestHealthMonitor.recordFailure(providerName, error, responseTime, { context });
      
      throw error;
    } finally {
      // Mark request as complete - ensure it never goes negative
      if (state.activeRequests > 0) {
        state.activeRequests--;
      } else {
        logger.warn(`activeRequests was already 0 for ${providerName}, possible counter mismatch`);
      }
      logger.debug(`Request completed for ${providerName} (active: ${state.activeRequests})`);
      
      // Process any queued requests
      if (state.requestQueue.length > 0 && !state.isProcessingQueue) {
        this._processQueue(providerName);
      }
    }
  }
  
  /**
   * Determine if the context represents a multi-segment Select Element operation
   * @param {string} context - Request context
   * @returns {boolean} - True if multi-segment Select Element
   * @private
   */
  _isMultiSegmentSelectElement(context, translateMode = null) {
    if (!context || typeof context !== 'string') {
      return false;
    }
    
    // Match various patterns: "segment-X/Y", "batch-X/Y", "streaming-chunk-X/Y", etc.
    const segmentMatch = context.match(/^(segment|batch|streaming-chunk|chunk|streaming-batch)-(\d+)\/(\d+)$/);
    if (!segmentMatch) {
      return false;
    }
    
    const totalSegments = parseInt(segmentMatch[3], 10);
    
    // Only apply delays for multi-segment operations in Select Element mode
    if (translateMode) {
      return totalSegments > 1 && translateMode === 'select_element';
    }
    
    // If mode is not provided, apply conservative approach: any multi-segment operation
    // This maintains backwards compatibility
    return totalSegments > 1;
  }
  
  /**
   * Wait for an available slot to make a request
   */
  async _waitForSlot(providerName, context = 'standard', translateMode = null) {
    return new Promise((resolve) => {
      const state = this._initializeProvider(providerName);
      
      if (this.canMakeRequest(providerName, context, translateMode)) {
        resolve();
        return;
      }
      
      // Add to queue
      state.requestQueue.push({
        resolve,
        timestamp: Date.now(),
        providerName,
        context,
        translateMode
      });
      
      // Start processing queue if not already processing
      if (!state.isProcessingQueue) {
        this._processQueue(providerName);
      }
    });
  }
  
  /**
   * Process the request queue for a provider
   */
  async _processQueue(providerName) {
    const state = this._initializeProvider(providerName);
    
    if (state.isProcessingQueue) {
      return; // Already processing
    }
    
    state.isProcessingQueue = true;
    
    try {
      while (state.requestQueue.length > 0) {
        const queueItem = state.requestQueue[0];
        
        if (this.canMakeRequest(providerName, queueItem.context, queueItem.translateMode)) {
          // Remove from queue and resolve
          state.requestQueue.shift();
          queueItem.resolve();
        } else {
          // Calculate wait time with adaptive backoff
          const now = Date.now();
          const timeSinceLastRequest = now - state.lastRequestTime;
          
          // Use appropriate delay based on request history
          const baseDelay = state.lastRequestTime > 0 
            ? (state.config.subsequentDelay || state.config.delayBetweenRequests)
            : (state.config.initialDelay || state.config.delayBetweenRequests);
          let adjustedDelay = baseDelay;
          if (state.config.adaptiveBackoff?.enabled && state.currentBackoffMultiplier > 1) {
            adjustedDelay = Math.min(
              baseDelay * state.currentBackoffMultiplier,
              state.config.adaptiveBackoff.maxDelay
            );
          }
          
          const waitTime = Math.max(0, adjustedDelay - timeSinceLastRequest);
          
          if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            // If no time wait needed, check again in next tick
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
      }
    } finally {
      state.isProcessingQueue = false;
    }
  }
  
  /**
   * Get current stats for a provider
   */
  getProviderStats(providerName) {
    const state = this.providerStates.get(providerName);
    if (!state) {
      return { initialized: false };
    }
    
    const now = Date.now();
    const recentRequests = state.requestHistory.filter(
      time => (now - time) < state.config.burstWindow
    );
    
    // Use appropriate delay for status reporting
    const baseDelay = state.lastRequestTime > 0 
      ? (state.config.subsequentDelay || state.config.delayBetweenRequests)
      : (state.config.initialDelay || state.config.delayBetweenRequests);
    let adjustedDelay = baseDelay;
    if (state.config.adaptiveBackoff?.enabled && state.currentBackoffMultiplier > 1) {
      adjustedDelay = Math.min(
        baseDelay * state.currentBackoffMultiplier,
        state.config.adaptiveBackoff.maxDelay
      );
    }
    
    return {
      initialized: true,
      activeRequests: state.activeRequests,
      queueLength: state.requestQueue.length,
      recentRequests: recentRequests.length,
      burstLimit: state.config.burstLimit,
      maxConcurrent: state.config.maxConcurrent,
      lastRequestTime: state.lastRequestTime,
      canMakeRequest: this.canMakeRequest(providerName, 'status'),
      // Circuit breaker stats
      consecutiveFailures: state.consecutiveFailures,
      isCircuitOpen: state.isCircuitOpen,
      circuitOpenTime: state.circuitOpenTime,
      timeUntilCircuitRecovery: state.isCircuitOpen 
        ? Math.max(0, state.circuitRecoveryTime - (now - state.circuitOpenTime))
        : 0,
      maxPendingRequests: state.maxPendingRequests,
      totalPendingRequests: state.activeRequests + state.requestQueue.length,
      // Adaptive backoff stats
      currentBackoffMultiplier: state.currentBackoffMultiplier,
      adjustedDelay: adjustedDelay,
      successfulRequestsCount: state.successfulRequestsCount,
      lastFailureTime: state.lastFailureTime,
      adaptiveBackoffEnabled: state.config.adaptiveBackoff?.enabled || false,
      // Health monitor stats
      healthStatus: requestHealthMonitor.getProviderHealth(providerName),
      recommendedAction: requestHealthMonitor.getRecommendedAction(providerName)
    };
  }
  
  /**
   * Get stats for all providers
   */
  getAllStats() {
    const stats = {};
    for (const [providerName] of this.providerStates) {
      stats[providerName] = this.getProviderStats(providerName);
    }
    return stats;
  }
  
  /**
   * Check if circuit breaker is open for a provider
   */
  _isCircuitOpen(state) {
    if (!state.isCircuitOpen) return false;
    
    // Check if recovery time has passed
    const now = Date.now();
    if (now - state.circuitOpenTime > state.circuitRecoveryTime) {
      logger.info(`Circuit breaker recovery time elapsed, closing circuit and resetting state`);
      state.isCircuitOpen = false;
      state.consecutiveFailures = 0;
      // Reset active requests counter to prevent stale state
      if (state.activeRequests > state.config.maxConcurrent) {
        logger.warn(`Resetting stale activeRequests during circuit recovery: ${state.activeRequests} -> 0`);
        state.activeRequests = 0;
      }
      return false;
    }
    
    return true;
  }
  
  /**
   * Record successful request - reset circuit breaker and adaptive backoff
   */
  _recordSuccess(state) {
    // Reset circuit breaker
    if (state.consecutiveFailures > 0 || state.isCircuitOpen) {
      logger.info(`Request succeeded, resetting circuit breaker (was ${state.consecutiveFailures} failures)`);
      state.consecutiveFailures = 0;
      state.isCircuitOpen = false;
      state.circuitOpenTime = 0;
    }
    
    // Handle adaptive backoff recovery
    if (state.config.adaptiveBackoff?.enabled) {
      state.successfulRequestsCount++;
      
      // Reset backoff multiplier after enough successful requests
      if (state.successfulRequestsCount >= state.config.adaptiveBackoff.resetAfterSuccess && 
          state.currentBackoffMultiplier > 1) {
        logger.info(`Resetting adaptive backoff after ${state.successfulRequestsCount} successful requests`);
        state.currentBackoffMultiplier = 1;
        state.successfulRequestsCount = 0;
      }
    }
  }
  
  /**
   * Record failed request - update circuit breaker and adaptive backoff
   */
  _recordFailure(state, error, providerName) {
    const now = Date.now();
    state.lastFailureTime = now;
    
    // Special handling for Gemini quota errors to open circuit breaker immediately
    const isGeminiQuotaError = providerName === 'Gemini' && error.message && (
      error.message.includes('quota') ||
      error.message.includes('RESOURCE_EXHAUSTED') ||
      error.message.includes('limit exceeded') ||
      error.message.includes('429')
    );

    if (isGeminiQuotaError) {
      state.consecutiveFailures = state.circuitBreakThreshold; // Trigger immediately
      state.isCircuitOpen = true;
      state.circuitOpenTime = now;
      state.circuitRecoveryTime = 60000; // 60 seconds for quota errors
      
      // Apply maximum adaptive backoff for quota errors
      if (state.config.adaptiveBackoff?.enabled) {
        state.currentBackoffMultiplier = state.config.adaptiveBackoff.baseMultiplier * 3;
        state.successfulRequestsCount = 0;
        logger.error(`Gemini quota exceeded - Applied maximum adaptive backoff (${state.currentBackoffMultiplier}x)`);
      }
      
      logger.error(`Gemini quota exceeded - Circuit breaker opened immediately for ${providerName}`);
      return; // Exit early
    }

    // Only count rate limit and network failures towards circuit breaker
    const isRateLimitError = error.message && (
      error.message.includes('429') || 
      error.message.includes('rate limit') || 
      error.message.includes('quota') ||
      error.message.includes('Too Many Requests')
    );
    
    if (isRateLimitError || error.name === 'NetworkError') {
      state.consecutiveFailures++;
      
      // Apply adaptive backoff
      if (state.config.adaptiveBackoff?.enabled) {
        const oldMultiplier = state.currentBackoffMultiplier;
        state.currentBackoffMultiplier = Math.min(
          state.currentBackoffMultiplier * state.config.adaptiveBackoff.baseMultiplier,
          state.config.adaptiveBackoff.maxDelay / (state.config.subsequentDelay || state.config.delayBetweenRequests)
        );
        state.successfulRequestsCount = 0; // Reset success counter
        
        if (oldMultiplier !== state.currentBackoffMultiplier) {
          logger.warn(`Applied adaptive backoff for ${providerName}: ${oldMultiplier}x → ${state.currentBackoffMultiplier}x`);
        }
      }
      
      logger.warn(`Request failed for ${providerName} (${state.consecutiveFailures}/${state.circuitBreakThreshold})`, error.message);
      
      if (state.consecutiveFailures >= state.circuitBreakThreshold) {
        state.isCircuitOpen = true;
        state.circuitOpenTime = now;
        logger.error(`Circuit breaker opened for ${providerName} after ${state.consecutiveFailures} consecutive failures`);
      }
    }
  }

  /**
   * Reset rate limiting for a provider (for testing)
   */
  resetProvider(providerName) {
    if (this.providerStates.has(providerName)) {
      const state = this.providerStates.get(providerName);
      state.activeRequests = 0;
      state.requestQueue = [];
      state.lastRequestTime = 0;
      state.requestHistory = [];
      state.isProcessingQueue = false;
      // Reset circuit breaker
      state.consecutiveFailures = 0;
      state.isCircuitOpen = false;
      state.circuitOpenTime = 0;
      // Reset adaptive backoff
      state.currentBackoffMultiplier = 1;
      state.successfulRequestsCount = 0;
      state.lastFailureTime = 0;
      logger.debug(`Reset rate limiting for provider: ${providerName}`);
    }
  }
  
  /**
   * Test for deterministic errors by attempting a lightweight validation
   * This prevents duplicate API calls while catching configuration errors
   * @private
   */
  async _testForDeterministicErrors(_requestFunction, _providerName, _context) { // eslint-disable-line no-unused-vars
    // Instead of executing the full request, we'll rely on ErrorClassifier
    // to identify deterministic errors during the actual execution
    // This prevents duplicate API calls
    
    // For now, we'll skip the test and let the actual request handle errors
    // The ErrorClassifier will still catch deterministic errors during real execution
    return null;
  }

  /**
   * Reset all providers (for testing)
   */
  resetAll() {
    for (const [providerName] of this.providerStates) {
      this.resetProvider(providerName);
    }
    logger.debug('Reset rate limiting for all providers');
  }

  /**
   * Force reload configurations for all providers (useful for config updates)
   */
  reloadConfigurations() {
    this.providerStates.clear();
    logger.debug('Cleared all provider states to force configuration reload');
  }
}

// Export singleton instance
export const rateLimitManager = RateLimitManager.getInstance();
