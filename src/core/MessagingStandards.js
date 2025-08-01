/**
 * Messaging Standards - Factory and standardization system for extension messaging
 * Provides context-specific messengers with standardized message formats
 * Implements singleton pattern for efficient resource management
 */

import { EnhancedUnifiedMessenger } from './EnhancedUnifiedMessenger.js';

/**
 * Standard message format interface
 */
export class MessageFormat {
  /**
   * Create a standardized message format
   * @param {string} action - Message action
   * @param {*} data - Message data
   * @param {string} context - Sender context
   * @param {Object} options - Additional options
   * @returns {Object} Standardized message object
   */
  static create(action, data, context, options = {}) {
    return {
      action,
      data,
      context,
      messageId: options.messageId || `${context}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      timestamp: Date.now(),
      version: '2.0',
      ...options
    };
  }

  /**
   * Validate message format
   * @param {Object} message - Message to validate
   * @returns {boolean} True if message is valid
   */
  static validate(message) {
    if (!message || typeof message !== 'object') {
      return false;
    }

    return Boolean(
      message.action &&
      typeof message.action === 'string' &&
      message.context &&
      typeof message.context === 'string' &&
      message.messageId &&
      typeof message.messageId === 'string' &&
      typeof message.timestamp === 'number'
    );
  }

  /**
   * Create success response format
   * @param {*} data - Response data
   * @param {string} originalMessageId - Original message ID
   * @param {Object} options - Additional options
   * @returns {Object} Success response object
   */
  static createSuccessResponse(data, originalMessageId, options = {}) {
    return {
      success: true,
      data,
      messageId: originalMessageId,
      timestamp: Date.now(),
      ...options
    };
  }

  /**
   * Create error response format
   * @param {string|Error} error - Error message or Error object
   * @param {string} originalMessageId - Original message ID
   * @param {Object} options - Additional options
   * @returns {Object} Error response object
   */
  static createErrorResponse(error, originalMessageId, options = {}) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error?.type || 'UNKNOWN_ERROR';
    const statusCode = error?.statusCode || 500;

    return {
      success: false,
      error: {
        message: errorMessage,
        type: errorType,
        statusCode
      },
      messageId: originalMessageId,
      timestamp: Date.now(),
      ...options
    };
  }
}

/**
 * Context definitions for different extension contexts
 */
export class MessagingContexts {
  static POPUP = 'popup';
  static SIDEPANEL = 'sidepanel';
  static OPTIONS = 'options';
  static BACKGROUND = 'background';
  static CONTENT = 'content';
  static OFFSCREEN = 'offscreen';
  static EVENT_HANDLER = 'event-handler';
  static TTS_MANAGER = 'tts-manager';
  static CAPTURE_MANAGER = 'capture-manager';
  static SELECTION_MANAGER = 'selection-manager';

  /**
   * Get all available contexts
   * @returns {Array<string>} Array of context names
   */
  static getAllContexts() {
    return [
      this.POPUP,
      this.SIDEPANEL,
      this.OPTIONS,
      this.BACKGROUND,
      this.CONTENT,
      this.OFFSCREEN,
      this.EVENT_HANDLER,
      this.TTS_MANAGER,
      this.CAPTURE_MANAGER,
      this.SELECTION_MANAGER
    ];
  }

  /**
   * Validate context name
   * @param {string} context - Context to validate
   * @returns {boolean} True if context is valid
   */
  static isValidContext(context) {
    return this.getAllContexts().includes(context);
  }
}

/**
 * Message action definitions for standardized communication
 */
export class MessageActions {
  // Core actions
  static PING = 'ping';
  static GET_INFO = 'getInfo';
  
  // Translation actions
  static TRANSLATE = 'TRANSLATE';
  static FETCH_TRANSLATION = 'fetchTranslation';
  static BATCH_TRANSLATE = 'BATCH_TRANSLATE';
  static GET_PROVIDERS = 'GET_PROVIDERS';
  static TEST_PROVIDER = 'TEST_PROVIDER';
  static TRANSLATION_RESULT_UPDATE = 'TRANSLATION_RESULT_UPDATE';
  
  // History actions
  static GET_HISTORY = 'GET_HISTORY';
  static CLEAR_HISTORY = 'CLEAR_HISTORY';
  static ADD_TO_HISTORY = 'ADD_TO_HISTORY';
  
  // TTS actions
  static TTS_SPEAK = 'TTS_SPEAK';
  static TTS_STOP = 'TTS_STOP';
  static TTS_PAUSE = 'TTS_PAUSE';
  static TTS_RESUME = 'TTS_RESUME';
  static TTS_GET_VOICES = 'TTS_GET_VOICES';
  static TTS_PLAY_CACHED_AUDIO = 'TTS_PLAY_CACHED_AUDIO';
  static TTS_TEST = 'TTS_TEST';
  static TTS_SPEAK_CONTENT = 'TTS_SPEAK_CONTENT';
  
  // Capture actions
  static SCREEN_CAPTURE = 'SCREEN_CAPTURE';
  static START_CAPTURE_SELECTION = 'START_CAPTURE_SELECTION';
  static PROCESS_IMAGE_OCR = 'PROCESS_IMAGE_OCR';
  static PLAY_OFFSCREEN_AUDIO = 'playOffscreenAudio';
  
  // Selection actions
  static ACTIVATE_SELECT_ELEMENT_MODE = 'activateSelectElementMode';
  static DEACTIVATE_SELECT_ELEMENT_MODE = 'deactivateSelectElementMode';
  static TOGGLE_SELECT_ELEMENT_MODE = 'toggleSelectElementMode';
  static GET_SELECT_ELEMENT_STATE = 'getSelectElementState';
  static PROCESS_SELECTED_ELEMENT = 'processSelectedElement';
  
  // Notification actions
  static SHOW_NOTIFICATION = 'SHOW_NOTIFICATION';
  static DISMISS_NOTIFICATION = 'DISMISS_NOTIFICATION';
  
  // Storage actions
  static GET_SETTINGS = 'GET_SETTINGS';
  static SET_SETTINGS = 'SET_SETTINGS';
  static SYNC_SETTINGS = 'SYNC_SETTINGS';

  /**
   * Get all available actions
   * @returns {Array<string>} Array of action names
   */
  static getAllActions() {
    return Object.values(this);
  }

  /**
   * Validate action name
   * @param {string} action - Action to validate
   * @returns {boolean} True if action is valid
   */
  static isValidAction(action) {
    return this.getAllActions().includes(action);
  }
}

/**
 * Messaging Standards - Main factory and management class
 */
export class MessagingStandards {
  /**
   * Singleton instances storage
   * @private
   */
  static instances = new Map();

  /**
   * Message interceptors for logging and debugging
   * @private
   */
  static interceptors = {
    request: [],
    response: []
  };

  /**
   * Get or create messenger instance for specific context
   * @param {string} context - Context identifier
   * @returns {EnhancedUnifiedMessenger} Messenger instance
   */
  static getMessenger(context) {
    // Validate context
    if (!MessagingContexts.isValidContext(context)) {
      console.warn(`[MessagingStandards] Unknown context: ${context}, using as-is`);
    }

    // Get or create instance
    if (!this.instances.has(context)) {
      const messenger = new EnhancedUnifiedMessenger(context);
      this.instances.set(context, messenger);
      
      console.log(`[MessagingStandards] Created new messenger for context: ${context}`);
    }

    return this.instances.get(context);
  }

  /**
   * Create standardized message format
   * @param {string} action - Message action
   * @param {*} data - Message data
   * @param {string} context - Sender context
   * @param {Object} options - Additional options
   * @returns {Object} Standardized message
   */
  static standardMessageFormat(action, data, context, options = {}) {
    // Validate inputs
    if (!action || typeof action !== 'string') {
      throw new Error('Action is required and must be a string');
    }
    
    if (!context || typeof context !== 'string') {
      throw new Error('Context is required and must be a string');
    }

    return MessageFormat.create(action, data, context, options);
  }

  /**
   * Generate unique message ID
   * @param {string} context - Context identifier
   * @returns {string} Unique message ID
   */
  static generateMessageId(context) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${context}-${timestamp}-${random}`;
  }

  /**
   * Add request interceptor
   * @param {Function} interceptor - Interceptor function
   */
  static addRequestInterceptor(interceptor) {
    if (typeof interceptor === 'function') {
      this.interceptors.request.push(interceptor);
    }
  }

  /**
   * Add response interceptor
   * @param {Function} interceptor - Interceptor function
   */
  static addResponseInterceptor(interceptor) {
    if (typeof interceptor === 'function') {
      this.interceptors.response.push(interceptor);
    }
  }

  /**
   * Clear all messenger instances
   * Useful for testing and cleanup
   */
  static clearInstances() {
    this.instances.clear();
    console.log('[MessagingStandards] All messenger instances cleared');
  }

  /**
   * Get all active messenger contexts
   * @returns {Array<string>} Array of active contexts
   */
  static getActiveContexts() {
    return Array.from(this.instances.keys());
  }

  /**
   * Get messenger statistics
   * @returns {Object} Statistics object
   */
  static getStatistics() {
    const stats = {
      totalInstances: this.instances.size,
      activeContexts: this.getActiveContexts(),
      requestInterceptors: this.interceptors.request.length,
      responseInterceptors: this.interceptors.response.length
    };

    // Get individual messenger info
    stats.messengers = {};
    for (const [context, messenger] of this.instances) {
      stats.messengers[context] = messenger.getInfo();
    }

    return stats;
  }

  /**
   * Test connectivity for all active messengers
   * @returns {Promise<Object>} Test results
   */
  static async testAllMessengers() {
    const results = {};
    
    for (const [context, messenger] of this.instances) {
      try {
        results[context] = await messenger.testSpecializedMessengers();
      } catch (error) {
        results[context] = {
          success: false,
          error: error.message,
          context
        };
      }
    }

    return {
      success: Object.values(results).every(r => r.success),
      results,
      timestamp: Date.now()
    };
  }

  /**
   * Create pre-configured messengers for common contexts
   * @returns {Object} Object with pre-configured messengers
   */
  static createCommonMessengers() {
    return {
      popup: this.getMessenger(MessagingContexts.POPUP),
      sidepanel: this.getMessenger(MessagingContexts.SIDEPANEL),
      options: this.getMessenger(MessagingContexts.OPTIONS),
      content: this.getMessenger(MessagingContexts.CONTENT),
      background: this.getMessenger(MessagingContexts.BACKGROUND),
      eventHandler: this.getMessenger(MessagingContexts.EVENT_HANDLER)
    };
  }

  /**
   * Setup development mode logging
   * Adds request/response interceptors for debugging
   */
  static setupDevelopmentLogging() {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    // Request logging
    this.addRequestInterceptor((message, context) => {
      console.group(`[MessagingStandards:${context}] 📤 Request`);
      console.log('Action:', message.action);
      console.log('Data:', message.data);
      console.log('MessageId:', message.messageId);
      console.groupEnd();
    });

    // Response logging
    this.addResponseInterceptor((response, context, originalMessage) => {
      console.group(`[MessagingStandards:${context}] 📥 Response`);
      console.log('Original Action:', originalMessage?.action);
      console.log('Success:', response?.success);
      console.log('Data:', response?.data);
      console.log('Error:', response?.error);
      console.groupEnd();
    });

    console.log('[MessagingStandards] Development logging enabled');
  }
}

// Export constants for easy access
export { MessagingContexts as Contexts };
export { MessageActions as Actions };

export default MessagingStandards;