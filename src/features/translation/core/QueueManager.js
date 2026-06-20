/**
 * Queue Manager - Intelligent request queuing and retry mechanism
 * Handles failed requests with exponential backoff and smart retry strategies
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { isFatalError, isCancellationError } from "@/shared/error-management/ErrorMatcher.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'QueueManager');

/**
 * Queue item status types
 */
export const QueueStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',  
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRYING: 'retrying'
};

/**
 * Retry strategies based on error types
 */
const RETRY_STRATEGIES = {
  // Rate limiting errors - longer exponential backoff
  [ErrorTypes.RATE_LIMIT_REACHED]: {
    maxRetries: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    exponentialFactor: 2,
    jitter: true
  },
  
  [ErrorTypes.QUOTA_EXCEEDED]: {
    maxRetries: 3,
    baseDelay: 5000,
    maxDelay: 60000,
    exponentialFactor: 2,
    jitter: true
  },
  
  // Model overloaded - similar to rate limiting but slightly shorter window
  [ErrorTypes.MODEL_OVERLOADED]: {
    maxRetries: 4,
    baseDelay: 2000,
    maxDelay: 20000,
    exponentialFactor: 2,
    jitter: true
  },
  
  // Server errors (500, etc) - moderate retry
  [ErrorTypes.SERVER_ERROR]: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 15000,
    exponentialFactor: 2,
    jitter: true
  },
  
  // Network errors - shorter delays with more retries
  [ErrorTypes.NETWORK_ERROR]: {
    maxRetries: 4,
    baseDelay: 2000,
    maxDelay: 10000,
    exponentialFactor: 2,
    jitter: true
  },
  
  // HTTP errors - moderate retry
  [ErrorTypes.HTTP_ERROR]: {
    maxRetries: 3,
    baseDelay: 1500,
    maxDelay: 15000,
    exponentialFactor: 2,
    jitter: false
  },
  
  // Default strategy
  default: {
    maxRetries: 2,
    baseDelay: 1000,
    maxDelay: 8000,
    exponentialFactor: 1.5,
    jitter: true
  }
};

/**
 * Queue Item class
 */
class QueueItem {
  constructor(id, providerName, requestFunction, priority = 0, context = 'unknown', options = {}) {
    this.id = id;
    this.providerName = providerName;
    this.requestFunction = requestFunction;
    this.priority = priority; // Higher number = higher priority
    this.context = context; // Usually translateMode
    this.messageId = options.messageId || null;
    this.uiContext = options.uiContext || null; // popup, sidepanel, etc.
    this.status = QueueStatus.PENDING;
    this.createdAt = Date.now();
    this.attempts = 0;
    this.lastAttemptAt = null;
    this.firstError = null; // Store the first error that occurred
    this.lastError = null;
    this.result = null;
    this.callbacks = {
      resolve: null,
      reject: null
    };
  }
  
  /**
   * Get retry strategy for the current error
   */
  getRetryStrategy() {
    if (!this.lastError || !this.lastError.type) {
      return RETRY_STRATEGIES.default;
    }
    return RETRY_STRATEGIES[this.lastError.type] || RETRY_STRATEGIES.default;
  }
  
  /**
   * Check if item should be retried
   */
  shouldRetry() {
    // 1. If we have a fatal error (like invalid API key), do NOT retry
    if (this.lastError && isFatalError(this.lastError)) {
      // CIRCUIT_BREAKER_OPEN is considered fatal in ErrorMatcher.
      // In QueueManager, we should NOT retry if the circuit is already open.
      if (this.lastError.type === ErrorTypes.CIRCUIT_BREAKER_OPEN) {
        return false;
      }

      // Exceptions: These are marked as fatal in ErrorMatcher to stop standard flows,
      // but in QueueManager we WANT to retry them because they are often transient.
      const retryableFatalTypes = [
        ErrorTypes.RATE_LIMIT_REACHED,
        ErrorTypes.NETWORK_ERROR,
        ErrorTypes.HTTP_ERROR,
        ErrorTypes.SERVER_ERROR,
        ErrorTypes.QUOTA_EXCEEDED,
        ErrorTypes.API_ERROR
      ];

      if (!retryableFatalTypes.includes(this.lastError.type) && 
          this.lastError.statusCode !== 429) {
        return false;
      }
    }

    // 2. Check against strategy limits
    const strategy = this.getRetryStrategy();
    return this.attempts < strategy.maxRetries;
  }
  
