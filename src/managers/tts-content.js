// src/managers/tts-content.js
// Content script TTS implementation (fallback)

import browser from "webextension-polyfill";
import { MessageActions } from "@/messaging/core/MessageActions.js";

/**
 * Content Script TTS Manager
 * Uses Speech Synthesis API in content script context (ultimate fallback)
 */
export class ContentScriptTTSManager {
  constructor() {
    this.browser = null;
    this.currentUtterance = null;
    this.initialized = false;
    this.messageListener = null;
  }

  /**
   * Initialize the content script TTS manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.browser = browser;

      console.log("🔊 Initializing content script TTS manager");

      // Set up message listener for TTS requests from background
      this.setupMessageListener();

      this.initialized = true;
      console.log("✅ Content script TTS manager initialized");
    } catch (error) {
      console.error(
        "❌ Failed to initialize content script TTS manager:",
        error,
      );
      throw error;
    }
  }

  /**
   * Set up message listener for background script requests
   * @private
   */
  setupMessageListener() {
    this.messageListener = async (message, sender, sendResponse) => {
      if (message.action === MessageActions.TTS_SPEAK && message.source === "background") {
        try {
          await this.speak(message.data.text, message.data);
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({
            success: false,
            error: error.message,
          });
        }
        return true; // Keep message channel open for async response
      }

      if (message.action === MessageActions.TTS_STOP && message.source === "background") {
        await this.stop();
        sendResponse({ success: true });
        return true;
      }
    };

    browser.runtime.onMessage.addListener.call(
      browser.runtime.onMessage,
      this.messageListener,
    );
  }

  /**
   * Speak text using Speech Synthesis API in content script context
   * @param {string} text - Text to speak
   * @param {Object} options - TTS options
   * @returns {Promise<void>}
   */
  async speak(text, options = {}) {
    if (!text || !text.trim()) {
      throw new Error("Text to speak cannot be empty");
    }

    // Check if Speech Synthesis API is available
    if (typeof window === "undefined" || !window.speechSynthesis) {
      throw new Error("Speech Synthesis API not available in this context");
    }

    // Stop any current speech
    await this.stop();

    return new Promise((resolve, reject) => {
      try {
        const utterance = new SpeechSynthesisUtterance(text.trim());

        // Set options
        utterance.lang = options.lang || "en-US";
        utterance.rate = options.rate || 1;
        utterance.pitch = options.pitch || 1;
        utterance.volume = options.volume || 1;

        // Find and set voice if specified
        if (options.voice) {
          const voices = window.speechSynthesis.getVoices();
          const voice = voices.find(
            (v) =>
              v.name === options.voice ||
              v.lang === options.lang ||
              v.lang.startsWith(options.lang.split("-")[0]),
          );
          if (voice) {
            utterance.voice = voice;
          }
        }

        // Set up event handlers
        utterance.onstart = () => {
          console.log("🔊 Content script TTS started:", text.substring(0, 50));
        };

        utterance.onend = () => {
          console.log("✅ Content script TTS completed");
          this.currentUtterance = null;
          resolve();
        };

        utterance.onerror = (event) => {
          console.error("❌ Content script TTS error:", event.error);
          this.currentUtterance = null;
          reject(new Error(`TTS error: ${event.error}`));
        };

        utterance.onpause = () => {
          console.log("⏸️ Content script TTS paused");
        };

        utterance.onresume = () => {
          console.log("▶️ Content script TTS resumed");
        };

        // Store current utterance
        this.currentUtterance = utterance;

        // Start speech
        window.speechSynthesis.speak(utterance);

        console.log("🔊 Started content script TTS:", text.substring(0, 50));
      } catch (error) {
        reject(new Error(`Content script TTS failed: ${error.message}`));
      }
    });
  }

  /**
   * Stop current speech
   */
  async stop() {
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      this.currentUtterance = null;
      console.log("🛑 Content script TTS stopped");
    } catch (error) {
      console.error("❌ Failed to stop content script TTS:", error);
    }
  }

  /**
   * Pause current speech
   */
  async pause() {
    try {
      if (
        typeof window !== "undefined" &&
        window.speechSynthesis &&
        this.currentUtterance
      ) {
        window.speechSynthesis.pause();
        console.log("⏸️ Content script TTS paused");
      }
    } catch (error) {
      console.error("❌ Failed to pause content script TTS:", error);
    }
  }

  /**
   * Resume paused speech
   */
  async resume() {
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.resume();
        console.log("▶️ Content script TTS resumed");
      }
    } catch (error) {
      console.error("❌ Failed to resume content script TTS:", error);
    }
  }

  /**
   * Get available voices
   * @returns {Array} Array of available voices
   */
  getVoices() {
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        return window.speechSynthesis.getVoices().map((voice) => ({
          name: voice.name,
          lang: voice.lang,
          localService: voice.localService,
          default: voice.default,
          source: "content-script",
        }));
      }
      return [];
    } catch (error) {
      console.error("❌ Failed to get voices:", error);
      return [];
    }
  }

  /**
   * Check if TTS is currently speaking
   * @returns {boolean}
   */
  isSpeaking() {
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        return window.speechSynthesis.speaking;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if TTS is available
   * @returns {boolean}
   */
  isAvailable() {
    return (
      typeof window !== "undefined" &&
      !!window.speechSynthesis &&
      typeof window.SpeechSynthesisUtterance !== "undefined"
    );
  }

  /**
   * Get debug information
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      type: "content-script",
      initialized: this.initialized,
      isAvailable: this.isAvailable(),
      isSpeaking: this.isSpeaking(),
      currentUtterance: !!this.currentUtterance,
      speechSynthesis:
        typeof window !== "undefined" && !!window.speechSynthesis,
      voiceCount: this.getVoices().length,
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log("🧹 Cleaning up content script TTS manager");

    await this.stop();

    // Remove message listener
    if (this.messageListener && this.browser?.runtime?.onMessage) {
      browser.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }

    this.initialized = false;
    this.currentUtterance = null;
  }
}

// Auto-initialize in content script context
if (typeof window !== "undefined" && window.speechSynthesis) {
  const contentTTSManager = new ContentScriptTTSManager();
  contentTTSManager.initialize().catch(console.error);

  // Make available globally for debugging
  window.contentTTSManager = contentTTSManager;
}
