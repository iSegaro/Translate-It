/**
 * Translation Result Dispatcher - Specialized service for result delivery
 *
 * This service is responsible for delivering translation results to the appropriate
 * destinations with intelligent routing and duplicate prevention.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { TranslationMode } from '@/shared/config/config.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TranslationResultDispatcher');

/**
 * Result Delivery Strategy
 */
const DeliveryStrategy = {
  DIRECT: 'direct',        // Return directly to caller
  TAB_SPECIFIC: 'tab',     // Send to specific tab
  BROADCAST: 'broadcast',  // Send to all tabs
  QUEUED: 'queued'        // Queue for later delivery
};

/**
 * Result Priority Levels
 */
const ResultPriority = {
  HIGH: 'high',           // Immediate delivery (field mode, streaming)
  NORMAL: 'normal',       // Standard delivery
  LOW: 'low'             // Can be batched/delayed
};

/**
 * Translation Result Dispatcher
 */
export class TranslationResultDispatcher {
  constructor() {
    // Tracking
    this.processedResults = new Map(); // messageId -> processing timestamp
    this.deliveryAttempts = new Map(); // messageId -> attempt count
    this.resultQueue = new Map(); // messageId -> queued result

    // Configuration
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    this.queueProcessingInterval = null;

    // Statistics
    this.stats = {
      totalDelivered: 0,
      totalFailed: 0,
      totalBroadcasts: 0,
      totalQueued: 0
    };

    // Start queue processing
    this.startQueueProcessing();

    logger.info('TranslationResultDispatcher initialized');
  }