  /**
   * Calculate next retry delay
   */
  getNextRetryDelay() {
    const strategy = this.getRetryStrategy();
    const exponentialDelay = strategy.baseDelay * Math.pow(strategy.exponentialFactor, this.attempts - 1);
    let delay = Math.min(exponentialDelay, strategy.maxDelay);
    
    if (strategy.jitter) {
      // Add jitter to prevent thundering herd
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.round(delay);
  }
}

/**
 * Queue Manager - Handles request queuing with intelligent retry
 */
export class QueueManager {
  constructor() {
    if (QueueManager.instance) {
      return QueueManager.instance;
    }
    
    this.queues = new Map(); // provider -> queue items
    this.processing = new Map(); // provider -> boolean
    this.itemCounter = 0;
    this.retryTimeouts = new Map(); // itemId -> timeout
    
    QueueManager.instance = this;
    logger.init('QueueManager singleton created');
  }
  
  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }
  
  /**
   * Initialize queue for provider if needed
   */
  _initializeQueue(providerName) {
    if (!this.queues.has(providerName)) {
      this.queues.set(providerName, []);
      this.processing.set(providerName, false);
      logger.debug(`Initialized queue for provider: ${providerName}`);
    }
  }

  _isParallelQueue(providerName) {
    return typeof providerName === 'string' && providerName.endsWith('::parallel');
  }
  
  /**
   * Add item to queue with automatic execution
   */
  async enqueue(providerName, requestFunction, priority = 0, context = 'unknown', options = {}) {
    return new Promise((resolve, reject) => {
      this._initializeQueue(providerName);
      
      const itemId = `${providerName}-${++this.itemCounter}-${Date.now()}`;
      const item = new QueueItem(itemId, providerName, requestFunction, priority, context, options);
      
      item.callbacks.resolve = resolve;
      item.callbacks.reject = reject;
      
      const queue = this.queues.get(providerName);
      queue.push(item);
      
      // Sort queue by priority (higher priority first)
      queue.sort((a, b) => b.priority - a.priority);
      
      logger.debug(`Enqueued item ${itemId} for ${providerName} (priority: ${priority}, queue size: ${queue.length}, messageId: ${item.messageId})`);
      
      // Start processing if not already processing
      if (!this.processing.get(providerName)) {
        this._processQueue(providerName);
      }
    });
  }

  /**
   * Process queue for a provider
   */
  async _processQueue(providerName) {
    this._initializeQueue(providerName);
    
    if (this.processing.get(providerName)) {
      return; // Already processing
    }
    
    this.processing.set(providerName, true);
    const queue = this.queues.get(providerName);
    const parallelQueue = this._isParallelQueue(providerName);
    
    try {
      if (parallelQueue) {
        let dispatchedCount = 0;
        while (queue.length > 0) {
          const item = queue.find(item => item.status === QueueStatus.PENDING);
          
          if (!item) {
            break;
          }
          
          dispatchedCount++;
          this._processItem(item);
        }

        logger.debug(`Dispatched ${dispatchedCount} items for parallel queue ${providerName}; inflight requests are tracked per item status`);
        return;
      }

      while (queue.length > 0) {
        const item = queue.find(item => 
          item.status === QueueStatus.PENDING
        );
        
        if (!item) {
          // No processable items, wait a bit and check again
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Re-check queue length as it might have been cleared during sleep
          if (!this.queues.has(providerName) || this.queues.get(providerName).length === 0) {
            break;
          }
          continue;
        }
        
        await this._processItem(item);
        
        // Remove completed or permanently failed items
        if (item.status === QueueStatus.COMPLETED || 
            (item.status === QueueStatus.FAILED && !item.shouldRetry())) {
          const index = queue.indexOf(item);
          if (index > -1) {
            queue.splice(index, 1);
          }
        }
      }
    } catch (error) {
      logger.error(`Critical error in _processQueue for ${providerName}:`, error);
    } finally {
      this.processing.set(providerName, false);
    }
    
    logger.debug(`Finished processing queue for ${providerName}`);
  }
  
