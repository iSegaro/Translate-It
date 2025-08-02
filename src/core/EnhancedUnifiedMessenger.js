/**
 * Enhanced Unified Messenger - Advanced messaging system for cross-browser extension communication
 * Extends UnifiedMessenger with specialized methods for different feature domains
 * Provides context-aware messaging with improved error handling and Firefox MV3 compatibility
 */

import { UnifiedMessenger } from './UnifiedMessenger.js';
import browser from 'webextension-polyfill';
import { isFirefox } from '../utils/browser/compatibility.js';
import { MessageActions } from '@/messaging/core/MessageActions.js';
import { TTSMessenger } from '../messaging/specialized/TTSMessenger.js';
import { CaptureMessenger } from '../messaging/specialized/CaptureMessenger.js';
import { SelectionMessenger } from '../messaging/specialized/SelectionMessenger.js';
import { TranslationMessenger } from '../messaging/specialized/TranslationMessenger.js';

// Specialized messengers are now imported from dedicated files

/**
 * Enhanced Unified Messenger
 * Extends the base UnifiedMessenger with specialized messaging domains
 */
export class EnhancedUnifiedMessenger extends UnifiedMessenger {
  constructor(context) {
    super(context);
    
    // Initialize Firefox compatibility properties
    this.isFirefox = false;
    this.isMV3 = true; // Assume MV3 for all modern extensions
    this.firefoxCompatibilityMode = false;
    
    // Initialize specialized messengers
    this.specialized = {
      tts: new TTSMessenger(context, this),
      capture: new CaptureMessenger(context, this),
      selection: new SelectionMessenger(context, this),
      translation: new TranslationMessenger(context, this)
    };

    // Initialize Firefox detection
    this.initializeFirefoxDetection();
  }

  /**
   * Initialize Firefox browser detection for enhanced compatibility
   * @private
   */
  async initializeFirefoxDetection() {
    try {
      this.isFirefox = await isFirefox();
      this.firefoxCompatibilityMode = this.isFirefox && this.isMV3;
      
      if (this.firefoxCompatibilityMode) {
        console.log(`[EnhancedMessenger:${this.context}] Firefox MV3 compatibility mode enabled`);
      }
    } catch (error) {
      console.warn(`[EnhancedMessenger:${this.context}] Firefox detection failed:`, error);
      // Default to assuming Chrome for compatibility
      this.isFirefox = false;
      this.firefoxCompatibilityMode = false;
    }
  }

  /**
   * Enhanced sendMessage with better error handling and Firefox MV3 compatibility
   * @param {Object} message - Message to send
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Message response
   */
  async sendMessage(message, timeout = 10000) {
    try {
      // Ensure Firefox detection is complete
      if (this.isFirefox === null) {
        await this.initializeFirefoxDetection();
      }

      // Add enhanced message metadata with Firefox compatibility flags
      const enhancedMessage = {
        ...message,
        context: this.context,
        timestamp: message.timestamp || Date.now(),
        version: '2.0', // Enhanced messenger version
        messageId: message.messageId || `${this.context}-${++this.messageCounter}-${Date.now()}`,
        // Firefox compatibility metadata
        browserInfo: {
          isFirefox: this.isFirefox,
          isMV3: this.isMV3,
          compatibilityMode: this.firefoxCompatibilityMode
        }
      };

      // Log message for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[EnhancedMessenger:${this.context}] Sending:`, enhancedMessage.action, enhancedMessage.data);
      }

      // Firefox MV3 specific handling
      if (this.firefoxCompatibilityMode) {
        return await this.handleFirefoxMV3Message(enhancedMessage, timeout);
      }

      // Use parent sendMessage with enhanced message for Chrome
      const response = await super.sendMessage(enhancedMessage, timeout);

      // Log response for debugging (only in development)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[EnhancedMessenger:${this.context}] Response:`, response);
      }