  /**
   * Main entry point for result dispatch
   */
  async dispatchResult({ messageId, result, request, options = {} }) {
    logger.debug(`[ResultDispatcher] Dispatching result for: ${messageId}`);

    try {
      // Check if already processed
      if (this.isResultProcessed(messageId)) {
        logger.debug(`[ResultDispatcher] Result already processed: ${messageId}`);
        return { success: true, skipped: true };
      }

      // Determine delivery strategy
      const strategy = this.determineDeliveryStrategy(result, request);
      const priority = this.determinePriority(result, request);

      // Mark as being processed
      this.markResultProcessing(messageId);

      // Route based on strategy
      switch (strategy) {
        case DeliveryStrategy.DIRECT:
          return await this.handleDirectDelivery({ messageId, result, request });

        case DeliveryStrategy.TAB_SPECIFIC:
          return await this.handleTabDelivery({ messageId, result, request });

        case DeliveryStrategy.BROADCAST:
          return await this.handleBroadcastDelivery({ messageId, result, request });

        case DeliveryStrategy.QUEUED:
          return await this.handleQueuedDelivery({ messageId, result, request, priority });

        default:
          throw new Error(`Unknown delivery strategy: ${strategy}`);
      }

    } catch (error) {
      logger.error(`[ResultDispatcher] Dispatch failed for ${messageId}:`, error);

      // Update statistics
      this.stats.totalFailed++;

      // Retry if applicable
      if (this.shouldRetry(messageId)) {
        return await this.retryDelivery({ messageId, result, request, error });
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Handle streaming translation updates
   */
  async dispatchStreamingUpdate({ messageId, data, request }) {
    logger.debug(`[ResultDispatcher] Streaming update for: ${messageId}`);

    // Streaming updates always use broadcast for select-element mode
    if (request?.mode === 'select-element') {
      await this.broadcastToTabs({
        action: MessageActions.TRANSLATION_RESULT_UPDATE,
        messageId,
        data: {
          streaming: true,
          ...data,
          context: 'streaming-update'
        }
      });
    } else if (request?.mode === TranslationMode.Field) {
      // Field mode streaming goes to specific tab
      await this.sendToSpecificTab({
        tabId: request.sender.tab.id,
        action: MessageActions.TRANSLATION_RESULT_UPDATE,
        messageId,
        data: {
          streaming: true,
          ...data,
          context: 'field-streaming'
        }
      });
    }
  }

  /**
   * Handle cancellation notifications
   */
  async dispatchCancellation({ messageId, request }) {
    logger.debug(`[ResultDispatcher] Cancellation for: ${messageId}`);

    if (request?.sender?.tab?.id) {
      try {
        await browser.tabs.sendMessage(request.sender.tab.id, {
          action: MessageActions.TRANSLATION_CANCELLED,
          messageId
        });

        // Mark as processed
        this.markResultCompleted(messageId);
      } catch (error) {
        logger.warn(`[ResultDispatcher] Failed to send cancellation:`, error);
      }
    }
  }

  /**
   * Determine the best delivery strategy
   */
  determineDeliveryStrategy(result, request) {
    const { mode, sender } = request || {};

    // Field mode always goes to specific tab
    if (mode === TranslationMode.Field) {
      return DeliveryStrategy.TAB_SPECIFIC;
    }

    // Streaming results for select-element get broadcast
    if (mode === 'select-element' && result?.streaming) {
      return DeliveryStrategy.BROADCAST;
    }

    // Large results get broadcast
    if (result?.translatedText && result.translatedText.length > 2000) {
      return DeliveryStrategy.BROADCAST;
    }

    // Standard mode with direct response capability
    if (sender && sender.tab) {
      return DeliveryStrategy.TAB_SPECIFIC;
    }

    // Fallback to queue
    return DeliveryStrategy.QUEUED;
  }

  /**
   * Determine result priority
   */
  determinePriority(result, request) {
    // Field mode and streaming are high priority
    if (request?.mode === TranslationMode.Field || result?.streaming) {
      return ResultPriority.HIGH;
    }

    // Large translations are normal priority
    if (result?.translatedText && result.translatedText.length > 1000) {
      return ResultPriority.NORMAL;
    }

    // Everything else is low priority
    return ResultPriority.LOW;
  }

  /**
   * Handle direct delivery (return result)
   */
  async handleDirectDelivery({ messageId, result }) {
    logger.debug(`[ResultDispatcher] Direct delivery: ${messageId}`);

    // For direct delivery, we just mark as processed
    // The result will be returned by the original handler
    this.markResultCompleted(messageId);

    this.stats.totalDelivered++;
    return { success: true, strategy: DeliveryStrategy.DIRECT };
  }

  /**
   * Handle tab-specific delivery
   */
  async handleTabDelivery({ messageId, result, request }) {
    const { sender } = request || {};

    if (!sender?.tab?.id) {
      logger.warn(`[ResultDispatcher] No tab ID for tab delivery: ${messageId}`);
      return this.handleQueuedDelivery({ messageId, result, request });
    }

    logger.debug(`[ResultDispatcher] Tab delivery to ${sender.tab.id}: ${messageId}`);

    try {
      const response = await browser.tabs.sendMessage(sender.tab.id, {
        action: MessageActions.TRANSLATION_RESULT_UPDATE,
        messageId,
        data: {
          ...result,
          context: 'tab-specific',
          isDirectResponse: true,
          deliveryStrategy: DeliveryStrategy.TAB_SPECIFIC
        }
      });

      if (response?.handled) {
        this.markResultCompleted(messageId);
        this.stats.totalDelivered++;
        return { success: true, strategy: DeliveryStrategy.TAB_SPECIFIC };
      } else {
        throw new Error('Tab did not handle the result');
      }

    } catch (error) {
      logger.warn(`[ResultDispatcher] Tab delivery failed: ${messageId}`, error);

      // Queue for retry
      return this.handleQueuedDelivery({ messageId, result, request });
    }
  }

  /**
   * Handle broadcast delivery
   */
  async handleBroadcastDelivery({ messageId, result, request }) {
    logger.debug(`[ResultDispatcher] Broadcast delivery: ${messageId}`);

    const success = await this.broadcastToTabs({
      action: MessageActions.TRANSLATION_RESULT_UPDATE,
      messageId,
      data: {
        ...result,
        context: 'broadcast',
        isBroadcast: true,
        deliveryStrategy: DeliveryStrategy.BROADCAST
      }
    });

    if (success) {
      this.markResultCompleted(messageId);
      this.stats.totalDelivered++;
      this.stats.totalBroadcasts++;
      return { success: true, strategy: DeliveryStrategy.BROADCAST };
    } else {
      // Queue for retry if no tabs received it
      return this.handleQueuedDelivery({ messageId, result, request });
    }
  }

  /**
   * Handle queued delivery
   */
  async handleQueuedDelivery({ messageId, result, request, priority = ResultPriority.NORMAL }) {
    logger.debug(`[ResultDispatcher] Queued delivery: ${messageId}`);

    // Add to queue
    this.resultQueue.set(messageId, {
      result,
      request,
      priority,
      timestamp: Date.now(),
      attempts: 0
    });

    this.stats.totalQueued++;

    return { success: true, strategy: DeliveryStrategy.QUEUED, queued: true };
  }

  /**
   * Broadcast to all tabs
   */
  async broadcastToTabs(message) {
    const tabs = await browser.tabs.query({});
    let delivered = false;

    for (const tab of tabs) {
      try {
        await browser.tabs.sendMessage(tab.id, message);
        delivered = true;
      } catch (error) {
        // Tab might not have content script, ignore
      }
    }

    return delivered;
  }

  /**
   * Send to specific tab
   */
  async sendToSpecificTab({ tabId, ...message }) {
    try {
      const response = await browser.tabs.sendMessage(tabId, message);
      return response?.handled || false;
    } catch (error) {
      logger.warn(`[ResultDispatcher] Failed to send to tab ${tabId}:`, error);
      return false;
    }
  }

  /**
   * Retry failed delivery
   */
  async retryDelivery({ messageId, result, request, error }) {
    const attempts = this.deliveryAttempts.get(messageId) || 0;

    if (attempts >= this.maxRetries) {
      logger.error(`[ResultDispatcher] Max retries exceeded for ${messageId}`);
      this.markResultCompleted(messageId);
      return { success: false, error: 'Max retries exceeded' };
    }

    // Increment attempt counter
    this.deliveryAttempts.set(messageId, attempts + 1);

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, this.retryDelay * (attempts + 1)));

    // Retry with original strategy
    logger.info(`[ResultDispatcher] Retrying delivery for ${messageId} (attempt ${attempts + 1})`);
    return this.dispatchResult({ messageId, result, request });
  }

  /**
   * Check if result should be retried
   */
  shouldRetry(messageId) {
    const attempts = this.deliveryAttempts.get(messageId) || 0;
    return attempts < this.maxRetries;
  }

  /**
   * Check if result is already processed
   */
  isResultProcessed(messageId) {
    return this.processedResults.has(messageId);
  }

  /**
   * Mark result as being processed
   */
  markResultProcessing(messageId) {
    this.processedResults.set(messageId, Date.now());
  }

  /**
   * Mark result as completed
   */
  markResultCompleted(messageId) {
    this.processedResults.set(messageId, Date.now());
    this.deliveryAttempts.delete(messageId);
    this.resultQueue.delete(messageId);
  }

  /**
   * Start processing the delivery queue
   */
  startQueueProcessing() {
    this.queueProcessingInterval = setInterval(() => {
      this.processQueue();
    }, 2000); // Process every 2 seconds
  }

  /**
   * Process queued results
   */
  async processQueue() {
    const now = Date.now();
    const maxAge = 30000; // 30 seconds max in queue

    for (const [messageId, item] of this.resultQueue.entries()) {
      // Skip if already processed
      if (this.isResultProcessed(messageId)) {
        this.resultQueue.delete(messageId);
        continue;
      }

      // Check if too old
      if (now - item.timestamp > maxAge) {
        logger.warn(`[ResultDispatcher] Queued result expired: ${messageId}`);
        this.resultQueue.delete(messageId);
        this.stats.totalFailed++;
        continue;
      }

      // Try to deliver
      try {
        await this.dispatchResult({
          messageId,
          result: item.result,
          request: item.request
        });

        // Remove from queue if successful
        if (this.isResultProcessed(messageId)) {
          this.resultQueue.delete(messageId);
        }
      } catch (error) {
        logger.error(`[ResultDispatcher] Queue processing failed for ${messageId}:`, error);
      }
    }
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      queueSize: this.resultQueue.size,
      processedCount: this.processedResults.size
    };
  }

  /**
   * Clean up old processed results
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    let cleaned = 0;
    for (const [messageId, timestamp] of this.processedResults.entries()) {
      if (now - timestamp > maxAge) {
        this.processedResults.delete(messageId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[ResultDispatcher] Cleaned up ${cleaned} old results`);
    }
  }

  /**
   * Stop processing
   */
  stop() {
    if (this.queueProcessingInterval) {
      clearInterval(this.queueProcessingInterval);
      this.queueProcessingInterval = null;
    }
  }
}

// Export singleton instance
export const translationResultDispatcher = new TranslationResultDispatcher();