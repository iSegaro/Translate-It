/**
 * Content Script Message Handler
 * Modular handler for content script messages using existing messaging architecture
 * Integrates with SimpleMessageHandler system
 */

import { MessageActions } from '@/messaging/core/MessageActions.js';
import { MessagingContexts } from '@/messaging/core/MessagingCore.js';

export class ContentMessageHandler {
  constructor() {
    this.handlers = new Map();
    this.initialized = false;
    this.context = MessagingContexts.CONTENT;
  }

  /**
   * Initialize the content message handler
   * Registers with existing messaging system
   */
  initialize() {
    if (this.initialized) {
      console.warn('[ContentMessageHandler] Already initialized');
      return;
    }

    console.log('[ContentMessageHandler] Initializing content script message handler');

    // Register message handlers for content-specific actions
    this.registerHandlers();
    
    this.initialized = true;
    console.log('[ContentMessageHandler] ✅ Initialized successfully');
  }

  /**
   * Register content-specific message handlers
   */
  registerHandlers() {
    // Register handler for revert action from background/sidepanel
    this.registerHandler(MessageActions.REVERT_SELECT_ELEMENT_MODE, this.handleRevertTranslations.bind(this));
    
    // Register handler for text field translation results
    this.registerHandler(MessageActions.TRANSLATION_RESULT_UPDATE, this.handleTranslationResult.bind(this));
    
    // Future handlers can be added here
    // this.registerHandler('SOME_OTHER_ACTION', this.handleSomeOtherAction.bind(this));
  }

  /**
   * Register a handler for a specific action
   * @param {string} action - Message action
   * @param {Function} handler - Handler function
   */
  registerHandler(action, handler) {
    if (this.handlers.has(action)) {
      console.warn(`[ContentMessageHandler] Overwriting handler for action: ${action}`);
    }
    
    this.handlers.set(action, handler);
    console.log(`[ContentMessageHandler] ✅ Registered handler for: ${action}`);
  }

  /**
   * Handle incoming message
   * @param {Object} message - Message object
   * @param {Object} sender - Sender object
   * @param {Function} sendResponse - Response function
   * @returns {boolean|Promise} Handler result
   */
  async handleMessage(message, sender, sendResponse) {
    console.log('[ContentMessageHandler] Processing message:', message.action);

    const handler = this.handlers.get(message.action);
    if (!handler) {
      // Not handled by this handler - let other handlers process
      return false;
    }

    try {
      const result = await handler(message, sender);
      
      if (sendResponse) {
        sendResponse(result);
      }
      
      return result;
    } catch (error) {
      console.error(`[ContentMessageHandler] Error handling ${message.action}:`, error);
      
      const errorResponse = {
        success: false,
        error: error.message || 'Content handler error'
      };
      
      if (sendResponse) {
        sendResponse(errorResponse);
      }
      
      return errorResponse;
    }
  }

  /**
   * Handle revert translations message
   * @param {Object} message - Message object
   * @param {Object} sender - Sender object
   * @returns {Promise<Object>} Handler result
   */
  async handleRevertTranslations(message, sender) {
    console.log('[ContentMessageHandler] Processing revert translations request');
    
    try {
      // Import the shared revert handler
      const { RevertHandler } = await import('./RevertHandler.js');
      const revertHandler = new RevertHandler();
      
      const result = await revertHandler.executeRevert();
      
      return {
        success: result.success,
        message: result.success ? `${result.revertedCount || 0} translation(s) reverted` : result.error,
        revertedCount: result.revertedCount || 0,
        system: result.system || 'none'
      };
      
    } catch (error) {
      console.error('[ContentMessageHandler] Error in revert handler:', error);
      return {
        success: false,
        error: error.message || 'Failed to revert translations'
      };
    }
  }

  /**
   * Handle translation result message for text field translation
   * @param {Object} message - Message object with translation result
   * @param {Object} sender - Sender object
   * @returns {Promise<Object>} Handler result
   */
  async handleTranslationResult(message, sender) {
    console.log('[ContentMessageHandler] Processing translation result:', message.data);
    
    try {
      const { translatedText, originalText, translationMode } = message.data;
      
      if (!translatedText) {
        throw new Error('No translated text received');
      }
      
      // Import the text field translation handler
      const { applyTranslationToTextField } = await import('../smartTranslationIntegration.js');
      
      // Apply translation to the active element
      const result = await applyTranslationToTextField(translatedText, originalText, translationMode);
      
      return {
        success: true,
        message: 'Translation applied successfully',
        applied: result.applied || false
      };
      
    } catch (error) {
      console.error('[ContentMessageHandler] Error in translation result handler:', error);
      return {
        success: false,
        error: error.message || 'Failed to apply translation result'
      };
    }
  }

  /**
   * Get handler information
   * @returns {Object} Handler info
   */
  getInfo() {
    return {
      context: this.context,
      initialized: this.initialized,
      handlerCount: this.handlers.size,
      registeredHandlers: Array.from(this.handlers.keys())
    };
  }

  /**
   * Cleanup handler
   */
  cleanup() {
    this.handlers.clear();
    this.initialized = false;
    console.log('[ContentMessageHandler] Cleaned up');
  }
}

// Export singleton instance
export const contentMessageHandler = new ContentMessageHandler();