  /**
   * Process a single queue item
   */
  async _processItem(item) {
    // Check for cancellation before processing
    if (item.status === QueueStatus.FAILED) {
      this._removeItemFromQueue(item);
      return; // Already cancelled/failed
    }

    item.status = QueueStatus.PROCESSING;
    item.attempts++;
    item.lastAttemptAt = Date.now();
    
    logger.debug(`Processing item ${item.id} (attempt ${item.attempts}/${item.getRetryStrategy().maxRetries})`);
    
    try {
      const result = await item.requestFunction();
      
      // Success
      item.status = QueueStatus.COMPLETED;
      item.result = result;
      
      if (item.callbacks.resolve) {
        item.callbacks.resolve(result);
      }
      
      logger.debug(`Item ${item.id} completed successfully`);
      
    } catch (error) {
      // Re-check status: it might have been changed to FAILED by an external cancellation during the request
      if (item.status === QueueStatus.FAILED) {
        logger.debug(`Item ${item.id} request failed but was already cancelled externally`);
        this._removeItemFromQueue(item);
        return;
      }

      item.lastError = error;
      if (!item.firstError) {
        item.firstError = error;
      }
      
      if (item.shouldRetry()) {
        // Schedule retry
        item.status = QueueStatus.RETRYING;
        const delay = item.getNextRetryDelay();
        
        logger.warn(`Item ${item.id} failed, retrying in ${delay}ms (attempt ${item.attempts}/${item.getRetryStrategy().maxRetries})`, error);
        
        this.retryTimeouts.set(item.id, setTimeout(() => {
          this.retryTimeouts.delete(item.id);
          
          // Final check before moving to PENDING: has it been cancelled during the timeout?
          if (item.status === QueueStatus.FAILED) {
            return;
          }

          item.status = QueueStatus.PENDING;
          
          // Continue processing queue
          if (!this.processing.get(item.providerName)) {
            this._processQueue(item.providerName);
          }
        }, delay));
        
      } else {
        // Permanent failure
        item.status = QueueStatus.FAILED;
        
        if (item.callbacks.reject) {
          // If we hit a circuit breaker during a retry, prefer showing the original error
          // that caused the problem in the first place.
          const errorToReport = (item.attempts > 1 && error.type === ErrorTypes.CIRCUIT_BREAKER_OPEN && item.firstError)
            ? item.firstError
            : error;
          
          item.callbacks.reject(errorToReport);
        }
        
        // FIX: Log cancellations as debug instead of error to prevent log noise
        if (isCancellationError(error)) {
          logger.debug(`Item ${item.id} cancelled by user`);
        } else {
          logger.debug(`Item ${item.id} failed permanently after ${item.attempts} attempts:`, error);
        }
      }
    }

    this._removeItemFromQueue(item);
  }

  _removeItemFromQueue(item) {
    const queue = this.queues.get(item.providerName);
    if (!queue) return;

    const index = queue.indexOf(item);
    if (index > -1 && (item.status === QueueStatus.COMPLETED || item.status === QueueStatus.FAILED)) {
      queue.splice(index, 1);
    }
  }
  
  /**
   * Get queue status for a provider
   */
  getQueueStatus(providerName) {
    this._initializeQueue(providerName);
    const queue = this.queues.get(providerName);
    
    const statusCounts = {
      pending: 0,
      processing: 0,
      retrying: 0,
      completed: 0,
      failed: 0
    };
    
    queue.forEach(item => {
      statusCounts[item.status]++;
    });
    
    return {
      total: queue.length,
      isProcessing: this.processing.get(providerName),
      status: statusCounts,
      items: queue.map(item => ({
        id: item.id,
        context: item.context,
        status: item.status,
        attempts: item.attempts,
        priority: item.priority,
        createdAt: item.createdAt,
        lastAttemptAt: item.lastAttemptAt,
        error: item.lastError?.message
      }))
    };
  }
  
  /**
   * Get status for all queues
   */
  getAllQueueStatus() {
    const status = {};
    for (const [providerName] of this.queues) {
      status[providerName] = this.getQueueStatus(providerName);
    }
    return status;
  }
  
  /**
   * Cancel all pending items for a provider
   */
  cancelProvider(providerName) {
    this._initializeQueue(providerName);
    const queue = this.queues.get(providerName);
    let cancelledCount = 0;
    
    for (const item of [...queue]) {
      if (item.status === QueueStatus.PENDING || item.status === QueueStatus.RETRYING || item.status === QueueStatus.PROCESSING) {
        this._cancelItemInternal(item);
        cancelledCount++;
      }
    }
    
    logger.debug(`Cancelled ${cancelledCount} items for provider ${providerName}`);
    return cancelledCount;
  }
  
