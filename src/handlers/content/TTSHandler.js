// src/handlers/content/TTSHandler.js
// Content script TTS handler for fallback TTS functionality

import browser from "webextension-polyfill";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { createLogger } from '../../utils/core/logger.js';

/**
 * Content Script TTS Handler
 * Provides fallback TTS functionality using Web Speech API in content script context
 */
class ContentTTSHandler {
  constructor() {
    this.browser = null;
    this.currentUtterance = null;
    this.initialized = false;
    this.logger = createLogger('Content', 'TTSHandler');
    this.setupMessageListener();
  }

  /**
   * Initialize the content TTS handler
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.browser = browser;
      this.initialized = true;
      this.logger.init('TTS handler initialized');
    } catch (error) {
      this.logger.error('Failed to initialize TTS handler', error);
      throw error;
    }
  }

  /**
   * Setup message listener for TTS requests
   * Now integrated with central message routing
   */
  setupMessageListener() {
    // Use chrome.runtime directly since this is a content script
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.onMessage
    ) {
      chrome.runtime.onMessage.addListener.call(
        chrome.runtime.onMessage,
        (message, sender, sendResponse) => {
          // Only handle TTS_SPEAK_CONTENT messages that are explicitly targeted for content script
          if (message.action === MessageActions.TTS_SPEAK_CONTENT) {
            this.logger.debug('Received TTS speak request', message);
            this.handleTTSSpeak(message.data, sendResponse);
            return true; // Keep async channel open
          }
          return false; // Let other handlers process other messages
        },
      );

      this.logger.debug('Message listener setup complete');
    } else {
      this.logger.warn('Chrome runtime not available, TTS fallback disabled');
    }
  }

  /**
   * Handle TTS speak request
   * @param {Object} data - TTS data
   * @param {Function} sendResponse - Response callback
   */
  async handleTTSSpeak(data, sendResponse) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      this.logger.debug('Processing TTS speak request', data);

      if (!data || !data.text || !data.text.trim()) {
        throw new Error("Text to speak cannot be empty");
      }

      // Stop any current speech
      await this.stop();

      // Check if Web Speech API is available
      if (!("speechSynthesis" in window)) {
        throw new Error("Web Speech API not available in this context");
      }

      // Create utterance
      this.currentUtterance = new SpeechSynthesisUtterance(data.text.trim());

      // Set voice options with safety checks
      if (data.lang) {
        this.currentUtterance.lang = data.lang;
      }
      if (data.rate && data.rate >= 0.1 && data.rate <= 10) {
        this.currentUtterance.rate = data.rate;
      }
      if (data.pitch && data.pitch >= 0 && data.pitch <= 2) {
        this.currentUtterance.pitch = data.pitch;
      }
      if (data.volume && data.volume >= 0 && data.volume <= 1) {
        this.currentUtterance.volume = data.volume;
      }

      let responseAlreadySent = false;

      // Setup event handlers
      this.currentUtterance.onstart = () => {
        this.logger.debug('TTS speech started');
      };

      this.currentUtterance.onend = () => {
        this.logger.debug('TTS speech ended successfully');
        this.currentUtterance = null;
        if (!responseAlreadySent) {
          responseAlreadySent = true;
          sendResponse({ success: true });
        }
      };

      this.currentUtterance.onerror = (error) => {
        this.logger.error('TTS speech error', error);
        this.currentUtterance = null;
        if (!responseAlreadySent) {
          responseAlreadySent = true;
          sendResponse({
            success: false,
            error: `Content script TTS failed: ${error.error || error.message}`,
          });
        }
      };

      // Add timeout as safety measure
      const timeout = setTimeout(() => {
        if (!responseAlreadySent && this.currentUtterance) {
          this.logger.warn('TTS timeout, cancelling speech');
          speechSynthesis.cancel();
          this.currentUtterance = null;
          responseAlreadySent = true;
          sendResponse({ success: false, error: "Content script TTS timeout" });
        }
      }, 15000); // 15 second timeout

      // Clear timeout when speech ends or errors
      const originalOnEnd = this.currentUtterance.onend;
      this.currentUtterance.onend = (event) => {
        clearTimeout(timeout);
        if (originalOnEnd) originalOnEnd(event);
      };

      const originalOnError = this.currentUtterance.onerror;
      this.currentUtterance.onerror = (event) => {
        clearTimeout(timeout);
        if (originalOnError) originalOnError(event);
      };

      // Start speech synthesis
      speechSynthesis.speak(this.currentUtterance);

      this.logger.debug('TTS speech started via Web Speech API');
    } catch (error) {
      this.logger.error('Failed to handle TTS speak request', error);
      sendResponse({
        success: false,
        error: error.message || "Content script TTS handler failed",
      });
    }
  }

  /**
   * Stop current speech
   */
  async stop() {
    try {
      if (this.currentUtterance) {
        speechSynthesis.cancel();
        this.currentUtterance = null;
        this.logger.debug('TTS speech stopped');
      }
    } catch (error) {
      this.logger.warn('Error stopping TTS (non-critical)', error);
    }
  }

  /**
   * Check if TTS is currently speaking
   */
  isSpeaking() {
    return !!this.currentUtterance && speechSynthesis.speaking;
  }

  /**
   * Get debug information
   */
  getDebugInfo() {
    return {
      type: "content-script",
      initialized: this.initialized,
      currentUtterance: !!this.currentUtterance,
      speechSynthesisAvailable: typeof speechSynthesis !== "undefined",
      speechSynthesisSpeaking:
        typeof speechSynthesis !== "undefined"
          ? speechSynthesis.speaking
          : false,
    };
  }
}

// Create and export singleton instance
export const contentTTSHandler = new ContentTTSHandler();

// Initialize immediately
contentTTSHandler.initialize().catch((error) => {
  contentTTSHandler.logger.error('Failed to initialize content TTS handler', error);
});
