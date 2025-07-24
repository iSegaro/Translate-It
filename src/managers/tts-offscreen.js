// src/managers/tts-offscreen.js
// Chrome offscreen document TTS implementation

import { getBrowserAPI } from '../utils/browser-unified.js';

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
  }

  /**
   * Initialize the offscreen TTS manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.browser = await getBrowserAPI();
      
      // Check if offscreen API is available
      if (!this.browser.offscreen) {
        throw new Error('Offscreen API not available');
      }

      console.log('🔊 Initializing Chrome offscreen TTS manager');
      
      // Create offscreen document for audio playback
      await this.createOffscreenDocument();
      
      this.initialized = true;
      console.log('✅ Offscreen TTS manager initialized');

    } catch (error) {
      console.error('❌ Failed to initialize offscreen TTS manager:', error);
      throw error;
    }
  }

  /**
   * Create offscreen document for audio playback
   * @private
   */
  async createOffscreenDocument() {
    try {
      // Check if offscreen document already exists
      const existingContexts = await this.browser.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });

      if (existingContexts.length > 0) {
        console.log('📄 Offscreen document already exists');
        this.offscreenCreated = true;
        return;
      }

      // Create new offscreen document
      await this.browser.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'TTS audio playback for translation extension'
      });

      this.offscreenCreated = true;
      console.log('📄 Offscreen document created for TTS');

    } catch (error) {
      console.error('❌ Failed to create offscreen document:', error);
      throw error;
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
      throw new Error('Text to speak cannot be empty');
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
        lang: options.lang || 'en-US'
      };

      console.log('🔊 Speaking text via offscreen document:', text.substring(0, 50));

      // Send message to offscreen document
      const response = await this.browser.runtime.sendMessage({
        target: 'offscreen',
        action: 'TTS_SPEAK',
        data: ttsOptions
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to start TTS in offscreen document');
      }

      // Store current speech info
      this.currentSpeech = {
        text: text,
        options: ttsOptions,
        startTime: Date.now()
      };

      console.log('✅ TTS started successfully');

    } catch (error) {
      console.error('❌ TTS speak failed:', error);
      throw new Error(`TTS failed: ${error.message}`);
    }
  }

  /**
   * Stop current speech
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.initialized) return;

    try {
      // Stop speech in offscreen document
      await this.browser.runtime.sendMessage({
        target: 'offscreen',
        action: 'TTS_STOP'
      });

      this.currentSpeech = null;
      console.log('🛑 TTS stopped');

    } catch (error) {
      console.error('❌ Failed to stop TTS:', error);
    }
  }

  /**
   * Pause current speech
   * @returns {Promise<void>}
   */
  async pause() {
    if (!this.initialized || !this.currentSpeech) return;

    try {
      await this.browser.runtime.sendMessage({
        target: 'offscreen',
        action: 'TTS_PAUSE'
      });

      console.log('⏸️ TTS paused');

    } catch (error) {
      console.error('❌ Failed to pause TTS:', error);
    }
  }

  /**
   * Resume paused speech
   * @returns {Promise<void>}
   */
  async resume() {
    if (!this.initialized) return;

    try {
      await this.browser.runtime.sendMessage({
        target: 'offscreen',
        action: 'TTS_RESUME'
      });

      console.log('▶️ TTS resumed');

    } catch (error) {
      console.error('❌ Failed to resume TTS:', error);
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
      const response = await this.browser.runtime.sendMessage({
        target: 'offscreen',
        action: 'TTS_GET_VOICES'
      });

      if (!response || !response.success) {
        throw new Error('Failed to get voices');
      }

      return response.voices || [];

    } catch (error) {
      console.error('❌ Failed to get TTS voices:', error);
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
      type: 'offscreen',
      initialized: this.initialized,
      offscreenCreated: this.offscreenCreated,
      currentSpeech: this.currentSpeech,
      hasOffscreenAPI: !!this.browser?.offscreen
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up offscreen TTS manager');
    
    try {
      await this.stop();
      
      // Close offscreen document if we created it
      if (this.offscreenCreated && this.browser?.offscreen?.closeDocument) {
        await this.browser.offscreen.closeDocument();
        this.offscreenCreated = false;
      }

    } catch (error) {
      console.error('❌ Error during TTS cleanup:', error);
    }

    this.initialized = false;
    this.currentSpeech = null;
  }
}