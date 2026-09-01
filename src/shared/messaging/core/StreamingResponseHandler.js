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
import { reconstructTranslationError, isStructuredTranslationError } from './MessagingCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'StreamingResponseHandler');
const TERMINAL_STREAM_TTL_MS = 60_000;
const BUFFERED_MESSAGE_TTL_MS = 60_000;
const MAX_BUFFERED_STREAM_IDS = 100;
const MAX_BUFFERED_MESSAGES_PER_STREAM = 50;
const MAX_TERMINAL_STREAM_IDS = 1_000;

export class StreamingResponseHandler {
  constructor(coordinator) {
    this.coordinator = coordinator;
    this.activeHandlers = new Map();
    this.messageBuffer = new Map();
    this.terminalStreams = new Map();
  }

  /**
   * Register a streaming response handler for a specific message ID
   * @param {string} messageId - Message ID to handle responses for
   * @param {object} callbacks - Response callback functions
   */
  registerHandler(messageId, callbacks = {}) {
    this._pruneExpiredState();

    const {
      onStreamUpdate = () => {},
      onStreamEnd = () => {},
      onTranslationResult = () => {},
      onError = () => {}
    } = callbacks;

    logger.debug('[StreamingResponseHandler] Registering handler for:', messageId);
    // Explicit registration starts a new ownership window for this message ID.
    this.terminalStreams.delete(messageId);

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

    logger.debug('[StreamingResponseHandler] Active handlers count:', this.activeHandlers.size);
    return handler;
  }

  /**
   * Handle incoming streaming response message
   * @param {object} message - Response message
   * @returns {boolean} - Whether message was handled
   */
  handleMessage(message) {
    const { action, messageId } = message;

    if (!messageId) {
      return false;
    }

    this._pruneExpiredState();

    // Check if we have a handler for this messageId
    const handler = this.activeHandlers.get(messageId);

    if (!handler) {
      if (this.terminalStreams.has(messageId)) {
        logger.debug(`Discarded late streaming message for terminal ${messageId}`);
        return false;
      }

      // Buffer the message in case handler is registered later
      this._bufferMessage(messageId, message);
      return false;
    }

    if (handler.isCompleted) {
      return false;
    }

    try {
      switch (action) {
        case MessageActions.TRANSLATION_STREAM_UPDATE:
          return this._handleStreamUpdate(handler, message);

        case MessageActions.TRANSLATION_STREAM_END:
          logger.debug('[StreamingResponseHandler] Handling STREAM_END for:', messageId);
          return this._handleStreamEnd(handler, message);

        case MessageActions.TRANSLATION_RESULT_UPDATE:
          return this._handleTranslationResult(handler, message);

        default:
          logger.debug('[StreamingResponseHandler] Unknown action:', action);
          return false;
      }
    } catch (error) {
      logger.warn(`Error handling streaming message for ${messageId}:`, error.message);
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
    } catch (error) {
      logger.warn(`Error in stream update callback for ${messageId}:`, error.message);
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
    this._markTerminal(messageId);

    // Call handler callback
    try {
      handler.onStreamEnd(data);
    } catch (error) {
      logger.warn(`Error in stream end callback for ${messageId}:`, error);
    }

    // Complete streaming operation in coordinator
    if (data?.success) {
      this.coordinator.completeStreamingOperation(messageId, {
        success: true,
        type: 'stream_end',
        updateCount: handler.updateCount,
        targetLanguage: data.targetLanguage,
        sourceLanguage: data.sourceLanguage,
        data,
        ...(data?.conversationAcceptance === true && { conversationAcceptance: true })
      });
    } else {
      const errorSource = isStructuredTranslationError(data?.errorDetails)
        ? data.errorDetails
        : (data?.error || 'Streaming ended with error');
      const error = reconstructTranslationError(errorSource);
      error.streamData = data;
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

    // A failed streaming result is terminal even when it carries the streaming
    // marker. Successful streaming acknowledgements remain non-terminal.
    if (data?.streaming && data?.success !== false) {
      try {
        handler.onTranslationResult(data);
      } catch (error) {
        logger.debug(`Error in translation result callback for ${messageId}:`, error.message);
      }
      return true;
    }

    handler.isCompleted = true;
    this._markTerminal(messageId);

    // Call handler callback
    try {
      handler.onTranslationResult(data);
    } catch (error) {
      logger.warn(`Error in translation result callback for ${messageId}:`, error);
    }

    // Complete operation in coordinator
    if (data?.success) {
      this.coordinator.completeStreamingOperation(messageId, {
        success: true,
        type: 'translation_result',
        data,
        ...(data?.conversationAcceptance === true && { conversationAcceptance: true })
      });
    } else {
      const errorSource = isStructuredTranslationError(data?.errorDetails)
        ? data.errorDetails
        : (data?.error || 'Translation failed');
      const error = reconstructTranslationError(errorSource);
      error.translationData = data;
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

    // Use debug level for expected cancellations to reduce log verbosity
    if (error.message === 'Handler cancelled' || error.type === 'HANDLER_CANCELLED' || error.type === 'USER_CANCELLED') {
      logger.debug(`Streaming response cancelled for ${messageId}`);
    } else {
      logger.warn(`Streaming response error for ${messageId}:`, error.message);
    }

    handler.isCompleted = true;
    this._markTerminal(messageId);

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
    this._pruneExpiredState();

    if (this.terminalStreams.has(messageId)) {
      return;
    }

    if (!this.messageBuffer.has(messageId)) {
      while (this.messageBuffer.size >= MAX_BUFFERED_STREAM_IDS) {
        const oldestMessageId = this.messageBuffer.keys().next().value;
        if (oldestMessageId === undefined) break;
        this.messageBuffer.delete(oldestMessageId);
      }
      this.messageBuffer.set(messageId, []);
    }

    const buffer = this.messageBuffer.get(messageId);
    buffer.push({
      message,
      timestamp: Date.now()
    });

    // Limit buffer size to prevent memory issues
    if (buffer.length > MAX_BUFFERED_MESSAGES_PER_STREAM) {
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
    this._pruneExpiredState();
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
   * Mark a stream terminal before its handler and buffer are removed.
   * @private
   */
  _markTerminal(messageId) {
    const now = Date.now();
    this._pruneExpiredState(now);
    this.terminalStreams.delete(messageId);
    this.terminalStreams.set(messageId, now + TERMINAL_STREAM_TTL_MS);

    while (this.terminalStreams.size > MAX_TERMINAL_STREAM_IDS) {
      const oldestMessageId = this.terminalStreams.keys().next().value;
      if (oldestMessageId === undefined) break;
      this.terminalStreams.delete(oldestMessageId);
    }
  }

  /**
   * Remove expired terminal markers and pre-registration messages.
   * @param {number} now - Current timestamp
   * @private
   */
  _pruneExpiredState(now = Date.now()) {
    for (const [messageId, expiresAt] of this.terminalStreams) {
      if (expiresAt <= now) {
        this.terminalStreams.delete(messageId);
      }
    }

    for (const [messageId, buffer] of this.messageBuffer) {
      const activeMessages = buffer.filter(({ timestamp }) => timestamp + BUFFERED_MESSAGE_TTL_MS > now);
      if (activeMessages.length === 0) {
        this.messageBuffer.delete(messageId);
      } else if (activeMessages.length !== buffer.length) {
        this.messageBuffer.set(messageId, activeMessages);
      }
    }
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
    this._pruneExpiredState();

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
    this.terminalStreams.clear();
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
