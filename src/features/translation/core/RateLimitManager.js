/**
 * Rate Limit Manager - Intelligent request throttling with priority-based scheduling
 * Combines advanced stability (Circuit Breaker, Adaptive Backoff) with 
 * priority-based queuing (HIGH, NORMAL, LOW).
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { registryIdToName } from '@/features/translation/providers/ProviderConstants.js';
import { isFatalError } from '@/shared/error-management/ErrorMatcher.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'RateLimitManager');

/**
 * Priority levels for translation requests
 */
export const TranslationPriority = {
  HIGH: 10,   // Interactive UI (Popup, Sidepanel, Selection)
  NORMAL: 5,  // Default/Standard requests
  LOW: 1,     // Background tasks (Whole Page Translation)
};

export class RateLimitManager {
  constructor() {
    if (RateLimitManager.instance) {
      return RateLimitManager.instance;
    }
    
    this.providerStates = new Map();
    RateLimitManager.instance = this;
    
    // Initialize default configs
    this.reloadConfigurations();
    logger.debug('RateLimitManager initialized with priority support');
  }
  
  static getInstance() {
    if (!RateLimitManager.instance) {
      RateLimitManager.instance = new RateLimitManager();
    }
    return RateLimitManager.instance;
  }

  /**
   * Reset or load configurations from ProviderConfigurations
   */
  async reloadConfigurations() {
    this.providerStates.clear();
    const { PROVIDER_CONFIGURATIONS, getProviderConfiguration } = await import('@/features/translation/core/ProviderConfigurations.js');
    const { getProviderOptimizationLevelAsync } = await import('@/shared/config/config.js');
    
    for (const name of Object.keys(PROVIDER_CONFIGURATIONS)) {
      const level = await getProviderOptimizationLevelAsync(name);
      const optimizedConfig = getProviderConfiguration(name, level);
      this._initializeProvider(name, optimizedConfig.rateLimit);
    }
  }

  /**
   * Initialize or get provider state
   * Optimized to fetch configuration dynamically if not present
   */
  async _initializeProviderWithLevel(providerName) {
    if (this.providerStates.has(providerName)) {
      return this.providerStates.get(providerName);
    }

    const { getProviderConfiguration } = await import('@/features/translation/core/ProviderConfigurations.js');
    const { getProviderOptimizationLevelAsync } = await import('@/shared/config/config.js');

    const level = await getProviderOptimizationLevelAsync(providerName);
    const optimizedConfig = getProviderConfiguration(providerName, level);
    
    return this._initializeProvider(providerName, optimizedConfig.rateLimit);
  }

  /**
   * Initialize or get provider state
   */
  _initializeProvider(providerName, config = {}) {
    if (this.providerStates.has(providerName)) {
      return this.providerStates.get(providerName);
    }
    
    // Default safe configuration if none provided
    const safeDefault = { maxConcurrent: 2, delayBetweenRequests: 200 };
    
    const state = {
      config: { ...safeDefault, ...config },
      activeRequests: 0,
      lastRequestTime: 0,
      queues: {
        [TranslationPriority.HIGH]: [],
        [TranslationPriority.NORMAL]: [],
        [TranslationPriority.LOW]: []
      },
      isProcessingQueue: false,
      // Circuit breaker
      consecutiveFailures: 0,
      isCircuitOpen: false,
      circuitOpenTime: 0,
      circuitBreakThreshold: 5,
      circuitRecoveryTime: 30000,
      // Adaptive backoff
      currentBackoffMultiplier: 1,
      // Performance monitoring (Crucial for AI providers)
      performanceStats: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalWaitTime: 0,
        totalProcessingTime: 0,
        averageWaitTime: 0,
        averageRequestTime: 0,
        requestsPerMinute: 0,
        successRate: 100,
        lastPerformanceReset: Date.now()
      }
    };
    
