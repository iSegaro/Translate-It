// src/managers/tts-offscreen.js
// Chrome offscreen document TTS implementation

import browser from "webextension-polyfill";
import { MessageContexts, MessagingCore } from "../../../messaging/core/MessagingCore.js";

/**
 * Offscreen TTS Manager for Chrome
 * Uses Chrome's offscreen documents API for audio playback
 */
export class OffscreenTTSManager {
  constructor() {
    this.browser = null;
    this.offscreenCreated = false;
    this.currentSpeech = null;
    this.initialized = false;
    this.readinessListenerAdded = false;
    this.offscreenReady = false;
    
    // Enhanced messaging with context-aware TTS
    this.messenger = MessagingCore.getMessenger(MessageContexts.TTS_MANAGER);
  }

  /**
   * Initialize the offscreen TTS manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.browser = browser;

      // Check if offscreen API is available
      if (!browser.offscreen) {
        throw new Error("Offscreen API not available");
      }

      console.log("🔊 Initializing Chrome offscreen TTS manager");

      // Setup readiness listener for faster detection
      this.setupReadinessListener();

      // Create offscreen document for audio playback
      await this.createOffscreenDocument();

      this.initialized = true;
      console.log("✅ Offscreen TTS manager initialized");
    } catch (error) {
      console.error("❌ Failed to initialize offscreen TTS manager:", error);
      throw error;
    }
  }

  /**
   * Force reinitialize offscreen document (e.g., when it gets closed)
   */
  async forceReinitialize() {
    console.log("🔄 Force reinitializing offscreen TTS manager...");
    
    // Reset states
    this.initialized = false;
    this.offscreenCreated = false;
    this.offscreenReady = false;
    
    // Re-initialize
    await this.initialize();
  }

  /**
   * Setup listener for offscreen readiness signal
   * Now handled through central MessageRouter
   * @private
   */
  setupReadinessListener() {
    if (this.readinessListenerAdded) return;

    // Register a global callback for offscreen readiness
    // This will be called by the central handleOffscreenReady handler
    if (!globalThis.offscreenReadyCallbacks) {
      globalThis.offscreenReadyCallbacks = [];
    }

    globalThis.offscreenReadyCallbacks.push(() => {
      console.log("⚡ Offscreen document signaled readiness via MessageRouter");
      this.offscreenReady = true;
    });

    this.readinessListenerAdded = true;
    console.log(
      "✅ Offscreen readiness callback registered with MessageRouter",
    );
  }

  /**
   * Handle offscreen readiness signal (called by MessageRouter handler)
   * @public
   */
  handleOffscreenReady() {
    console.log("⚡ TTS Manager: Offscreen document is ready");
    this.offscreenReady = true;
  }

  /**
   * Create offscreen document for audio playback
   * @public
   */
  async createOffscreenDocument() {
    try {
      // Check if offscreen document already exists
      const existingContexts = await browser.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
      });

      if (existingContexts.length > 0) {
        console.log("📄 Offscreen document already exists");
        this.offscreenCreated = true;
        return;
      }

      // Create new offscreen document with absolute path
      await browser.offscreen.createDocument({
        url: "html/offscreen.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "TTS audio playback for translation extension",
      });

      this.offscreenCreated = true;
      console.log("📄 Offscreen document created for TTS");

