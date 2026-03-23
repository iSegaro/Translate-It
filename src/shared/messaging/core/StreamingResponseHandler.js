/**
 * StreamingResponseHandler - Unified handler for streaming translation responses
 *
 * Coordinates response handling between:
 * - TRANSLATION_STREAM_UPDATE messages
 * - TRANSLATION_STREAM_END messages
 * - TRANSLATION_RESULT_UPDATE messages
 * - Progress reporting to UnifiedTranslationCoordinator
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from './MessageActions.js';

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'StreamingResponseHandler');

export class StreamingResponseHandler {
  constructor(coordinator) {
    this.coordinator = coordinator;
    this.activeHandlers = new Map();
    this.messageBuffer = new Map();
  }

  /**
   * Register a streaming response handler for a specific message ID
   * @param {string} messageId - Message ID to handle responses for
   * @param {object} callbacks - Response callback functions
   */
  registerHandler(messageId, callbacks = {}) {
    const {
      onStreamUpdate = () => {},
      onStreamEnd = () => {},
      onTranslationResult = () => {},
      onError = () => {}
    } = callbacks;

    console.log('[StreamingResponseHandler] Registering handler for:', messageId);

    const handler = {
      messageId,
      onStreamUpdate,
      onStreamEnd,
      onTranslationResult,
      onError,
      registeredAt: Date.now(),
      updateCount: 0,
      isCompleted: false
    };

    this.activeHandlers.set(messageId, handler);

    // Process any buffered messages for this messageId
    this._processBufferedMessages(messageId);

    console.log('[StreamingResponseHandler] Active handlers count:', this.activeHandlers.size);
    return handler;
  }

  /**
   * Handle incoming streaming response message
   * @param {object} message - Response message
   * @returns {boolean} - Whether message was handled
   */
  handleMessage(message) {
    const { action, messageId } = message;

    console.log('[StreamingResponseHandler] handleMessage called:', action, messageId, 'Active handlers:', Array.from(this.activeHandlers.keys()));

    if (!messageId) {
      return false;
    }

    // Check if we have a handler for this messageId
    const handler = this.activeHandlers.get(messageId);

    if (!handler) {
      console.log('[StreamingResponseHandler] No handler found for:', messageId, '- buffering message');
      // Buffer the message in case handler is registered later
      this._bufferMessage(messageId, message);
      return false;
    }

    if (handler.isCompleted) {
      console.log('[StreamingResponseHandler] Handler already completed for:', messageId);
      return false;
    }

    try {
      switch (action) {
        case MessageActions.TRANSLATION_STREAM_UPDATE:
          console.log('[StreamingResponseHandler] Handling STREAM_UPDATE for:', messageId);
          return this._handleStreamUpdate(handler, message);

        case MessageActions.TRANSLATION_STREAM_END:
          console.log('[StreamingResponseHandler] Handling STREAM_END for:', messageId);
          return this._handleStreamEnd(handler, message);

        case MessageActions.TRANSLATION_RESULT_UPDATE:
          console.log('[StreamingResponseHandler] Handling RESULT_UPDATE for:', messageId);
          return this._handleTranslationResult(handler, message);

        default:
          console.log('[StreamingResponseHandler] Unknown action:', action);
          return false;
      }
    } catch (error) {
      logger.error(`Error handling streaming message for ${messageId}:`, error);
      this._handleError(handler, error);
      return true;
    }
  }

  /**
   * Handle stream update message
   * @private
   */
  _handleStreamUpdate(handler, message) {
    const { messageId, data } = message;

    handler.updateCount++;

    console.log('[StreamingResponseHandler._handleStreamUpdate] Processing stream update:', {
      messageId,
      hasHandler: !!handler,
      hasOnStreamUpdate: typeof handler.onStreamUpdate === 'function',
      dataKeys: data ? Object.keys(data) : 'no data',
      hasDataData: !!data?.data,
      updateCount: handler.updateCount
    });

    // Report progress to coordinator
    this.coordinator.reportStreamingProgress(messageId, {
      type: 'stream_update',
      batchIndex: data?.batchIndex,
      success: data?.success,
      updateCount: handler.updateCount
    });

    // Call handler callback
    try {
      handler.onStreamUpdate(data);
      console.log('[StreamingResponseHandler._handleStreamUpdate] Callback completed successfully');
    } catch (error) {
      logger.warn(`Error in stream update callback for ${messageId}:`, error);
    }

    return true;
  }

  /**
   * Handle stream end message
   * @private
   */
  _handleStreamEnd(handler, message) {
    const { messageId, data } = message;

    handler.isCompleted = true;

    // Call handler callback
    try {
      handler.onStreamEnd(data);
    } catch (error) {
      logger.warn(`Error in stream end callback for ${messageId}:`, error);
    }

    // Complete streaming operation in coordinator
    if (data?.success) {
      this.coordinator.completeStreamingOperation(messageId, {
        type: 'stream_end',
        updateCount: handler.updateCount,
        data
      });
    } else {
      const error = new Error(data?.error?.message || 'Streaming ended with error');
      error.streamData = data;
      if (data?.error?.type) error.type = data.error.type;
      this.coordinator.handleStreamingError(messageId, error);
    }

    // Cleanup handler
    this._cleanupHandler(messageId);

    return true;
  }

  /**
   * Handle translation result message (fallback for non-streaming)
   * @private
   */
  _handleTranslationResult(handler, message) {
    const { messageId, data } = message;

    // If this is just a streaming acknowledgement, don't complete or cleanup
    if (data?.streaming) {
      console.log('[StreamingResponseHandler._handleTranslationResult] Streaming acknowledgement received, keeping handler active');
      try {
        handler.onTranslationResult(data);
      } catch (error) {
        logger.info(`Error in translation result callback for ${messageId}:`, error);
      }
      return true;
    }

    handler.isCompleted = true;

    // Call handler callback
    try {
      handler.onTranslationResult(data);
    } catch (error) {
      logger.warn(`Error in translation result callback for ${messageId}:`, error);
    }

    // Complete operation in coordinator
    if (data?.success) {
      this.coordinator.completeStreamingOperation(messageId, {
        type: 'translation_result',
        data
      });
    } else {
      const error = new Error(data?.error?.message || 'Translation failed');
      error.translationData = data;
      if (data?.error?.type) error.type = data.error.type;
      this.coordinator.handleStreamingError(messageId, error);
    }

    // Cleanup handler
    this._cleanupHandler(messageId);

    return true;
  }

  /**
   * Handle error in streaming response
   * @private
   */
  _handleError(handler, error) {
    const { messageId } = handler;

    // Use info level for expected cancellations to reduce log verbosity
    if (error.message === 'Handler cancelled' || error.type === 'HANDLER_CANCELLED' || error.type === 'USER_CANCELLED') {
      logger.info(`Streaming response cancelled for ${messageId}`);
    } else {
      logger.error(`Streaming response error for ${messageId}:`, error);
    }

    handler.isCompleted = true;

    // Call error callback
    try {
      handler.onError(error);
    } catch (callbackError) {
      logger.warn(`Error in error callback for ${messageId}:`, callbackError);
    }

    // Report error to coordinator
    this.coordinator.handleStreamingError(messageId, error);

    // Cleanup handler
    this._cleanupHandler(messageId);
  }

  /**
   * Buffer message for later processing
   * @private
   */
  _bufferMessage(messageId, message) {
    if (!this.messageBuffer.has(messageId)) {
      this.messageBuffer.set(messageId, []);
    }

    const buffer = this.messageBuffer.get(messageId);
    buffer.push({
      message,
      timestamp: Date.now()
    });

    // Limit buffer size to prevent memory issues
    if (buffer.length > 50) {
      buffer.shift(); // Remove oldest message
    }

    logger.debug(`Buffered message for ${messageId}:`, {
      action: message.action,
      bufferSize: buffer.length
    });
  }

  /**
   * Process any buffered messages for a messageId
   * @private
   */
  _processBufferedMessages(messageId) {
    const buffer = this.messageBuffer.get(messageId);
    if (!buffer || buffer.length === 0) {
      return;
    }

    logger.debug(`Processing ${buffer.length} buffered messages for ${messageId}`);

    // Sort by timestamp to ensure correct order
    buffer.sort((a, b) => a.timestamp - b.timestamp);

    // Process each buffered message
    for (const { message } of buffer) {
      this.handleMessage(message);
    }

    // Clear buffer
    this.messageBuffer.delete(messageId);
  }

  /**
   * Cleanup handler and associated resources
   * @private
   */
  _cleanupHandler(messageId) {
    this.activeHandlers.delete(messageId);
    this.messageBuffer.delete(messageId);
  }

  /**
   * Cancel handler for a specific message ID
   * @param {string} messageId - Message ID to cancel
   */
  cancelHandler(messageId) {
    const handler = this.activeHandlers.get(messageId);
    if (!handler) {
      return false;
    }

    handler.isCompleted = true;

    // Create cancellation error
    const cancelError = new Error('Handler cancelled');
    cancelError.type = 'HANDLER_CANCELLED';

    this._handleError(handler, cancelError);

    return true;
  }

  /**
   * Get handler information
   * @param {string} messageId - Message ID
   * @returns {object|null} - Handler info
   */
  getHandlerInfo(messageId) {
    const handler = this.activeHandlers.get(messageId);
    if (!handler) {
      return null;
    }

    return {
      messageId: handler.messageId,
      registeredAt: handler.registeredAt,
      duration: Date.now() - handler.registeredAt,
      updateCount: handler.updateCount,
      isCompleted: handler.isCompleted
    };
  }

  /**
   * Get status of all active handlers
   * @returns {object} - Status information
   */
  getStatus() {
    const activeHandlers = Array.from(this.activeHandlers.values()).map(handler => ({
      messageId: handler.messageId,
      duration: Date.now() - handler.registeredAt,
      updateCount: handler.updateCount,
      isCompleted: handler.isCompleted
    }));

    const bufferedMessages = Array.from(this.messageBuffer.entries()).map(([messageId, buffer]) => ({
      messageId,
      bufferSize: buffer.length,
      oldestMessage: buffer.length > 0 ? Date.now() - buffer[0].timestamp : 0
    }));

    return {
      activeHandlerCount: this.activeHandlers.size,
      bufferedMessageIds: this.messageBuffer.size,
      activeHandlers,
      bufferedMessages
    };
  }

  /**
   * Cleanup all handlers and resources
   */
  cleanup() {
    // Cancel all active handlers
    for (const messageId of this.activeHandlers.keys()) {
      this.cancelHandler(messageId);
    }

    // Clear all maps
    this.activeHandlers.clear();
    this.messageBuffer.clear();
  }
}

/**
 * Factory function to create handlers with coordinator integration
 * @param {object} coordinator - UnifiedTranslationCoordinator instance
 * @returns {StreamingResponseHandler} - Handler instance
 */
export function createStreamingResponseHandler(coordinator) {
  return new StreamingResponseHandler(coordinator);
}