// src/managers/tts-offscreen.js
// Chrome offscreen document TTS implementation

import browser from "webextension-polyfill";

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
   * @private
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

      // Quick responsive test with shorter timeout
      await this.testOffscreenConnection();
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

        // Quick responsive test with shorter timeout
        await this.testOffscreenConnection();
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
   * Test if offscreen document is responsive
   * @private
   */
  async testOffscreenConnection() {
    try {
      // First check if we received readiness signal
      if (this.offscreenReady) {
        console.log("✅ Offscreen document already signaled readiness");
        // Still test actual connection even if ready signal received
      }

      console.log("🔍 Testing offscreen document connection...");

      const response = await Promise.race([
        browser.runtime.sendMessage({
          action: "TTS_TEST",
          target: "offscreen",
          timestamp: Date.now(), // Add timestamp for request tracking
        }),
        new Promise(
          (_, reject) =>
            setTimeout(
              () => reject(new Error("Connection test timeout")),
              1000,
            ), // Increased timeout
        ),
      ]);

      if (response && response.success) {
        console.log("✅ Offscreen document is ready and responsive");
        this.offscreenReady = true; // Update ready state
        return true;
      } else {
        throw new Error("Invalid response from offscreen document");
      }
    } catch (error) {
      console.warn(
        "⚠️ Offscreen document connection test failed:",
        error.message,
      );
      // Don't throw here, let the actual TTS call handle the error
      return false;
    }
  }

  /**
   * Recreate offscreen document if needed (auto-recovery)
   * @returns {Promise<boolean>} True if offscreen is available after recreation
   */
  async recreateOffscreenIfNeeded() {
    try {
      console.log("🔄 Checking if offscreen document needs recreation...");

      // First, test current connection
      const isCurrentlyWorking = await this.testOffscreenConnection();
      if (isCurrentlyWorking) {
        console.log("✅ Offscreen document is working, no recreation needed");
        return true;
      }

      console.log(
        "⚠️ Offscreen document not responding, attempting recreation...",
      );

      // Reset state for clean recreation
      this.offscreenCreated = false;
      this.offscreenReady = false;

      // Close existing offscreen document if it exists
      try {
        const existingContexts = await browser.runtime.getContexts({
          contextTypes: ["OFFSCREEN_DOCUMENT"],
        });

        if (existingContexts.length > 0) {
          console.log("🗑️ Closing existing unresponsive offscreen document");
          await browser.offscreen.closeDocument();
          // Small delay to ensure cleanup
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (closeError) {
        console.warn(
          "⚠️ Failed to close existing offscreen document:",
          closeError,
        );
        // Continue with recreation anyway
      }

      // Recreate offscreen document
      await this.createOffscreenDocument();

      // Test the new connection
      const isRecreatedWorking = await this.testOffscreenConnection();
      if (isRecreatedWorking) {
        console.log("✅ Offscreen document recreation successful");
        return true;
      } else {
        console.error(
          "❌ Offscreen document recreation failed - still not responding",
        );
        return false;
      }
    } catch (error) {
      console.error("❌ Failed to recreate offscreen document:", error);
      return false;
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

    // Retry mechanism with exponential backoff
    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🔊 TTS speak attempt ${attempt}/${maxRetries} for:`,
          text.substring(0, 50),
        );

        // Stop any current speech
        await this.stop();

        // Auto-recreate offscreen if needed BEFORE attempting to speak
        const isOffscreenReady = await this.recreateOffscreenIfNeeded();
        if (!isOffscreenReady) {
          console.warn(
            "⚠️ Offscreen document not available, falling back to alternative TTS",
          );
          await this.fallbackToAlternativeTTS(text, options);
          return;
        }

        const ttsOptions = {
          text: text.trim(),
          voice: options.voice || null,
          rate: options.rate || 1,
          pitch: options.pitch || 1,
          volume: options.volume || 1,
          lang: options.lang || "en-US",
        };

        console.log(
          `🔊 Speaking text via offscreen document (attempt ${attempt}):`,
          text.substring(0, 50),
        );

        // Send message to offscreen document with explicit target and timeout
        const response = await Promise.race([
          browser.runtime.sendMessage({
            action: "TTS_SPEAK",
            target: "offscreen", // Explicitly target offscreen context
            data: ttsOptions,
            timestamp: Date.now(),
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("TTS request timeout")), 2000),
          ),
        ]);

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

        console.log(`✅ TTS started successfully on attempt ${attempt}`);
        return; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        console.error(`❌ TTS speak failed on attempt ${attempt}:`, error);

        // If this is a message port error and we have retries left, try again
        if (
          attempt < maxRetries &&
          (error.message.includes("message port closed") ||
            error.message.includes("Could not establish connection") ||
            error.message.includes("timeout"))
        ) {
          console.log(
            `🔄 Retrying TTS in ${attempt * 500}ms... (${maxRetries - attempt} attempts left)`,
          );

          // Reset offscreen state for retry
          this.offscreenReady = false;
          this.offscreenCreated = false;

          // Wait before retry with exponential backoff
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
          continue;
        }

        // If it's the last attempt or non-retryable error, break
        break;
      }
    }

    // If all retries failed, try fallback methods
    console.log("🔄 All TTS attempts failed, trying fallback...");
    try {
      await this.fallbackToAlternativeTTS(text, options);
    } catch (fallbackError) {
      console.error("❌ TTS fallback also failed:", fallbackError);
      throw new Error(
        `TTS failed: ${lastError.message}. Fallback: ${fallbackError.message}`,
      );
    }
  }

  /**
   * Stop current speech
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.initialized) return;

    try {
      // Stop speech in offscreen document with timeout
      await Promise.race([
        browser.runtime.sendMessage({
          action: "TTS_STOP",
          target: "offscreen",
          timestamp: Date.now(),
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Stop request timeout")), 1000),
        ),
      ]);

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
      // Ensure offscreen is ready before playing cached audio
      const isOffscreenReady = await this.recreateOffscreenIfNeeded();
      if (!isOffscreenReady) {
        throw new Error(
          "Offscreen document not available for cached audio playback",
        );
      }

      console.log(
        "🔊 Playing cached audio blob via offscreen:",
        audioBlob.size,
        "bytes",
      );

      // Convert blob to ArrayBuffer for message passing
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = Array.from(new Uint8Array(arrayBuffer));

      // Send cached audio to offscreen document
      const response = await browser.runtime.sendMessage({
        action: "TTS_PLAY_CACHED_AUDIO",
        target: "offscreen",
        data: { audioData },
      });

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
      await browser.runtime.sendMessage({
        target: "offscreen",
        action: "TTS_PAUSE",
      });

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
      await browser.runtime.sendMessage({
        target: "offscreen",
        action: "TTS_RESUME",
      });

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
      const response = await browser.runtime.sendMessage({
        target: "offscreen",
        action: "TTS_GET_VOICES",
      });

      if (!response || !response.success) {
        throw new Error("Failed to get voices");
      }

      return response.voices || [];
    } catch (error) {
      console.error("❌ Failed to get TTS voices:", error);
      return [];
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

  /**
   * Fallback to alternative TTS method when offscreen fails
   * @private
   */
  async fallbackToAlternativeTTS(text, options) {
    console.log("🔄 Using alternative TTS methods");

    // First try: Content script TTS through MessageRouter
    try {
      console.log("🔄 Trying content script TTS fallback via MessageRouter");

      // Send TTS request through MessageRouter to content script handler
      const response = await Promise.race([
        browser.runtime.sendMessage({
          action: "TTS_SPEAK_CONTENT",
          data: {
            text: text,
            lang: options.lang || "en-US",
            rate: options.rate || 1,
            pitch: options.pitch || 1,
            volume: options.volume || 1,
          },
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Content script TTS timeout")),
            5000,
          ),
        ),
      ]);

      if (response && response.success) {
        console.log(
          "✅ Content script TTS fallback successful via MessageRouter",
        );
        return; // Success
      } else {
        throw new Error(response?.error || "Content script TTS failed");
      }
    } catch (contentScriptError) {
      console.error(
        "❌ Content script TTS fallback failed via MessageRouter:",
        contentScriptError,
      );

      // Second try: Offscreen Google TTS (send to offscreen for Audio API)
      try {
        console.log("🔄 Trying offscreen Google TTS fallback");

        const lang = options.lang || "en";
        const langCode = lang.includes("-") ? lang.split("-")[0] : lang;

        // Create Google TTS URL
        const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(langCode)}&q=${encodeURIComponent(text)}&client=gtx&ttsspeed=${options.rate || 1}`;

        // Send URL to offscreen for audio playback
        const response = await browser.runtime.sendMessage({
          action: "playOffscreenAudio",
          target: "offscreen",
          url: googleTTSUrl,
        });

        if (response && response.success) {
          console.log("✅ Offscreen Google TTS fallback successful");
          return; // Success
        } else {
          throw new Error(response?.error || "Offscreen Google TTS failed");
        }
      } catch (offscreenError) {
        console.error(
          "❌ Offscreen Google TTS fallback failed:",
          offscreenError,
        );

        // Final fallback: Simple error notification
        throw new Error(
          `All TTS methods failed. Content script: ${contentScriptError.message}, Offscreen Google TTS: ${offscreenError.message}`,
        );
      }
    }
  }
}