      // Minimal wait for script initialization
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Quick test to ensure offscreen document is responding
      try {
        const testResponse = await this.messenger.specialized.tts.getVoices();
        if (!testResponse || !testResponse.success) {
          console.warn("⚠️ Offscreen document created but not responding properly");
        } else {
          console.log("✅ Offscreen document created and responding");
        }
      } catch (testError) {
        console.warn("⚠️ Could not test offscreen document readiness:", testError.message);
      }

    } catch (error) {
      console.error("❌ Failed to create offscreen document:", error);

      // Try alternative approach
      try {
        await browser.offscreen.createDocument({
          url: chrome.runtime.getURL("html/offscreen.html"),
          reasons: ["AUDIO_PLAYBACK"],
          justification: "TTS audio playback for translation extension",
        });

        this.offscreenCreated = true;
        console.log("📄 Offscreen document created with alternative URL");
        await new Promise((resolve) => setTimeout(resolve, 100));
        
        // Quick test to ensure offscreen document is responding
        try {
          const testResponse = await this.messenger.specialized.tts.getVoices();
          if (!testResponse || !testResponse.success) {
            console.warn("⚠️ Alternative offscreen document created but not responding properly");
          } else {
            console.log("✅ Alternative offscreen document created and responding");
          }
        } catch (testError) {
          console.warn("⚠️ Could not test alternative offscreen document readiness:", testError.message);
        }
        
      } catch (alternativeError) {
        console.error(
          "❌ Alternative offscreen creation also failed:",
          alternativeError,
        );
        throw new Error(
          `Offscreen document creation failed: ${error.message}. Alternative attempt: ${alternativeError.message}`,
        );
      }
    }
  }



  /**
   * Speak text using offscreen document
   * @param {string} text - Text to speak
   * @param {Object} options - TTS options
   * @returns {Promise<void>}
   */
  async speak(text, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!text || !text.trim()) {
      throw new Error("Text to speak cannot be empty");
    }

    try {
      // Stop any current speech
      await this.stop();

      const ttsOptions = {
        text: text.trim(),
        voice: options.voice || null,
        rate: options.rate || 1,
        pitch: options.pitch || 1,
        volume: options.volume || 1,
        lang: options.lang || "en-US",
      };

      console.log(`🔊 Speaking text via offscreen document:`, text.substring(0, 50));

      // Use specialized TTS messenger for speaking
      const response = await this.messenger.specialized.tts.speak(text, ttsOptions.lang, ttsOptions);

      if (!response || !response.success) {
        throw new Error(
          response?.error || "Failed to start TTS in offscreen document",
        );
      }

      // Store current speech info
      this.currentSpeech = {
        text: text,
        options: ttsOptions,
        startTime: Date.now(),
      };

      console.log(`✅ TTS started successfully`);
    } catch (error) {
      console.error("❌ TTS speak failed:", error);
      throw error;
    }
  }

  /**
   * Stop current speech
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.initialized) return;

    try {
      // Use specialized TTS messenger for stopping
      await this.messenger.specialized.tts.stop();

      this.currentSpeech = null;
      console.log("🛑 TTS stopped");
    } catch (error) {
      // Don't throw on stop errors, just log them
      console.warn("⚠️ Failed to stop TTS (non-critical):", error);
      this.currentSpeech = null; // Clear state anyway
    }
  }

  /**
   * Play cached audio blob via offscreen document
   * @param {Blob} audioBlob - Audio blob to play
   * @returns {Promise<void>}
   */
  async playAudioBlob(audioBlob) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!audioBlob || !(audioBlob instanceof Blob)) {
      throw new Error("Valid audio blob is required");
    }

    try {
      console.log(
        "🔊 Playing cached audio blob via offscreen:",
        audioBlob.size,
        "bytes",
      );

      // Convert blob to ArrayBuffer for message passing
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = Array.from(new Uint8Array(arrayBuffer));

      // Use specialized TTS messenger for cached audio playback
      const audioBlob = new Blob([new Uint8Array(audioData)], { type: 'audio/wav' });
      const response = await this.messenger.specialized.tts.playAudioBlob(audioBlob);

      if (!response || !response.success) {
        throw new Error(
          response?.error ||
            "Failed to play cached audio in offscreen document",
        );
      }

      console.log("✅ Cached audio playback completed");
    } catch (error) {
      console.error("❌ Cached audio playback failed:", error);
      throw error;
    }
  }

  /**
   * Pause current speech
   * @returns {Promise<void>}
   */
  async pause() {
    if (!this.initialized || !this.currentSpeech) return;

    try {
      await this.messenger.specialized.tts.pause();

      console.log("⏸️ TTS paused");
    } catch (error) {
      console.error("❌ Failed to pause TTS:", error);
    }
  }

  /**
   * Resume paused speech
   * @returns {Promise<void>}
   */
  async resume() {
    if (!this.initialized) return;

    try {
      await this.messenger.specialized.tts.resume();

      console.log("▶️ TTS resumed");
    } catch (error) {
      console.error("❌ Failed to resume TTS:", error);
    }
  }

  /**
   * Get available voices
   * @returns {Promise<Array>} Array of available voices
   */
  async getVoices() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      return await this.messenger.specialized.tts.getVoices();
    } catch (error) {
      console.error("❌ Failed to get TTS voices:", error);
      return { success: false, voices: [], error: error.message };
    }
  }

  /**
   * Check if TTS is currently speaking
   * @returns {boolean}
   */
  isSpeaking() {
    return !!this.currentSpeech;
  }

  /**
   * Get current speech information
   * @returns {Object|null}
   */
  getCurrentSpeech() {
    return this.currentSpeech;
  }

  /**
   * Check if TTS is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.initialized && this.offscreenCreated;
  }

  /**
   * Get debug information
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      type: "offscreen",
      initialized: this.initialized,
      offscreenCreated: this.offscreenCreated,
      currentSpeech: this.currentSpeech,
      hasOffscreenAPI: !!this.browser?.offscreen,
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log("🧹 Cleaning up offscreen TTS manager");

    try {
      await this.stop();

      // Close offscreen document if we created it
      if (this.offscreenCreated && this.browser?.offscreen?.closeDocument) {
        await browser.offscreen.closeDocument();
        this.offscreenCreated = false;
      }
    } catch (error) {
      console.error("❌ Error during TTS cleanup:", error);
    }

    this.initialized = false;
    this.currentSpeech = null;
  }

}
