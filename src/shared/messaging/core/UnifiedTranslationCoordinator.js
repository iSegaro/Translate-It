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
import { MessageActions } from './MessageActions.js';
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'UnifiedTranslationCoordinator');

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
    if (!message) throw new Error('Message is undefined in coordinateTranslation');
    const { action, data } = message;
    const textLength = (data?.text?.length) || 0;

    logger.debug(`Coordinating ${action} request (${textLength} chars, mode: ${data?.mode || 'unknown'})`);

    try {
      // Early check if operation was cancelled before any processing
      if (message.messageId && streamingTimeoutManager.shouldContinue(message.messageId) === false) {
        logger.debug('Translation operation cancelled before coordination');
        throw new Error('Translation cancelled by user');
      }

      // Determine if this should be a streaming operation
      const shouldStream = this._shouldUseStreaming(message);

      if (shouldStream) {
        return await this._coordinateStreamingTranslation(message, options);
      } else {
        return await this._coordinateRegularTranslation(message, options);
      }
    } catch (error) {
      const errorType = matchErrorToType(error);
      if (errorType !== ErrorTypes.USER_CANCELLED) {
        logger.debug(`Translation coordination failed for ${message.messageId}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Coordinate regular (non-streaming) translation
   * @private
   */
  async _coordinateRegularTranslation(message, options) {
    const { messageId } = message;

    try {
      // Check if operation was cancelled before sending the request
      if (messageId && streamingTimeoutManager.shouldContinue(messageId) === false) {
        logger.debug('Regular translation operation cancelled');
        throw new Error('Translation cancelled by user');
      }

      // Track regular translation
      this.activeTranslations.set(messageId, {
        type: 'regular',
        startTime: Date.now(),
        message
      });

      // Use regular messaging (bypass coordinator to avoid recursion)
      const result = await sendRegularMessage(message, options);

      return result;

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

      logger.debug(`Starting streaming translation coordination: ${messageId}`, streamingTimeouts);

      // Register with StreamingTimeoutManager
      const streamingPromise = streamingTimeoutManager.registerStreamingOperation(
        messageId,
        streamingTimeouts.initialTimeout,
        {
          onProgress: (progressData) => {
            logger.debug(`Streaming progress: ${messageId}`, progressData);
          },
          onComplete: (result) => {
            logger.debug(`Streaming completed: ${messageId}`, result);
          },
          onTimeout: () => {
            logger.warn(`Streaming timeout: ${messageId}`);
            this._handleStreamingTimeout(messageId);
          },
          onError: (error) => {
            // Log cancellation as debug instead of error using proper error management
            const errorType = matchErrorToType(error);
            if (errorType === ErrorTypes.USER_CANCELLED) {
              logger.debug(`Streaming cancelled: ${messageId}`, error);
            } else {
              logger.debug(`Streaming error: ${messageId}`, error);
            }
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
      if (initialResponse && initialResponse.streaming) {
        logger.debug(`Streaming initiated successfully: ${messageId}`);
        const streamingResult = await streamingPromise;

        // Check if streaming failed (resolved with error instead of rejected to avoid uncaught promise)
        if (streamingResult && streamingResult.success === false) {
          if (streamingResult.cancelled) {
            const cancelError = new Error(streamingResult.reason || 'Operation cancelled');
            cancelError.type = ErrorTypes.USER_CANCELLED;
            cancelError.isCancelled = true;
            throw cancelError;
          }
          throw streamingResult.error || new Error('Streaming failed without explicit error');
        }

        return streamingResult;
      } else {
        // Not streaming, return regular response
        if (messageId) streamingTimeoutManager.completeStreaming(messageId, initialResponse || { success: true });
        return initialResponse;
      }

    } catch (error) {
      // Log cancellation as info instead of error using proper error management
      const errorType = error ? matchErrorToType(error) : ErrorTypes.UNKNOWN;
      const errorMessage = error?.message || (typeof error === 'string' ? error : 'Unknown error');
      
      if (errorType !== ErrorTypes.USER_CANCELLED) {
        logger.warn(`Streaming translation coordination failed for ${messageId}: ${errorMessage}`);
      }

      // Cancel streaming if it was registered
      if (messageId && this.streamingOperations.has(messageId)) {
        const cancelReason = errorType === ErrorTypes.USER_CANCELLED
          ? `User cancelled: ${errorMessage}`
          : `Coordination error: ${errorMessage}`;

        try {
          streamingTimeoutManager.cancelStreaming(messageId, cancelReason);
        } catch (cancelError) {
          // Log cancellation errors as debug to avoid adding noise to console
          logger.debug('Error during streaming cancellation (handled gracefully):', cancelError);
        }
      }

      throw error;
    } finally {
      if (messageId) {
        this.activeTranslations.delete(messageId);
        this.streamingOperations.delete(messageId);
      }
    }
  }

  /**
   * Report streaming progress (called by streaming handlers)
   * @param {string} messageId - Message ID
   * @param {object} progressData - Progress information
   */
  reportStreamingProgress(messageId, progressData) {
    if (messageId && this.streamingOperations.has(messageId)) {
      streamingTimeoutManager.reportProgress(messageId, progressData);
    }
  }

  /**
   * Complete streaming operation (called by streaming handlers)
   * @param {string} messageId - Message ID
   * @param {object} result - Final result
   */
  completeStreamingOperation(messageId, result) {
    if (messageId && this.streamingOperations.has(messageId)) {
      streamingTimeoutManager.completeStreaming(messageId, result);
    }
  }

  /**
   * Handle streaming error (called by streaming handlers)
   * @param {string} messageId - Message ID
   * @param {Error} error - Error object
   */
  handleStreamingError(messageId, error) {
    if (messageId && this.streamingOperations.has(messageId)) {
      streamingTimeoutManager.errorStreaming(messageId, error);
    }
  }

  /**
   * Cancel translation operation
   * @param {string} messageId - Message ID
   * @param {string} reason - Cancellation reason
   */
  cancelTranslation(messageId, reason = 'User cancelled') {
    if (!messageId) return false;
    const translation = this.activeTranslations.get(messageId);
    if (!translation) {
      return false;
    }

    logger.debug(`Cancelling translation: ${messageId} (${translation.type})`);

    if (translation.type === 'streaming') {
      streamingTimeoutManager.cancelStreaming(messageId, reason);
    }

    // Notify background to stop translation immediately
    // We don't await this as we want the content-side cancellation to be immediate
    sendRegularMessage({
      action: MessageActions.CANCEL_TRANSLATION,
      data: { messageId, reason }
    }).catch(err => {
      // Log at debug level as this is often due to extension context invalidation during cancellation
      logger.debug(`Cancellation message to background failed for ${messageId}:`, err.message);
    });

    this.activeTranslations.delete(messageId);
    this.streamingOperations.delete(messageId);

    return true;
  }

  /**
   * Determine if translation should use streaming
   * @private
   */
  _shouldUseStreaming(message) {
    if (!message) return false;
    const { data, context } = message;

    // For Select Element mode, check text length
    if (context === 'select-element' || data?.mode === 'select-element') {
      const textLength = (data?.text?.length) || 0;
      // Also check if text is a JSON string with abbreviated keys
      if (typeof data?.text === 'string' && data.text.startsWith('[') && data.text.includes('"t":')) {
        return true; // Always stream for JSON payloads in select-element mode
      }
      return textLength > 200;
    }

    // For other contexts with JSON payload (multiple segments)
    if (data?.options?.rawJsonPayload && typeof data?.text === 'string') {
      try {
        const jsonData = JSON.parse(data.text);
        if (Array.isArray(jsonData) && (jsonData.length || 0) > 5) {
          return true; // Multiple segments warrant streaming
        }
      } catch {
        // Not valid JSON, use text length
      }
    }

    // For other contexts with long text
    const textLength = (data?.text?.length) || 0;
    return textLength > 2000;
  }

  /**
   * Calculate appropriate timeouts for streaming operations
   * @private
   */
  _calculateStreamingTimeouts(data, customTimeout) {
    let textLength = (data?.text?.length) || 0;
    let segmentCount = 1;

    // Estimate segment count for JSON payload
    if (data?.options?.rawJsonPayload && typeof data?.text === 'string') {
      try {
        const jsonData = JSON.parse(data.text);
        if (Array.isArray(jsonData)) {
          segmentCount = (jsonData.length) || 1;
          // Calculate actual text length from JSON (support both 't' and 'text' keys)
          textLength = jsonData.reduce((sum, item) => {
            const text = item?.t || item?.text || '';
            return sum + (text?.length || 0);
          }, 0);
        }
      } catch {
        // Fallback to text length estimation
        segmentCount = Math.ceil(textLength / 100);
      }
    } else {
      // Estimate segments based on text length
      segmentCount = Math.ceil(textLength / 500);
    }

    // Enhanced timeouts for Select Element mode - allow longer processing times
    const isSelectElementMode = data?.mode === 'select_element' || data?.mode === 'select-element' || data?.options?.mode === 'select_element';

    let baseTimeout, initialTimeout, progressTimeout, gracePeriod;

    if (isSelectElementMode) {
      // Select Element mode needs much longer timeouts due to batching and API delays
      baseTimeout = Math.min(120000, Math.max(30000, segmentCount * 5000)); // 5s per segment, 30-120s range
      initialTimeout = customTimeout || Math.min(600000, baseTimeout + (segmentCount * 4000)); // Up to 10 minutes
      progressTimeout = Math.max(180000, segmentCount * 2000); // At least 3 minutes between progress
      gracePeriod = Math.min(300000, segmentCount * 10000); // Up to 5 minutes grace period
    } else {
      // Standard timeouts for regular translation
      baseTimeout = Math.min(30000, Math.max(15000, segmentCount * 3000)); // 3s per segment, 15-30s range
      initialTimeout = customTimeout || Math.min(300000, baseTimeout + (segmentCount * 2000)); // Up to 5 minutes
      progressTimeout = Math.max(60000, segmentCount * 1000); // At least 1 minute between progress
      gracePeriod = Math.min(120000, segmentCount * 5000); // Up to 2 minutes grace period
    }

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
    if (!messageId) return;
    logger.warn(`Handling streaming timeout for: ${messageId}`);

    const translation = this.activeTranslations.get(messageId);
    if (translation) {
      // Streaming timeout occurred, but background might still be processing
      // We keep the operation active but notify user about timeout
      logger.debug(`Streaming timeout handled, background processing may continue`);
    }
  }

  /**
   * Get status of all active translations
   * @returns {object} - Status information
   */
  getStatus() {
    const activeOperations = Array.from(this.activeTranslations.values()).map(translation => ({
      messageId: translation.message?.messageId,
      type: translation.type,
      context: translation.message?.context,
      duration: Date.now() - translation.startTime,
      textLength: (translation.message?.data?.text?.length) || 0
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
    logger.debug('Cleaning up UnifiedTranslationCoordinator');

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
