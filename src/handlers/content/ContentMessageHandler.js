/**
 * Content Script Message Handler
 * Handles content script messages with simple translation mode routing
 * Routes different translation types appropriately without over-engineering
 */

import { MessageActions } from '@/messaging/core/MessageActions.js';
import { MessagingContexts } from '@/messaging/core/MessagingCore.js';
import { TranslationMode } from '../../config.js';
import { createLogger } from '../../utils/core/logger.js';

export class ContentMessageHandler {
  constructor() {
    this.handlers = new Map();
    this.initialized = false;
    this.context = MessagingContexts.CONTENT;
    this.logger = createLogger('Content', 'MessageHandler');
  }

  /**
   * Initialize the content message handler
   * Registers with existing messaging system
   */
  initialize() {
    if (this.initialized) {
      this.logger.warn('Already initialized');
      return;
    }

    // Register message handlers for content-specific actions
    this.registerHandlers();
    
    this.initialized = true;
    this.logger.init('Content message handler initialized');
  }

  /**
   * Register content-specific message handlers
   */
  registerHandlers() {
    // Register handler for text field translation results
    this.registerHandler(MessageActions.TRANSLATION_RESULT_UPDATE, this.handleTranslationResult.bind(this));
    
    // Register handler for TTS content script requests
    this.registerHandler(MessageActions.TTS_SPEAK_CONTENT, this.handleTTSSpeak.bind(this));
    
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
      this.logger.warn(`Overwriting handler for action: ${action}`);
    }
    