  /**
   * Cancel specific item
   */
  cancelItem(itemId) {
    for (const [, queue] of this.queues) {
      const item = queue.find(item => item.id === itemId);
      if (item && (item.status === QueueStatus.PENDING || item.status === QueueStatus.RETRYING || item.status === QueueStatus.PROCESSING)) {
        this._cancelItemInternal(item);
        logger.debug(`Cancelled item ${itemId}`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Cancel items by messageId
   */
  cancelByMessageId(messageId) {
    if (!messageId) return 0;
    let cancelledCount = 0;

    for (const [, queue] of this.queues) {
      for (const item of [...queue]) {
        if (item.messageId === messageId && (item.status === QueueStatus.PENDING || item.status === QueueStatus.RETRYING || item.status === QueueStatus.PROCESSING)) {
          this._cancelItemInternal(item);
          cancelledCount++;
        }
      }
    }

    if (cancelledCount > 0) {
      logger.debug(`Cancelled ${cancelledCount} items for messageId: ${messageId}`);
    }
    return cancelledCount;
  }

  /**
   * Cancel items by UI context (popup, sidepanel, etc.)
   */
  cancelByUiContext(uiContext) {
    if (!uiContext) return 0;
    logger.debug(`[QueueManager] cancelByUiContext called for: ${uiContext}`);
    let cancelledCount = 0;

    for (const [providerName, queue] of this.queues) {
      for (const item of [...queue]) {
        if (item.uiContext === uiContext && (item.status === QueueStatus.PENDING || item.status === QueueStatus.RETRYING || item.status === QueueStatus.PROCESSING)) {
          logger.debug(`[QueueManager] Found item to cancel in queue for ${providerName}: ${item.id}`);
          this._cancelItemInternal(item);
          cancelledCount++;
        }
      }
    }

    if (cancelledCount > 0) {
      logger.info(`[QueueManager] Cancelled ${cancelledCount} items for UI context: ${uiContext}`);
    }
    return cancelledCount;
  }

  /**
   * Internal helper to cancel an item
   * @private
   */
  _cancelItemInternal(item) {
    logger.debug(`[QueueManager] Explicitly cancelling item ${item.id} (messageId: ${item.messageId}, context: ${item.uiContext})`);
    item.status = QueueStatus.FAILED;
    
    if (item.callbacks.reject) {
      const cancelError = new Error('Request cancelled');
      cancelError.type = ErrorTypes.USER_CANCELLED;
      cancelError.isCancelled = true;
      item.callbacks.reject(cancelError);
    }
    
    // Cancel retry timeout if exists
    if (this.retryTimeouts.has(item.id)) {
      logger.debug(`[QueueManager] Clearing retry timeout for item ${item.id}`);
      clearTimeout(this.retryTimeouts.get(item.id));
      this.retryTimeouts.delete(item.id);
    }

    this._removeItemFromQueue(item);
  }
  
  /**
   * Clear completed and failed items from queues
   */
  cleanup() {
    let cleanedCount = 0;
    
    for (const [providerName, queue] of this.queues) {
      const originalLength = queue.length;
      
      // Remove completed and permanently failed items
      this.queues.set(providerName, queue.filter(item => 
        item.status === QueueStatus.PENDING || 
        item.status === QueueStatus.PROCESSING ||
        item.status === QueueStatus.RETRYING
      ));
      
      cleanedCount += originalLength - this.queues.get(providerName).length;
    }
    
    logger.debug(`Cleaned up ${cleanedCount} completed/failed queue items`);
    return cleanedCount;
  }
  
  /**
   * Clear all queues (for testing)
   */
  clearAll() {
    // Cancel all retry timeouts
    for (const [, timeout] of this.retryTimeouts) {
      clearTimeout(timeout);
    }
    
    this.queues.clear();
    this.processing.clear();
    this.retryTimeouts.clear();
    this.itemCounter = 0;
    
    logger.debug('Cleared all queues');
  }
}

// Export singleton instance
export const queueManager = QueueManager.getInstance();
