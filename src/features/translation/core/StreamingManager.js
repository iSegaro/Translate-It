/**
 * Streaming Manager - Coordinates streaming translation across all providers
 * Manages streaming lifecycle, sender tracking, and real-time result delivery
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import browser from 'webextension-polyfill';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'StreamingManager');

export class StreamingManager {
  constructor() {
    // Track active streaming sessions
    this.activeStreams = new Map(); // messageId -> streamInfo
    this.senderInfo = new Map(); // messageId -> sender details
    this.streamingResults = new Map(); // messageId -> accumulated results
    
    // Statistics
    this.stats = {
      totalSessions: 0,
      activeSessions: 0,
      completedSessions: 0,
      errorSessions: 0
    };
  }

  /**
   * Initialize streaming session
   * @param {string} messageId - Message ID
   * @param {object} sender - Sender information from message
   * @param {object} provider - Translation provider instance
   * @param {string[]} segments - Text segments to translate
   * @returns {object} - Stream session info
   */
  initializeStream(messageId, sender, provider, segments) {
    if (this.activeStreams.has(messageId)) {
      logger.warn(`[StreamingManager] Stream already exists for messageId: ${messageId}`);
      return this.activeStreams.get(messageId);
    }

    const streamInfo = {
      messageId,
      providerName: provider.providerName,
      totalSegments: segments.length,
      processedSegments: 0,
      startTime: Date.now(),
      status: 'active',
      batches: [],
      results: []
    };

    // Store sender information for streaming updates
    this.senderInfo.set(messageId, {
      tab: sender.tab,
      frameId: sender.frameId,
      url: sender.url
    });

    // Initialize streaming session
    this.activeStreams.set(messageId, streamInfo);
    this.streamingResults.set(messageId, []);
    
    this.stats.totalSessions++;
    this.stats.activeSessions++;

    logger.debug(`[StreamingManager] Initialized stream for ${messageId}: ${segments.length} segments via ${provider.providerName}`);
    return streamInfo;
  }

  /**
   * Check if streaming is supported and beneficial for this request
   * @param {object} provider - Provider instance
   * @param {string[]} segments - Text segments
   * @param {string} messageId - Message ID
   * @returns {boolean} - Whether to use streaming
   */
  shouldUseStreaming(provider, segments, messageId) {
    // Check if provider supports streaming
    if (!provider.constructor.supportsStreaming) {
      return false;
    }

    // Must have messageId for streaming coordination
    if (!messageId) {
      return false;
    }

    // Only stream for multiple segments or complex content
    const totalComplexity = segments.reduce((sum, seg) => 
      sum + this._calculateTextComplexity(seg), 0
    );

    return segments.length > 1 || totalComplexity > 100;
  }

  /**
   * Stream batch results to content script
   * @param {string} messageId - Message ID
   * @param {string[]} batchResults - Results for this batch
   * @param {string[]} originalBatch - Original texts for this batch
   * @param {number} batchIndex - Index of this batch
   */
  async streamBatchResults(messageId, batchResults, originalBatch, batchIndex) {
    const streamInfo = this.activeStreams.get(messageId);
    const senderInfo = this.senderInfo.get(messageId);

    if (!streamInfo || !senderInfo) {
      logger.warn(`[StreamingManager] Cannot stream - missing info for messageId: ${messageId}`);
      return;
    }

    // Update stream info
    streamInfo.processedSegments += batchResults.length;
    streamInfo.batches.push({
      index: batchIndex,
      size: batchResults.length,
      timestamp: Date.now()
    });

    // Accumulate results
    const accumulatedResults = this.streamingResults.get(messageId) || [];
    accumulatedResults.push(...batchResults);
    this.streamingResults.set(messageId, accumulatedResults);

    try {
      // Create stream update message
      const streamMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_UPDATE,
        {
          success: true,
          data: batchResults,
          originalData: originalBatch,
          batchIndex: batchIndex,
          provider: streamInfo.providerName,
          processedSegments: streamInfo.processedSegments,
          totalSegments: streamInfo.totalSegments,
          timestamp: Date.now()
        },
        'background-streaming',
        { messageId }
      );

      // Send to content script
      if (senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamMessage);
        logger.debug(`[StreamingManager] Streamed batch ${batchIndex} to tab ${senderInfo.tab.id}: ${batchResults.length} results`);
      } else {
        logger.warn(`[StreamingManager] No tab ID for streaming messageId: ${messageId}`);
      }
    } catch (error) {
      logger.error(`[StreamingManager] Failed to stream batch ${batchIndex}:`, error);
    }
  }

  /**
   * Stream batch error to content script
   * @param {string} messageId - Message ID
   * @param {Error} error - The error that occurred
   * @param {number} batchIndex - Index of the failed batch
   */
  async streamBatchError(messageId, error, batchIndex) {
    const streamInfo = this.activeStreams.get(messageId);
    const senderInfo = this.senderInfo.get(messageId);

    if (!streamInfo || !senderInfo) {
      logger.warn(`[StreamingManager] Cannot stream error - missing info for messageId: ${messageId}`);
      return;
    }

    try {
      // Create stream error message
      const streamErrorMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_UPDATE,
        {
          success: false,
          error: {
            message: error.message || 'Translation failed',
            type: error.type || 'TRANSLATION_ERROR'
          },
          batchIndex: batchIndex,
          provider: streamInfo.providerName,
          timestamp: Date.now()
        },
        'background-streaming',
        { messageId }
      );

      // Send to content script
      if (senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamErrorMessage);
        logger.debug(`[StreamingManager] Streamed error for batch ${batchIndex} to tab ${senderInfo.tab.id}`);
      } else {
        logger.warn(`[StreamingManager] No tab ID for streaming error messageId: ${messageId}`);
      }
    } catch (sendError) {
      logger.error(`[StreamingManager] Failed to stream error for batch ${batchIndex}:`, sendError);
    }
  }

  /**
   * Complete streaming session
   * @param {string} messageId - Message ID
   * @param {boolean} success - Whether translation was successful
   * @param {object} additionalData - Additional completion data
   */
  async completeStream(messageId, success = true, additionalData = {}) {
    const streamInfo = this.activeStreams.get(messageId);
    const senderInfo = this.senderInfo.get(messageId);

    if (!streamInfo) {
      logger.debug(`[StreamingManager] No active stream found for completion: ${messageId}`);
      return;
    }

    // Update stream info
    streamInfo.status = success ? 'completed' : 'error';
    streamInfo.endTime = Date.now();
    streamInfo.duration = streamInfo.endTime - streamInfo.startTime;

    // Update statistics
    this.stats.activeSessions--;
    if (success) {
      this.stats.completedSessions++;
    } else {
      this.stats.errorSessions++;
    }

    try {
      // Send stream end message
      const streamEndMessage = MessageFormat.create(
        MessageActions.TRANSLATION_STREAM_END,
        {
          success,
          completed: true,
          provider: streamInfo.providerName,
          processedSegments: streamInfo.processedSegments,
          totalSegments: streamInfo.totalSegments,
          duration: streamInfo.duration,
          timestamp: Date.now(),
          ...additionalData
        },
        'background-streaming',
        { messageId }
      );

      if (senderInfo && senderInfo.tab?.id) {
        await browser.tabs.sendMessage(senderInfo.tab.id, streamEndMessage);
        logger.info(`[StreamingManager] Stream completed for ${messageId}: ${streamInfo.processedSegments}/${streamInfo.totalSegments} segments in ${streamInfo.duration}ms`);
      }
    } catch (error) {
      logger.error(`[StreamingManager] Failed to send stream end for ${messageId}:`, error);
    }

    // Cleanup
    this._cleanupStream(messageId);
  }

  /**
   * Handle streaming error
   * @param {string} messageId - Message ID
   * @param {Error} error - Error that occurred
   */
  async handleStreamError(messageId, error) {
    logger.error(`[StreamingManager] Stream error for ${messageId}:`, error);
    
    const streamInfo = this.activeStreams.get(messageId);
    if (streamInfo) {
      streamInfo.error = error.message;
      streamInfo.status = 'error';
    }

    // Complete stream with error
    await this.completeStream(messageId, false, {
      error: {
        message: error.message,
        type: error.type || 'STREAMING_ERROR',
        timestamp: Date.now()
      }
    });

    // Immediate cleanup for errors to prevent state corruption
    this._immediateCleanup(messageId);
  }

  /**
   * Cancel streaming session
   * @param {string} messageId - Message ID
   * @param {string} reason - Cancellation reason
   */
  async cancelStream(messageId, reason = 'User cancelled') {
    const streamInfo = this.activeStreams.get(messageId);
    if (!streamInfo) {
      logger.debug(`[StreamingManager] No stream to cancel for messageId: ${messageId}`);
      return;
    }

    logger.debug(`[StreamingManager] Cancelling stream ${messageId}: ${reason}`);
    
    streamInfo.status = 'cancelled';
    streamInfo.cancellationReason = reason;

    await this.completeStream(messageId, false, {
      cancelled: true,
      reason: reason
    });

    // Immediate cleanup for cancellations to prevent state corruption
    this._immediateCleanup(messageId);
  }

  /**
   * Get sender information for a streaming message
   * @param {string} messageId - Message ID
   * @returns {object|null} - Sender information
   */
  getStreamingSender(messageId) {
    return this.senderInfo.get(messageId) || null;
  }

  /**
   * Get streaming session info
   * @param {string} messageId - Message ID
   * @returns {object|null} - Stream information
   */
  getStreamInfo(messageId) {
    return this.activeStreams.get(messageId) || null;
  }

  /**
   * Get accumulated results for a streaming session
   * @param {string} messageId - Message ID
   * @returns {string[]} - Accumulated results
   */
  getStreamResults(messageId) {
    return this.streamingResults.get(messageId) || [];
  }

  /**
   * Check if streaming session is active
   * @param {string} messageId - Message ID
   * @returns {boolean} - Whether stream is active
   */
  isStreamActive(messageId) {
    const streamInfo = this.activeStreams.get(messageId);
    return streamInfo && streamInfo.status === 'active';
  }

  /**
   * Get streaming statistics
   * @returns {object} - Streaming statistics
   */
  getStreamingStats() {
    return {
      ...this.stats,
      activeStreams: Array.from(this.activeStreams.keys()),
      streamCount: this.activeStreams.size
    };
  }

  /**
   * Cleanup streaming session
   * @param {string} messageId - Message ID
   * @private
   */
  _cleanupStream(messageId) {
    // Clean up after a delay to allow late messages
    setTimeout(() => {
      this.activeStreams.delete(messageId);
      this.senderInfo.delete(messageId);
      this.streamingResults.delete(messageId);
      logger.debug(`[StreamingManager] Cleaned up stream: ${messageId}`);
    }, 30000); // 30 second delay
  }

  /**
   * Immediate cleanup for errors/cancellations to prevent state corruption
   * @param {string} messageId - Message ID
   * @private
   */
  _immediateCleanup(messageId) {
    this.activeStreams.delete(messageId);
    this.senderInfo.delete(messageId);
    this.streamingResults.delete(messageId);
    logger.debug(`[StreamingManager] Immediately cleaned up stream: ${messageId}`);
  }

  /**
   * Calculate text complexity (simplified version)
   * @param {string} text - Text to analyze
   * @returns {number} - Complexity score
   * @private
   */
  _calculateTextComplexity(text) {
    if (!text || typeof text !== 'string') return 0;
    
    const length = text.length;
    const sentences = (text.match(/[.!?]+/g) || []).length;
    const words = text.trim().split(/\s+/).length;
    
    let complexity = Math.min(length * 0.5, 100);
    complexity += sentences * 2;
    complexity += Math.min(words * 0.5, 20);
    
    return Math.round(complexity);
  }

  /**
   * Cleanup old inactive streams periodically
   */
  cleanupOldStreams() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    let cleanedCount = 0;

    for (const [messageId, streamInfo] of this.activeStreams) {
      if (streamInfo.status !== 'active' && streamInfo.endTime) {
        const age = now - streamInfo.endTime;
        if (age > maxAge) {
          this._cleanupStream(messageId);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`[StreamingManager] Cleaned up ${cleanedCount} old streams`);
    }
  }
}

// Create singleton instance
export const streamingManager = new StreamingManager();

// Set up periodic cleanup
setInterval(() => {
  streamingManager.cleanupOldStreams();
}, 5 * 60 * 1000); // Every 5 minutes

logger.debug('[StreamingManager] Initialized with periodic cleanup');