    this.handlers.set(action, handler);
    this.logger.debug(`Registered handler for: ${action}`);
  }

  /**
   * Handle incoming message
   * @param {Object} message - Message object
   * @param {Object} sender - Sender object
   * @param {Function} sendResponse - Response function
   * @returns {boolean|Promise} Handler result
   */
  async handleMessage(message, sender, sendResponse) {
    this.logger.debug('Processing message:', message.action);

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
      this.logger.error(`Error handling ${message.action}`, error);
      
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
   * Handle TTS speak request from background script
   * @param {Object} message - TTS message object
   * @param {Object} sender - Sender object
   * @returns {Promise<Object>} Handler result
   */
  async handleTTSSpeak(message, sender) {
    this.logger.debug('Processing TTS speak request:', message);

    try {
      // Check if Web Speech API is available
      if (!window.speechSynthesis) {
        throw new Error('Web Speech API not available in this context');
      }

      const { data } = message;
      
      if (!data || !data.text || !data.text.trim()) {
        throw new Error('Text to speak cannot be empty');
      }

      // Stop any current speech
      window.speechSynthesis.cancel();

      // Create utterance
      const utterance = new SpeechSynthesisUtterance(data.text.trim());

      // Set voice options with safety checks
      if (data.lang) {
        utterance.lang = data.lang;
      }
      if (data.rate && data.rate >= 0.1 && data.rate <= 10) {
        utterance.rate = data.rate;
      }
      if (data.pitch && data.pitch >= 0 && data.pitch <= 2) {
        utterance.pitch = data.pitch;
      }
      if (data.volume && data.volume >= 0 && data.volume <= 1) {
        utterance.volume = data.volume;
      }

      // Return promise that resolves when speech is complete
      return new Promise((resolve, reject) => {
        let resolved = false;

        const resolveOnce = (result) => {
          if (!resolved) {
            resolved = true;
            resolve(result);
          }
        };

        const rejectOnce = (error) => {
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        };

        // Setup event handlers
        utterance.onstart = () => {
          this.logger.debug('TTS speech started');
        };

        utterance.onend = () => {
          this.logger.debug('TTS speech ended successfully');
          resolveOnce({ success: true });
        };

        utterance.onerror = (error) => {
          this.logger.error('TTS speech error:', error);
          rejectOnce(new Error(`Content script TTS failed: ${error.error || error.message}`));
        };

        // Add timeout as safety measure
        const timeout = setTimeout(() => {
          if (!resolved) {
            this.logger.warn('TTS timeout, cancelling speech');
            window.speechSynthesis.cancel();
            rejectOnce(new Error('Content script TTS timeout'));
          }
        }, 15000); // 15 second timeout

        // Clear timeout when speech ends or errors
        utterance.onend = (event) => {
          clearTimeout(timeout);
          this.logger.debug('TTS speech ended successfully');
          resolveOnce({ success: true });
        };

        utterance.onerror = (error) => {
          clearTimeout(timeout);
          this.logger.error('TTS speech error:', error);
          rejectOnce(new Error(`Content script TTS failed: ${error.error || error.message}`));
        };

        // Start speech synthesis
        window.speechSynthesis.speak(utterance);
        this.logger.debug('TTS speech started via Web Speech API');
      });

    } catch (error) {
      this.logger.error('Failed to handle TTS speak request:', error);
      throw error;
    }
  }

  

  /**
   * Handle translation result message with simple mode-based routing
   * Routes different translation types to appropriate handlers
   * @param {Object} message - Message object with translation result
   * @returns {Promise<Object>} Handler result
   */
  async handleTranslationResult(message) {
    const { translationMode } = message.data;
    const messageId = message.messageId;
    
    this.logger.debug('Processing translation result', {
      mode: translationMode,
      messageId,
      hasTranslatedText: !!message.data.translatedText
    });
    
    try {
      // Validate message data
      if (!message.data.translatedText) {
        throw new Error('No translated text received');
      }

      // Route based on translation mode
      if (this.shouldDelegate(translationMode, messageId)) {
        return this.createDelegatedResponse(translationMode, messageId);
      }
      
      if (this.isFieldTranslation(translationMode)) {
        return await this.handleFieldTranslation(message);
      }
      
      return this.createNoActionResponse(translationMode);
      
    } catch (error) {
      this.logger.error('Error in translation result handling', error);
      return {
        success: false,
        error: error.message || 'Failed to handle translation result',
        context: 'ContentMessageHandler'
      };
    }
  }

  /**
   * Check if translation mode should be delegated to specialized handlers
   * @param {string} translationMode - Translation mode
   * @param {string} messageId - Message ID
   * @returns {boolean} Whether should delegate
   */
  shouldDelegate(translationMode, messageId) {
    // Modes that have specialized handlers and use messageId for coordination
    const delegatedModes = [
      TranslationMode.Dictionary_Translation,
      'dictionary',
      TranslationMode.Select_Element, 
      'SelectElement'
    ];
    
    return delegatedModes.includes(translationMode) && messageId;
  }

  /**
   * Check if translation mode should be handled as field translation
   * @param {string} translationMode - Translation mode
   * @returns {boolean} Whether is field translation
   */
  isFieldTranslation(translationMode) {
    const fieldModes = [
      TranslationMode.Field,
      'field',
      'normal' // Legacy fallback
    ];
    
    return fieldModes.includes(translationMode);
  }

  /**
   * Handle field translation - apply to text fields
   * @param {Object} message - Translation message
   * @returns {Promise<Object>} Handler result
   */
  async handleFieldTranslation(message) {
    const { translatedText, originalText, translationMode } = message.data;
    
    this.logger.debug('Handling field translation');
    
    // Import and apply to text field
    const { applyTranslationToTextField } = await import('../smartTranslationIntegration.js');
    const result = await applyTranslationToTextField(translatedText, originalText, translationMode);
    
    return {
      success: true,
      message: 'Translation applied to field successfully',
      applied: result.applied || false,
      mode: 'field'
    };
  }

  /**
   * Create response for delegated translations
   * @param {string} translationMode - Translation mode
   * @param {string} messageId - Message ID
   * @returns {Object} Response object
   */
  createDelegatedResponse(translationMode, messageId) {
    const delegateMapping = {
      [TranslationMode.Dictionary_Translation]: 'SelectionWindows',
      'dictionary': 'SelectionWindows',
      [TranslationMode.Select_Element]: 'SelectElementManager',
      'SelectElement': 'SelectElementManager'
    };
    
    const delegatedTo = delegateMapping[translationMode] || 'SpecializedHandler';
    
    this.logger.debug(`Delegating ${translationMode} to ${delegatedTo}`);
    
    return {
      success: true,
      message: `Translation delegated to ${delegatedTo}`,
      applied: true,
      mode: translationMode,
      delegatedTo,
      messageId
    };
  }

  /**
   * Create response for modes that don't require content script action
   * @param {string} translationMode - Translation mode
   * @returns {Object} Response object
   */
  createNoActionResponse(translationMode) {
    const noActionModes = [
      TranslationMode.Popup_Translate,
      TranslationMode.Sidepanel_Translate,
      TranslationMode.Subtitle,
      TranslationMode.ScreenCapture,
      'popup',
      'sidepanel',
      'subtitle', 
      'screen_capture'
    ];
    
    if (noActionModes.includes(translationMode)) {
      this.logger.debug(`No action needed for ${translationMode}`);
      
      return {
        success: true,
        message: `Translation for ${translationMode} handled by interface`,
        applied: false,
        mode: translationMode,
        note: 'Handled by specialized interface'
      };
    }
    
    // Unknown mode - log warning but don't fail
    this.logger.warn(`Unknown translation mode: ${translationMode}`);
    
    return {
      success: true,
      message: 'Unknown translation mode - no action taken',
      applied: false,
      mode: translationMode,
      note: 'Unknown mode'
    };
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
    this.logger.operation('Cleaned up');
  }
}

// Export singleton instance
export const contentMessageHandler = new ContentMessageHandler();