      return response;
    } catch (error) {
      console.error(`[EnhancedMessenger:${this.context}] ❌ Enhanced message error:`, error);
      
      // Add enhanced error information
      const enhancedError = new Error(error.message);
      enhancedError.context = this.context;
      enhancedError.action = message.action;
      enhancedError.originalError = error;
      enhancedError.timestamp = Date.now();
      enhancedError.isFirefox = this.isFirefox;
      enhancedError.firefoxCompatibilityMode = this.firefoxCompatibilityMode;
      
      throw enhancedError;
    }
  }

  /**
   * Handle Firefox MV3 specific messaging with enhanced workarounds
   * @param {Object} message - Enhanced message object
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Message response
   * @private
   */
  async handleFirefoxMV3Message(message, timeout) {
    console.log(`[EnhancedMessenger:${this.context}] Using Firefox MV3 enhanced handling for:`, message.action);

    // Enhanced Firefox MV3 workarounds based on action type
    switch (message.action) {
      case MessageActions.TRANSLATE:
      case MessageActions.FETCH_TRANSLATION:
        return await this.handleFirefoxTranslationMessage(message, timeout);
      
      case MessageActions.TTS_SPEAK:
      case MessageActions.TTS_STOP:
      case MessageActions.TTS_PAUSE:
      case MessageActions.TTS_RESUME:
        return await this.handleFirefoxTTSMessage(message, timeout);
      
      case MessageActions.SCREEN_CAPTURE:
      case MessageActions.START_CAPTURE_SELECTION:
        return await this.handleFirefoxCaptureMessage(message, timeout);
      
      case MessageActions.ACTIVATE_SELECT_ELEMENT_MODE:
      case MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE:
        return await this.handleFirefoxSelectionMessage(message, timeout);
      
      default:
        return await this.handleFirefoxGenericMessage(message, timeout);
    }
  }

  /**
   * Handle Firefox translation messages with result listener
   * @param {Object} message - Translation message
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Translation result
   * @private
   */
  async handleFirefoxTranslationMessage(message, timeout) {
    // Create promise that resolves when TRANSLATION_RESULT_UPDATE is received
    const resultPromise = new Promise((resolve, reject) => {
      const listener = (msg) => {
        if (
          msg.action === MessageActions.TRANSLATION_RESULT_UPDATE &&
          msg.context === message.context &&
          msg.messageId === message.messageId
        ) {
          browser.runtime.onMessage.removeListener(listener);
          resolve(msg);
        }
      };
      
      browser.runtime.onMessage.addListener(listener);
      
      // Set timeout for result
      setTimeout(() => {
        browser.runtime.onMessage.removeListener(listener);
        reject(new Error('Firefox translation result timeout'));
      }, timeout + 5000); // Extra time for Firefox processing
    });

    // Send initial message (may return undefined in Firefox MV3)
    try {
      await super.sendMessage(message, 5000); // Shorter timeout for initial send
    } catch (initialError) {
      console.warn(`[EnhancedMessenger:${this.context}] Firefox initial send warning:`, initialError.message);
      // Continue to wait for actual result even if initial send fails
    }

    // Wait for actual result
    return await resultPromise;
  }

  /**
   * Handle Firefox TTS messages with enhanced error handling
   * @param {Object} message - TTS message
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} TTS result
   * @private
   */
  async handleFirefoxTTSMessage(message, timeout) {
    try {
      // Firefox TTS often works but returns undefined
      const response = await super.sendMessage(message, timeout);
      
      if (response === undefined) {
        // Provide expected response format for Firefox
        return {
          success: true,
          message: `Firefox MV3: ${message.action} processed`,
          firefoxWorkaround: true
        };
      }
      
      return response;
    } catch (error) {
      // Enhanced error handling for Firefox TTS issues
      if (error.message.includes('Could not establish connection')) {
        console.warn(`[EnhancedMessenger:${this.context}] Firefox TTS connection issue, providing fallback response`);
        return {
          success: false,
          error: 'Firefox TTS connection issue - consider page refresh',
          firefoxCompatibilityIssue: true
        };
      }
      throw error;
    }
  }

  /**
   * Handle Firefox capture messages
   * @param {Object} message - Capture message
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Capture result
   * @private
   */
  async handleFirefoxCaptureMessage(message, timeout) {
    try {
      const response = await super.sendMessage(message, timeout);
      
      if (response === undefined) {
        // Firefox capture often requires different handling
        return {
          success: true,
          message: `Firefox MV3: ${message.action} initiated`,
          firefoxWorkaround: true,
          note: 'Firefox capture may require additional permissions'
        };
      }
      
      return response;
    } catch (error) {
      console.warn(`[EnhancedMessenger:${this.context}] Firefox capture error:`, error.message);
      throw error;
    }
  }

  /**
   * Handle Firefox selection messages
   * @param {Object} message - Selection message
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Selection result
   * @private
   */
  async handleFirefoxSelectionMessage(message, timeout) {
    try {
      const response = await super.sendMessage(message, timeout);
      
      if (response === undefined) {
        // Firefox selection mode activation often returns undefined but works
        return {
          success: true,
          message: `Firefox MV3: ${message.action} processed`,
          firefoxWorkaround: true
        };
      }
      
      return response;
    } catch (error) {
      console.warn(`[EnhancedMessenger:${this.context}] Firefox selection error:`, error.message);
      throw error;
    }
  }

  /**
   * Handle Firefox generic messages
   * @param {Object} message - Generic message
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Generic result
   * @private
   */
  async handleFirefoxGenericMessage(message, timeout) {
    try {
      const response = await super.sendMessage(message, timeout);
      
      if (response === undefined) {
        // Provide generic success response for undefined Firefox responses
        return {
          success: true,
          message: `Firefox MV3: ${message.action} processed (undefined response)`,
          firefoxWorkaround: true
        };
      }
      
      return response;
    } catch (error) {
      // Enhanced Firefox error categorization
      if (error.message.includes('message port closed')) {
        throw new Error(`Firefox MV3 port closed - extension may need reload`);
      } else if (error.message.includes('Could not establish connection')) {
        throw new Error(`Firefox MV3 connection failed - background script may be inactive`);
      }
      
      throw error;
    }
  }

  /**
   * Send ping message for connection testing
   * @returns {Promise<Object>} Ping response
   */
  async ping() {
    return this.sendMessage({
      action: MessageActions.PING,
      data: { from: this.context }
    });
  }

  /**
   * Get enhanced messenger information with Firefox compatibility details
   * @returns {Object} Enhanced messenger info
   */
  getInfo() {
    return {
      ...super.getInfo(),
      version: '2.0',
      specialized: Object.keys(this.specialized),
      enhanced: true,
      browserInfo: {
        isFirefox: this.isFirefox,
        isMV3: this.isMV3,
        firefoxCompatibilityMode: this.firefoxCompatibilityMode
      }
    };
  }

  /**
   * Test all specialized messengers
   * @returns {Promise<Object>} Test results for all specialized messengers
   */
  async testSpecializedMessengers() {
    const results = {};
    
    try {
      // Test basic connectivity
      results.ping = await this.ping();
      
      // Test specialized messengers (basic availability tests)
      results.tts = { available: typeof this.specialized.tts.getVoices === 'function' };
      results.capture = { available: typeof this.specialized.capture.captureScreen === 'function' };
      results.selection = { available: typeof this.specialized.selection.getSelectionState === 'function' };
      results.translation = { available: typeof this.specialized.translation.getProviders === 'function' };
      
      return {
        success: true,
        context: this.context,
        results
      };
    } catch (error) {
      return {
        success: false,
        context: this.context,
        error: error.message,
        results
      };
    }
  }
}

export default EnhancedUnifiedMessenger;