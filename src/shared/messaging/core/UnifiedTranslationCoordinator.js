/**
 * UnifiedTranslationCoordinator - Central coordination for all translation operations
 *
 * Coordinates between:
 * - Regular translation requests (popup, sidepanel)
 * - Streaming translation requests (select element)
 * - Timeout management for both types
 * - Response routing and handling
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { streamingTimeoutManager } from './StreamingTimeoutManager.js';
import { sendRegularMessage } from './UnifiedMessaging.js';

// Lazy logger initialization to avoid TDZ issues
let logger = null;
function getLogger() {
  if (!logger) {
    logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'UnifiedTranslationCoordinator');
  }
  return logger;
}

export class UnifiedTranslationCoordinator {
  constructor() {
    this.activeTranslations = new Map();
    this.responseCallbacks = new Map();
    this.streamingOperations = new Set();
  }

  /**
   * Coordinate translation request - decides between regular and streaming
   * @param {object} message - Translation message
   * @param {object} options - Request options
   * @returns {Promise} - Translation result
   */
  async coordinateTranslation(message, options = {}) {
    const { action, data } = message;

    getLogger().info(`🔄 Coordinating ${action} request (${data?.text?.length || 0} chars, mode: ${data?.mode || 'unknown'})`);

    // Determine if this should be a streaming operation
    const shouldStream = this._shouldUseStreaming(message);

    if (shouldStream) {
      return this._coordinateStreamingTranslation(message, options);
    } else {
      return this._coordinateRegularTranslation(message, options);
    }
  }

  /**
   * Coordinate regular (non-streaming) translation
   * @private
   */
  async _coordinateRegularTranslation(message, options) {
    const { messageId } = message;

    try {
      // Track regular translation
      this.activeTranslations.set(messageId, {
        type: 'regular',
        startTime: Date.now(),
        message
      });

      // Use regular messaging (bypass coordinator to avoid recursion)
      const result = await sendRegularMessage(message, options);

      getLogger().debug(`Regular translation completed: ${messageId}`);
      return result;

    } catch (error) {
      getLogger().error(`Regular translation failed: ${messageId}`, error);
      throw error;
    } finally {
      this.activeTranslations.delete(messageId);
    }
  }

  /**
   * Coordinate streaming translation with smart timeout management
   * @private
   */
  async _coordinateStreamingTranslation(message, options) {
    const { messageId, data } = message;
    const { timeout: customTimeout } = options;

    try {
      // Track streaming translation
      this.activeTranslations.set(messageId, {
        type: 'streaming',
        startTime: Date.now(),
        message
      });

      this.streamingOperations.add(messageId);

      // Calculate appropriate timeouts for streaming
      const streamingTimeouts = this._calculateStreamingTimeouts(data, customTimeout);

      getLogger().debug(`Starting streaming translation coordination: ${messageId}`, streamingTimeouts);

      // Register with StreamingTimeoutManager
      const streamingPromise = streamingTimeoutManager.registerStreamingOperation(
        messageId,
        streamingTimeouts.initialTimeout,
        {
          onProgress: (progressData) => {
            getLogger().debug(`Streaming progress: ${messageId}`, progressData);
          },
          onComplete: (result) => {
            getLogger().debug(`Streaming completed: ${messageId}`, result);
          },
          onTimeout: () => {
            getLogger().warn(`Streaming timeout: ${messageId}`);
            this._handleStreamingTimeout(messageId);
          },
          onError: (error) => {
            getLogger().error(`Streaming error: ${messageId}`, error);
          },
          maxProgressTimeout: streamingTimeouts.progressTimeout,
          gracePeriod: streamingTimeouts.gracePeriod
        }
      );

      // Send initial request directly (bypass coordinator to avoid recursion)
      const initialResponse = await sendRegularMessage(message, {
        timeout: streamingTimeouts.initialTimeout
      });

      // If initial response indicates streaming started, wait for streaming completion
      if (initialResponse.streaming) {
        getLogger().debug(`Streaming initiated successfully: ${messageId}`);
        return await streamingPromise;
      } else {
        // Not streaming, return regular response
        streamingTimeoutManager.completeStreaming(messageId, initialResponse);
        return initialResponse;
      }

    } catch (error) {
      getLogger().error(`Streaming translation coordination failed: ${messageId}`, error);

      // Cancel streaming if it was registered
      if (this.streamingOperations.has(messageId)) {
        streamingTimeoutManager.cancelStreaming(messageId, `Coordination error: ${error.message}`);
      }

      throw error;
    } finally {
      this.activeTranslations.delete(messageId);
      this.streamingOperations.delete(messageId);
    }
  }

  /**
   * Report streaming progress (called by streaming handlers)
   * @param {string} messageId - Message ID
   * @param {object} progressData - Progress information
   */
  reportStreamingProgress(messageId, progressData) {
    if (this.streamingOperations.has(messageId)) {
      streamingTimeoutManager.reportProgress(messageId, progressData);
    }
  }

  /**
   * Complete streaming operation (called by streaming handlers)
   * @param {string} messageId - Message ID
   * @param {object} result - Final result
   */
  completeStreamingOperation(messageId, result) {
    if (this.streamingOperations.has(messageId)) {
      streamingTimeoutManager.completeStreaming(messageId, result);
    }
  }

  /**
   * Handle streaming error (called by streaming handlers)
   * @param {string} messageId - Message ID
   * @param {Error} error - Error object
   */
  handleStreamingError(messageId, error) {
    if (this.streamingOperations.has(messageId)) {
      streamingTimeoutManager.errorStreaming(messageId, error);
    }
  }

  /**
   * Cancel translation operation
   * @param {string} messageId - Message ID
   * @param {string} reason - Cancellation reason
   */
  cancelTranslation(messageId, reason = 'User cancelled') {
    const translation = this.activeTranslations.get(messageId);
    if (!translation) {
      return false;
    }

    getLogger().debug(`Cancelling translation: ${messageId} (${translation.type})`);

    if (translation.type === 'streaming') {
      streamingTimeoutManager.cancelStreaming(messageId, reason);
    }

    this.activeTranslations.delete(messageId);
    this.streamingOperations.delete(messageId);

    return true;
  }

  /**
   * Determine if translation should use streaming
   * @private
   */
  _shouldUseStreaming(message) {
    const { data, context } = message;

    // For Select Element mode, check text length
    if (context === 'select-element') {
      const textLength = data?.text?.length || 0;
      return textLength > 500;
    }

    // For other contexts with JSON payload (multiple segments)
    if (data?.options?.rawJsonPayload) {
      try {
        const jsonData = JSON.parse(data.text);
        if (Array.isArray(jsonData) && jsonData.length > 5) {
          return true; // Multiple segments warrant streaming
        }
      } catch {
        // Not valid JSON, use text length
      }
    }

    // For other contexts with long text
    const textLength = data?.text?.length || 0;
    return textLength > 2000;
  }

  /**
   * Calculate appropriate timeouts for streaming operations
   * @private
   */
  _calculateStreamingTimeouts(data, customTimeout) {
    let textLength = data?.text?.length || 0;
    let segmentCount = 1;

    // Estimate segment count for JSON payload
    if (data?.options?.rawJsonPayload) {
      try {
        const jsonData = JSON.parse(data.text);
        if (Array.isArray(jsonData)) {
          segmentCount = jsonData.length;
          // Calculate actual text length from JSON
          textLength = jsonData.reduce((sum, item) => sum + (item.text || '').length, 0);
        }
      } catch {
        // Fallback to text length estimation
        segmentCount = Math.ceil(textLength / 100);
      }
    } else {
      // Estimate segments based on text length
      segmentCount = Math.ceil(textLength / 500);
    }

    // Calculate timeouts based on segment count
    const baseTimeout = Math.min(30000, Math.max(15000, segmentCount * 3000)); // 3s per segment, 15-30s range
    const initialTimeout = customTimeout || Math.min(300000, baseTimeout + (segmentCount * 2000)); // Up to 5 minutes
    const progressTimeout = Math.max(60000, segmentCount * 1000); // At least 1 minute between progress
    const gracePeriod = Math.min(120000, segmentCount * 5000); // Up to 2 minutes grace period

    return {
      initialTimeout,
      progressTimeout,
      gracePeriod,
      estimatedSegments: segmentCount
    };
  }

  /**
   * Handle streaming timeout
   * @private
   */
  _handleStreamingTimeout(messageId) {
    getLogger().warn(`Handling streaming timeout for: ${messageId}`);

    const translation = this.activeTranslations.get(messageId);
    if (translation) {
      // Streaming timeout occurred, but background might still be processing
      // We keep the operation active but notify user about timeout
      getLogger().debug(`Streaming timeout handled, background processing may continue`);
    }
  }

  /**
   * Get status of all active translations
   * @returns {object} - Status information
   */
  getStatus() {
    const activeOperations = Array.from(this.activeTranslations.values()).map(translation => ({
      messageId: translation.message.messageId,
      type: translation.type,
      context: translation.message.context,
      duration: Date.now() - translation.startTime,
      textLength: translation.message.data?.text?.length
    }));

    return {
      activeCount: this.activeTranslations.size,
      streamingCount: this.streamingOperations.size,
      operations: activeOperations,
      streamingManager: streamingTimeoutManager.getStatus()
    };
  }

  /**
   * Cleanup all operations
   */
  cleanup() {
    getLogger().debug('Cleaning up UnifiedTranslationCoordinator');

    // Cancel all active translations
    for (const messageId of this.activeTranslations.keys()) {
      this.cancelTranslation(messageId, 'System cleanup');
    }

    // Clear all tracking
    this.activeTranslations.clear();
    this.responseCallbacks.clear();
    this.streamingOperations.clear();

    // Cleanup streaming timeout manager
    streamingTimeoutManager.cleanup();
  }
}

// Export singleton instance
export const unifiedTranslationCoordinator = new UnifiedTranslationCoordinator();