    this.providerStates.set(providerName, state);
    return state;
  }

  /**
   * Execute task with rate limiting and priority
   */
  async executeWithRateLimit(providerName, task, context = "", priority = TranslationPriority.NORMAL, options = {}) {
    // Resolve registry ID to name if necessary
    const name = registryIdToName(providerName) || providerName;

    // Refresh state and configuration to ensure we're using the latest optimization level
    const state = await this._initializeProviderWithLevel(name);
    
    // CRITICAL: Always re-fetch level to handle real-time setting changes between levels (e.g. 5 to 1)
    const { getProviderConfiguration } = await import('@/features/translation/core/ProviderConfigurations.js');
    const { getProviderOptimizationLevelAsync } = await import('@/shared/config/config.js');
    const currentLevel = await getProviderOptimizationLevelAsync(name);
    
    // Update config if it's different from what's in state (or always for safety during debug)
    const latestConfig = getProviderConfiguration(name, currentLevel);
    state.config = { ...state.config, ...latestConfig.rateLimit };

    // Check circuit breaker
    if (this._isCircuitOpen(state)) {
      const error = new Error(`Circuit breaker open for ${name}. Too many failures.`);
      error.type = 'CIRCUIT_BREAKER_OPEN';
      throw error;
    }

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const abortSignal = options.abortController?.signal;

      // Ensure priority is valid
      const targetPriority = [TranslationPriority.HIGH, TranslationPriority.NORMAL, TranslationPriority.LOW].includes(priority)
        ? priority : TranslationPriority.NORMAL;

      const request = { 
        task, 
        resolve, 
        reject, 
        context, 
        priority: targetPriority, 
        options, // Store metadata for stats
        enqueuedAt: startTime 
      };

      // Handle early cancellation while in queue
      if (abortSignal) {
        const onAbort = () => {
          // Find and remove from queue if still there
          const queue = state.queues[targetPriority];
          const index = queue.indexOf(request);
          if (index !== -1) {
            queue.splice(index, 1);
            const abortError = new Error('Request aborted while in queue');
            abortError.name = 'AbortError';
            abortError.isCancelled = true;
            reject(abortError);
          }
        };
        abortSignal.addEventListener('abort', onAbort, { once: true });
        
        // If already aborted
        if (abortSignal.aborted) {
          const abortError = new Error('Request aborted before enqueuing');
          abortError.name = 'AbortError';
          abortError.isCancelled = true;
          reject(abortError);
          return;
        }
      }
      
      state.queues[targetPriority].push(request);
      this._processQueue(name);
    });
  }

  /**
   * Main queue processing logic - respects priorities (HIGH > NORMAL > LOW)
   */
  async _processQueue(providerName) {
    const state = this.providerStates.get(providerName);
    if (!state || state.isProcessingQueue) return;

    // Stop processing if circuit is open
    if (this._isCircuitOpen(state)) {
      this._rejectQueue(state, new Error(`Circuit breaker open for ${providerName}`));
      return;
    }

    state.isProcessingQueue = true;

    try {
      while (this._hasPendingRequests(state)) {
        // Re-check circuit breaker inside loop
        if (this._isCircuitOpen(state)) {
          this._rejectQueue(state, new Error(`Circuit breaker open for ${providerName}`));
          break;
        }

        // Check concurrency
        if (state.activeRequests >= state.config.maxConcurrent) break;

        // Check delay between requests
        const now = Date.now();
        const baseDelay = state.config.delayBetweenRequests || 100;
        const adjustedDelay = baseDelay * state.currentBackoffMultiplier;
        const timeSinceLast = now - state.lastRequestTime;

        if (timeSinceLast < adjustedDelay) {
          const waitTime = Math.max(0, adjustedDelay - timeSinceLast);
          await new Promise(r => setTimeout(r, waitTime));
          continue; // Re-check conditions after wait
        }

        // Get next request by priority
        const nextRequest = this._getNextRequest(state);
        if (!nextRequest) break;

        // Update stats and execute
        state.activeRequests++;
        state.lastRequestTime = Date.now();
        
        // Track wait time
        const waitTime = Date.now() - nextRequest.enqueuedAt;
        state.performanceStats.totalWaitTime += waitTime;
        state.performanceStats.totalRequests++;

        this._executeRequest(state, nextRequest, providerName, nextRequest.options);
      }
    } finally {
      state.isProcessingQueue = false;
    }
  }

  _hasPendingRequests(state) {
    return state.queues[TranslationPriority.HIGH].length > 0 ||
           state.queues[TranslationPriority.NORMAL].length > 0 ||
           state.queues[TranslationPriority.LOW].length > 0;
  }

  _getNextRequest(state) {
    if (state.queues[TranslationPriority.HIGH].length > 0) return state.queues[TranslationPriority.HIGH].shift();
    if (state.queues[TranslationPriority.NORMAL].length > 0) return state.queues[TranslationPriority.NORMAL].shift();
    if (state.queues[TranslationPriority.LOW].length > 0) return state.queues[TranslationPriority.LOW].shift();
    return null;
  }

  _rejectQueue(state, error) {
    const isCircuitBreaker = error.message?.includes('Circuit breaker open');
    
    [TranslationPriority.HIGH, TranslationPriority.NORMAL, TranslationPriority.LOW].forEach(p => {
      while (state.queues[p].length > 0) {
        const req = state.queues[p].shift();
        
        // If it's a circuit breaker reject, we want it to be fatal enough to stop but 
        // also recognizable as a cancellation if the user/handler decides so.
        // For now, let's keep the error as provided but add Abort properties if it's a clear stop.
        if (isCircuitBreaker) {
          error.name = 'AbortError';
          error.isCancelled = true;
        }
        
        req.reject(error);
      }
    });
  }

  async _executeRequest(state, request, providerName, options = {}) {
    const requestStartTime = Date.now();
    
    // Check if aborted before starting
    if (request.options?.abortController?.signal?.aborted) {
      const abortError = new Error('Request aborted before execution');
      abortError.name = 'AbortError';
      abortError.isCancelled = true;
      request.reject(abortError);
      return;
    }

    try {
      const result = await request.task(options);
      const duration = Date.now() - requestStartTime;
      
      // Success record
      state.performanceStats.successfulRequests++;
      state.performanceStats.totalProcessingTime += duration;
      this._recordSuccess(state);
      
      request.resolve(result);
    } catch (error) {
      // Don't count cancellations as failures
      const isCancellation = error.name === 'AbortError' || 
                           error.isCancelled || 
                           error.message?.includes('cancelled') ||
                           error.message?.includes('aborted');
      
      if (!isCancellation) {
        this._recordFailure(state, error, providerName);
      }
      
      request.reject(error);
    } finally {
      state.activeRequests--;
      this._updateDerivedStats(state);
      
      // Process next in queue
      setTimeout(() => this._processQueue(providerName), 10);
    }
  }

  /**
   * Update calculated metrics for AI providers
   */
  _updateDerivedStats(state) {
    const stats = state.performanceStats;
    const totalProcessed = stats.successfulRequests + stats.failedRequests;
    
    if (totalProcessed > 0) {
      stats.successRate = (stats.successfulRequests / totalProcessed) * 100;
      stats.averageWaitTime = stats.totalWaitTime / stats.totalRequests;
    }
    
    if (stats.successfulRequests > 0) {
      stats.averageRequestTime = stats.totalProcessingTime / stats.successfulRequests;
    }

    const timeSinceReset = (Date.now() - stats.lastPerformanceReset) / 60000; // in minutes
    if (timeSinceReset > 0) {
      stats.requestsPerMinute = stats.totalRequests / timeSinceReset;
    }
  }

  _isCircuitOpen(state) {
    if (!state.isCircuitOpen) return false;
    const now = Date.now();
    if (now - state.circuitOpenTime > state.circuitRecoveryTime) {
      state.isCircuitOpen = false;
      state.consecutiveFailures = 0;
      return false;
    }
    return true;
  }

  _recordSuccess(state) {
    state.consecutiveFailures = 0;
    state.isCircuitOpen = false;
    state.currentBackoffMultiplier = 1;
  }

  _recordFailure(state, error, providerName) {
    state.performanceStats.failedRequests++;
    state.consecutiveFailures++;
    
    // Adaptive Backoff: Increase delay on 429 or quota errors
    const isRateLimit = error.message?.includes('429') || error.message?.includes('quota');
    if (isRateLimit) {
      state.currentBackoffMultiplier = Math.min(state.currentBackoffMultiplier * 2, 10);
      logger.warn(`Rate limit detected for ${providerName}, increasing backoff to ${state.currentBackoffMultiplier}x`);
    }

    // CRITICAL: Open circuit breaker immediately on fatal errors
    const isFatal = isFatalError(error);

    if (isFatal || state.consecutiveFailures >= state.circuitBreakThreshold) {
      if (!state.isCircuitOpen) {
        state.isCircuitOpen = true;
        state.circuitOpenTime = Date.now();
        logger.error(`Circuit breaker OPENED for ${providerName} ${isFatal ? '(FATAL ERROR) ' : ''}after ${state.consecutiveFailures} failures. Error: ${error.message || error}`);
      }
    }
  }

  /**
   * API for AI Providers to monitor performance
   */
  getPerformanceStats(providerName) {
    const state = this.providerStates.get(providerName);
    if (!state) {
      return { 
        averageWaitTime: 0, averageRequestTime: 0, requestsPerMinute: 0, 
        successRate: 0, totalPending: 0, active: 0 
      };
    }
    
    this._updateDerivedStats(state);
    
    const q = state.queues;
    const totalPending = q[TranslationPriority.HIGH].length + 
                         q[TranslationPriority.NORMAL].length + 
                         q[TranslationPriority.LOW].length;
                         
    return {
      ...state.performanceStats,
      active: state.activeRequests,
      totalPending
    };
  }

  clearQueue(providerName) {
    const state = this.providerStates.get(providerName);
    if (state) {
      [TranslationPriority.HIGH, TranslationPriority.NORMAL, TranslationPriority.LOW].forEach(p => {
        state.queues[p].forEach(req => req.reject(new Error("Queue cleared")));
        state.queues[p] = [];
      });
      state.activeRequests = 0;
    }
  }

  /**
   * Clear pending requests for a specific messageId across all providers
   * @param {string} messageId - Optional message ID to filter by
   */
  clearPendingRequests(messageId = null) {
    logger.debug(`Clearing pending requests${messageId ? ` for messageId: ${messageId}` : ''}`);
    
    for (const state of this.providerStates.values()) {
      [TranslationPriority.HIGH, TranslationPriority.NORMAL, TranslationPriority.LOW].forEach(p => {
        const queue = state.queues[p];
        const remaining = [];
        
        for (const request of queue) {
          const reqMessageId = request.options?.messageId || request.options?.abortController?.messageId;
          
          if (!messageId || reqMessageId === messageId) {
            const error = new Error(messageId ? 'Request cancelled' : 'All requests cleared');
            error.name = 'AbortError';
            error.isCancelled = true;
            request.reject(error);
          } else {
            remaining.push(request);
          }
        }
        
        state.queues[p] = remaining;
      });
    }
  }
}

export const rateLimitManager = RateLimitManager.getInstance();
