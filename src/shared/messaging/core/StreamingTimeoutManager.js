/**
 * StreamingTimeoutManager - Centralized timeout coordination for streaming operations
 *
 * Handles timeout coordination between UnifiedMessaging and streaming responses
 * Prevents timeout mismatches between initiator and background streaming processes
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'StreamingTimeoutManager');

export class StreamingTimeoutManager {
  constructor() {
    this.activeStreams = new Map();
    this.timeoutHandles = new Map();
    this.abortControllers = new Map();
    this.progressTrackers = new Map();
  }

  /**
   * Register a streaming operation with smart timeout management
   * @param {string} messageId - Unique message ID
   * @param {number} initialTimeout - Initial timeout from UnifiedMessaging
   * @param {object} options - Configuration options
   * @returns {Promise} - Promise that resolves when streaming completes or times out
   */
  async registerStreamingOperation(messageId, initialTimeout, options = {}) {
    const {
      onProgress = () => {},
      onComplete = () => {},
      onTimeout = () => {},
      onError = () => {},
      maxProgressTimeout = 60000, // Max time between progress updates
      gracePeriod = 30000 // Grace period after initial timeout
    } = options;

    logger.debug(`Registering streaming operation: ${messageId}`, {
      initialTimeout,
      maxProgressTimeout,
      gracePeriod
    });

    // Create abort controller for this operation
    const abortController = new AbortController();
    this.abortControllers.set(messageId, abortController);

    // Track streaming state
    const streamState = {
      messageId,
      startTime: Date.now(),
      lastProgressTime: Date.now(),
      isCompleted: false,
      progressCount: 0,
      hasTimedOut: false,
      onProgress,
      onComplete,
      onTimeout,
      onError
    };

    this.activeStreams.set(messageId, streamState);
    this.progressTrackers.set(messageId, Date.now());

    // Set up smart timeout management
    this._setupSmartTimeout(messageId, initialTimeout, maxProgressTimeout, gracePeriod);

    // Return promise that resolves when streaming completes
    return new Promise((resolve, reject) => {
      streamState.resolve = resolve;
      streamState.reject = reject;
    });
  }

  /**
   * Report progress for a streaming operation
   * @param {string} messageId - Message ID
   * @param {object} progressData - Progress information
   */
  reportProgress(messageId, progressData = {}) {
    const streamState = this.activeStreams.get(messageId);
    if (!streamState || streamState.isCompleted) {
      return;
    }

    const now = Date.now();
    streamState.lastProgressTime = now;
    streamState.progressCount++;
    this.progressTrackers.set(messageId, now);

    logger.debug(`Progress reported for ${messageId}:`, {
      progressCount: streamState.progressCount,
      timeSinceStart: now - streamState.startTime,
      progressData
    });

    // Call progress callback
    try {
      streamState.onProgress(progressData);
    } catch (error) {
      logger.warn(`Error in progress callback for ${messageId}:`, error);
    }

    // Reset timeout since we got progress
    this._resetProgressTimeout(messageId);
  }

  /**
   * Mark streaming operation as completed
   * @param {string} messageId - Message ID
   * @param {object} result - Final result
   */
  completeStreaming(messageId, result = {}) {
    const streamState = this.activeStreams.get(messageId);
    if (!streamState || streamState.isCompleted) {
      return;
    }

    logger.debug(`Streaming completed for ${messageId}:`, {
      duration: Date.now() - streamState.startTime,
      progressCount: streamState.progressCount
    });

    streamState.isCompleted = true;

    // Clear timeouts
    this._clearTimeouts(messageId);

    // Call completion callback
    try {
      streamState.onComplete(result);
      streamState.resolve(result);
    } catch (error) {
      logger.warn(`Error in completion callback for ${messageId}:`, error);
    }

    // Cleanup
    this._cleanup(messageId);
  }

  /**
   * Handle streaming error
   * @param {string} messageId - Message ID
   * @param {Error} error - Error object
   */
  errorStreaming(messageId, error) {
    const streamState = this.activeStreams.get(messageId);
    if (!streamState || streamState.isCompleted) {
      return;
    }

    logger.debug(`Streaming error for ${messageId}:`, error);

    streamState.isCompleted = true;

    // Clear timeouts
    this._clearTimeouts(messageId);

    // Call error callback
    try {
      streamState.onError(error);
      streamState.reject(error);
    } catch (callbackError) {
      logger.warn(`Error in error callback for ${messageId}:`, callbackError);
    }

    // Cleanup
    this._cleanup(messageId);
  }

  /**
   * Cancel a streaming operation
   * @param {string} messageId - Message ID
   * @param {string} reason - Cancellation reason
   */
  cancelStreaming(messageId, reason = 'User cancelled') {
    const streamState = this.activeStreams.get(messageId);
    if (!streamState) {
      return;
    }

    logger.debug(`Cancelling streaming for ${messageId}: ${reason}`);

    // Abort the operation
    const abortController = this.abortControllers.get(messageId);
    if (abortController) {
      abortController.abort();
    }

    // Create cancellation error
    const cancelError = new Error(reason);
    cancelError.type = 'USER_CANCELLED';

    this.errorStreaming(messageId, cancelError);
  }

  /**
   * Check if a streaming operation is active
   * @param {string} messageId - Message ID
   * @returns {boolean} - Whether streaming is active
   */
  isStreaming(messageId) {
    const streamState = this.activeStreams.get(messageId);
    return streamState && !streamState.isCompleted;
  }

  /**
   * Get abort signal for a streaming operation
   * @param {string} messageId - Message ID
   * @returns {AbortSignal|null} - Abort signal if available
   */
  getAbortSignal(messageId) {
    const abortController = this.abortControllers.get(messageId);
    return abortController ? abortController.signal : null;
  }

  /**
   * Setup smart timeout management
   * @private
   */
  _setupSmartTimeout(messageId, initialTimeout, maxProgressTimeout, gracePeriod) {
    // Initial timeout (from UnifiedMessaging)
    const initialTimeoutHandle = setTimeout(() => {
      this._handleInitialTimeout(messageId, gracePeriod);
    }, initialTimeout);

    // Progress timeout (resets on each progress update)
    const progressTimeoutHandle = setTimeout(() => {
      this._handleProgressTimeout(messageId);
    }, maxProgressTimeout);

    this.timeoutHandles.set(messageId, {
      initial: initialTimeoutHandle,
      progress: progressTimeoutHandle
    });
  }

  /**
   * Handle initial timeout (with grace period for ongoing streaming)
   * @private
   */
  _handleInitialTimeout(messageId, gracePeriod) {
    const streamState = this.activeStreams.get(messageId);
    if (!streamState || streamState.isCompleted) {
      return;
    }

    // Check if we have recent progress
    const timeSinceProgress = Date.now() - streamState.lastProgressTime;

    if (timeSinceProgress < 30000 && streamState.progressCount > 0) {
      // We have recent progress, extend timeout with grace period
      logger.debug(`Initial timeout reached for ${messageId}, but streaming is active. Extending with grace period.`);

      const graceTimeoutHandle = setTimeout(() => {
        this._handleFinalTimeout(messageId);
      }, gracePeriod);

      const timeouts = this.timeoutHandles.get(messageId);
      if (timeouts) {
        timeouts.grace = graceTimeoutHandle;
      }
    } else {
      // No recent progress, timeout immediately
      this._handleFinalTimeout(messageId);
    }
  }

  /**
   * Handle progress timeout (no progress for too long)
   * @private
   */
  _handleProgressTimeout(messageId) {
    const streamState = this.activeStreams.get(messageId);
    if (!streamState || streamState.isCompleted) {
      return;
    }

    logger.warn(`Progress timeout for streaming operation ${messageId}`);

    const timeoutError = new Error(`Streaming operation timed out - no progress for too long`);
    timeoutError.type = 'PROGRESS_TIMEOUT';

    streamState.hasTimedOut = true;

    try {
      streamState.onTimeout();
    } catch (error) {
      logger.warn(`Error in timeout callback for ${messageId}:`, error);
    }

    this.errorStreaming(messageId, timeoutError);
  }

  /**
   * Handle final timeout
   * @private
   */
  _handleFinalTimeout(messageId) {
    const streamState = this.activeStreams.get(messageId);
    if (!streamState || streamState.isCompleted) {
      return;
    }

    logger.warn(`Final timeout for streaming operation ${messageId}`);

    const timeoutError = new Error(`Streaming operation timed out completely`);
    timeoutError.type = 'FINAL_TIMEOUT';

    streamState.hasTimedOut = true;

    try {
      streamState.onTimeout();
    } catch (error) {
      logger.warn(`Error in timeout callback for ${messageId}:`, error);
    }

    this.errorStreaming(messageId, timeoutError);
  }

  /**
   * Reset progress timeout
   * @private
   */
  _resetProgressTimeout(messageId) {
    const timeouts = this.timeoutHandles.get(messageId);
    if (!timeouts) return;

    // Clear existing progress timeout
    if (timeouts.progress) {
      clearTimeout(timeouts.progress);
    }

    // Set new progress timeout (60 seconds between progress updates)
    timeouts.progress = setTimeout(() => {
      this._handleProgressTimeout(messageId);
    }, 60000);
  }

  /**
   * Clear all timeouts for a message ID
   * @private
   */
  _clearTimeouts(messageId) {
    const timeouts = this.timeoutHandles.get(messageId);
    if (timeouts) {
      if (timeouts.initial) clearTimeout(timeouts.initial);
      if (timeouts.progress) clearTimeout(timeouts.progress);
      if (timeouts.grace) clearTimeout(timeouts.grace);
    }
    this.timeoutHandles.delete(messageId);
  }

  /**
   * Cleanup resources for a message ID
   * @private
   */
  _cleanup(messageId) {
    this.activeStreams.delete(messageId);
    this.abortControllers.delete(messageId);
    this.progressTrackers.delete(messageId);
  }

  /**
   * Get status of all active streaming operations
   * @returns {object} - Status information
   */
  getStatus() {
    const activeOperations = Array.from(this.activeStreams.values()).map(stream => ({
      messageId: stream.messageId,
      duration: Date.now() - stream.startTime,
      progressCount: stream.progressCount,
      timeSinceLastProgress: Date.now() - stream.lastProgressTime,
      hasTimedOut: stream.hasTimedOut
    }));

    return {
      activeCount: this.activeStreams.size,
      operations: activeOperations
    };
  }

  /**
   * Cleanup all operations (for shutdown)
   */
  cleanup() {
    logger.debug('Cleaning up StreamingTimeoutManager');

    // Cancel all active operations
    for (const messageId of this.activeStreams.keys()) {
      this.cancelStreaming(messageId, 'System shutdown');
    }

    // Clear all maps
    this.activeStreams.clear();
    this.timeoutHandles.clear();
    this.abortControllers.clear();
    this.progressTrackers.clear();
  }
}

// Export singleton instance
export const streamingTimeoutManager = new StreamingTimeoutManager();