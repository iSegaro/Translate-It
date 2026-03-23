/**
 * ContentScriptIntegration - Integration layer for content script message handling
 *
 * Provides seamless integration between:
 * - Legacy message handlers (for backward compatibility)
 * - New unified streaming system
 * - Response routing and coordination
 *
 * Note: Streaming messages are now routed through ContentMessageHandler,
 * which delegates to this.streamingHandler. No separate listener setup needed.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from './MessageActions.js';
import { unifiedTranslationCoordinator } from './UnifiedTranslationCoordinator.js';
import { createStreamingResponseHandler } from './StreamingResponseHandler.js';

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'ContentScriptIntegration');

export class ContentScriptIntegration {
  constructor() {
    this.messageHandlers = new Map();
    this.streamingHandler = createStreamingResponseHandler(unifiedTranslationCoordinator);
    this.isInitialized = false;
  }

  /**
   * Initialize the integration layer
   * Note: Streaming messages are now routed through MessageHandler,
   * so we don't need to set up a separate listener
   */
  async initialize() {
    if (!this.isInitialized) {
      this.isInitialized = true;
      logger.debug('ContentScriptIntegration initialized');
    }
  }

  /**
   * Register a translation request for streaming coordination
   * @param {string} messageId - Message ID
   * @param {object} callbacks - Response callbacks
   */
  registerTranslationRequest(messageId, callbacks = {}) {
    if (!this.isInitialized) {
      this.initialize();
    }

    // Register with streaming handler
    // Note: MessageHandler will route streaming messages to this.streamingHandler
    return this.streamingHandler.registerHandler(messageId, {
      onStreamUpdate: (data) => {
        if (callbacks.onStreamUpdate) {
          callbacks.onStreamUpdate(data);
        }
      },
      onStreamEnd: (data) => {
        if (callbacks.onStreamEnd) {
          callbacks.onStreamEnd(data);
        }
      },
      onTranslationResult: (data) => {
        logger.debug(`Translation result for ${messageId}:`, data);
        if (callbacks.onTranslationResult) {
          callbacks.onTranslationResult(data);
        }
      },
      onError: (error) => {
        // Use info level for expected cancellations
        if (error.message === 'Handler cancelled' || error.type === 'HANDLER_CANCELLED' || error.type === 'USER_CANCELLED') {
          logger.info(`Translation cancelled for ${messageId}`);
        } else {
          logger.error(`Translation error for ${messageId}:`, error);
        }
        
        if (callbacks.onError) {
          callbacks.onError(error);
        }
      }
    });
  }

  /**
   * Send translation request through unified coordinator
   * @param {object} message - Translation message
   * @param {object} options - Request options
   * @returns {Promise} - Translation result
   */
  async sendTranslationRequest(message, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    logger.debug(`Sending translation request through coordinator:`, {
      messageId: message.messageId,
      action: message.action,
      context: message.context
    });

    try {
      return await unifiedTranslationCoordinator.coordinateTranslation(message, options);
    } catch (error) {
      logger.error(`Translation request failed:`, error);
      throw error;
    }
  }

  /**
   * Cancel a translation request
   * @param {string} messageId - Message ID
   * @param {string} reason - Cancellation reason
   */
  cancelTranslationRequest(messageId, reason = 'User cancelled') {
    logger.debug(`Cancelling translation request: ${messageId}`);

    // Cancel in coordinator
    unifiedTranslationCoordinator.cancelTranslation(messageId, reason);

    // Cancel streaming handler
    this.streamingHandler.cancelHandler(messageId);
  }

  /**
   * Register a legacy message handler (for backward compatibility)
   * @param {string} action - Message action
   * @param {function} handler - Handler function
   */
  registerLegacyHandler(action, handler) {
    logger.debug(`Registering legacy handler for: ${action}`);
    this.messageHandlers.set(action, handler);
  }

  /**
   * Handle incoming message (legacy compatibility)
   * @param {object} message - Incoming message
   * @param {object} sender - Message sender
   * @returns {boolean} - Whether message was handled
   */
  async handleMessage(message, sender) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const { action, messageId } = message;

    // Try streaming handler first
    if (this._isStreamingResponseAction(action)) {
      const handled = this.streamingHandler.handleMessage(message);
      if (handled) {
        logger.debug(`Message handled by streaming handler: ${action} (${messageId})`);
        return true;
      }
    }

    // Try legacy handlers
    const legacyHandler = this.messageHandlers.get(action);
    if (legacyHandler) {
      logger.debug(`Message handled by legacy handler: ${action}`);
      try {
        const result = await legacyHandler(message, sender);
        return result;
      } catch (error) {
        logger.error(`Legacy handler error for ${action}:`, error);
        throw error;
      }
    }

    // Message not handled
    return false;
  }

  /**
   * Check if action is a streaming response action
   * @private
   */
  _isStreamingResponseAction(action) {
    const streamingActions = [
      MessageActions.TRANSLATION_STREAM_UPDATE,
      MessageActions.TRANSLATION_STREAM_END,
      MessageActions.TRANSLATION_RESULT_UPDATE
    ];

    return streamingActions.includes(action);
  }

  /**
   * Get status of the integration layer
   * @returns {object} - Status information
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      legacyHandlerCount: this.messageHandlers.size,
      streamingHandler: this.streamingHandler.getStatus(),
      coordinator: unifiedTranslationCoordinator.getStatus()
    };
  }

  /**
   * Cleanup the integration layer
   */
  cleanup() {
    logger.debug('Cleaning up ContentScriptIntegration');

    // Cleanup streaming handler
    if (this.streamingHandler) {
      this.streamingHandler.cleanup();
    }

    // Clear legacy handlers
    this.messageHandlers.clear();

    this.isInitialized = false;

    logger.debug('ContentScriptIntegration cleanup completed');
  }
}

// Export singleton instance for content scripts
export const contentScriptIntegration = new ContentScriptIntegration();

/**
 * Convenience functions for common operations
 */

/**
 * Initialize integration for content script
 */
export async function initializeContentScriptIntegration() {
  await contentScriptIntegration.initialize();
}

/**
 * Register translation request with integrated streaming support
 * @param {string} messageId - Message ID
 * @param {object} callbacks - Response callbacks
 */
export function registerTranslation(messageId, callbacks) {
  return contentScriptIntegration.registerTranslationRequest(messageId, callbacks);
}

/**
 * Send translation through unified system
 * @param {object} message - Translation message
 * @param {object} options - Request options
 */
export function sendUnifiedTranslation(message, options) {
  return contentScriptIntegration.sendTranslationRequest(message, options);
}

/**
 * Cancel translation request
 * @param {string} messageId - Message ID
 * @param {string} reason - Cancellation reason
 */
export function cancelTranslation(messageId, reason) {
  return contentScriptIntegration.cancelTranslationRequest(messageId, reason);
}

/**
 * Register legacy message handler
 * @param {string} action - Message action
 * @param {function} handler - Handler function
 */
export function registerLegacyHandler(action, handler) {
  return contentScriptIntegration.registerLegacyHandler(action, handler);
}

/**
 * Handle incoming message
 * @param {object} message - Incoming message
 * @param {object} sender - Message sender
 */
export function handleMessage(message, sender) {
  return contentScriptIntegration.handleMessage(message, sender);
}