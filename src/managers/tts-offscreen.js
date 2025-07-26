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
    this.readinessListenerAdded = false;
    this.offscreenReady = false;
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
      
      // Setup readiness listener for faster detection
      this.setupReadinessListener();
      
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
   * Setup listener for offscreen readiness signal
   * @private
   */
  setupReadinessListener() {
    if (this.readinessListenerAdded) return;

    this.browser.runtime.onMessage.addListener((message) => {
      if (message.action === 'OFFSCREEN_READY') {
        console.log('⚡ Offscreen document signaled readiness');
        this.offscreenReady = true;
      }
    });

    this.readinessListenerAdded = true;
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

      // Create new offscreen document with absolute path
      await this.browser.offscreen.createDocument({
        url: 'html/offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'TTS audio playback for translation extension'
      });

      this.offscreenCreated = true;
      console.log('📄 Offscreen document created for TTS');

      // Minimal wait for script initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Quick responsive test with shorter timeout
      await this.testOffscreenConnection();

    } catch (error) {
      console.error('❌ Failed to create offscreen document:', error);
      
      // Try alternative approach
      try {
        await this.browser.offscreen.createDocument({
          url: chrome.runtime.getURL('html/offscreen.html'),
          reasons: ['AUDIO_PLAYBACK'], 
          justification: 'TTS audio playback for translation extension'
        });
        
        this.offscreenCreated = true;
        console.log('📄 Offscreen document created with alternative URL');
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Quick responsive test with shorter timeout
        await this.testOffscreenConnection();
        
      } catch (alternativeError) {
        console.error('❌ Alternative offscreen creation also failed:', alternativeError);
        throw new Error(`Offscreen document creation failed: ${error.message}. Alternative attempt: ${alternativeError.message}`);
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
        console.log('✅ Offscreen document already signaled readiness');
        return true;
      }
      
      console.log('🔍 Testing offscreen document connection...');
      
      const response = await Promise.race([
        this.browser.runtime.sendMessage({
          action: 'TTS_TEST',
          target: 'offscreen'
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection test timeout')), 800)
        )
      ]);
      
      console.log('✅ Offscreen document is ready and responsive');
      return true;
      
    } catch (error) {
      console.warn('⚠️ Offscreen document connection test failed:', error.message);
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
      console.log('🔄 Checking if offscreen document needs recreation...');
      
      // First, test current connection
      const isCurrentlyWorking = await this.testOffscreenConnection();
      if (isCurrentlyWorking) {
        console.log('✅ Offscreen document is working, no recreation needed');
        return true;
      }
      
      console.log('⚠️ Offscreen document not responding, attempting recreation...');
      
      // Reset state for clean recreation
      this.offscreenCreated = false;
      this.offscreenReady = false;
      
      // Close existing offscreen document if it exists
      try {
        const existingContexts = await this.browser.runtime.getContexts({
          contextTypes: ['OFFSCREEN_DOCUMENT']
        });
        
        if (existingContexts.length > 0) {
          console.log('🗑️ Closing existing unresponsive offscreen document');
          await this.browser.offscreen.closeDocument();
          // Small delay to ensure cleanup
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (closeError) {
        console.warn('⚠️ Failed to close existing offscreen document:', closeError);
        // Continue with recreation anyway
      }
      
      // Recreate offscreen document
      await this.createOffscreenDocument();
      
      // Test the new connection
      const isRecreatedWorking = await this.testOffscreenConnection();
      if (isRecreatedWorking) {
        console.log('✅ Offscreen document recreation successful');
        return true;
      } else {
        console.error('❌ Offscreen document recreation failed - still not responding');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Failed to recreate offscreen document:', error);
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
      throw new Error('Text to speak cannot be empty');
    }

    try {
      // Stop any current speech
      await this.stop();

      // Auto-recreate offscreen if needed BEFORE attempting to speak
      const isOffscreenReady = await this.recreateOffscreenIfNeeded();
      if (!isOffscreenReady) {
        console.warn('⚠️ Offscreen document not available, falling back to alternative TTS');
        await this.fallbackToAlternativeTTS(text, options);
        return;
      }

      const ttsOptions = {
        text: text.trim(),
        voice: options.voice || null,
        rate: options.rate || 1,
        pitch: options.pitch || 1,
        volume: options.volume || 1,
        lang: options.lang || 'en-US'
      };

      console.log('🔊 Speaking text via offscreen document:', text.substring(0, 50));

      // Send message to offscreen document with explicit target
      const response = await this.browser.runtime.sendMessage({
        action: 'TTS_SPEAK',
        target: 'offscreen', // Explicitly target offscreen context
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
      
      // If offscreen fails even after recreation, try fallback methods
      console.log('🔄 Attempting TTS fallback...');
      try {
        await this.fallbackToAlternativeTTS(text, options);
      } catch (fallbackError) {
        console.error('❌ TTS fallback also failed:', fallbackError);
        throw new Error(`TTS failed: ${error.message}. Fallback: ${fallbackError.message}`);
      }
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
        action: 'TTS_STOP',
        target: 'offscreen'
      });

      this.currentSpeech = null;
      console.log('🛑 TTS stopped');

    } catch (error) {
      console.error('❌ Failed to stop TTS:', error);
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
      throw new Error('Valid audio blob is required');
    }

    try {
      // Ensure offscreen is ready before playing cached audio
      const isOffscreenReady = await this.recreateOffscreenIfNeeded();
      if (!isOffscreenReady) {
        throw new Error('Offscreen document not available for cached audio playback');
      }

      console.log('🔊 Playing cached audio blob via offscreen:', audioBlob.size, 'bytes');

      // Convert blob to ArrayBuffer for message passing
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = Array.from(new Uint8Array(arrayBuffer));

      // Send cached audio to offscreen document
      const response = await this.browser.runtime.sendMessage({
        action: 'TTS_PLAY_CACHED_AUDIO',
        target: 'offscreen',
        data: { audioData }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to play cached audio in offscreen document');
      }

      console.log('✅ Cached audio playback completed');

    } catch (error) {
      console.error('❌ Cached audio playback failed:', error);
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

  /**
   * Fallback to alternative TTS method when offscreen fails
   * @private
   */
  async fallbackToAlternativeTTS(text, options) {
    console.log('🔄 Using content script TTS fallback');
    
    try {
      // Get active tab to inject TTS
      const [tab] = await this.browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found for TTS fallback');
      }
      
      // Send TTS message to content script
      await this.browser.tabs.sendMessage(tab.id, {
        action: 'TTS_SPEAK_CONTENT',
        data: {
          text: text,
          lang: options.lang || 'en-US',
          rate: options.rate || 1,
          pitch: options.pitch || 1,
          volume: options.volume || 1
        }
      });
      
      console.log('✅ Content script TTS fallback successful');
      
    } catch (error) {
      console.error('❌ Content script TTS fallback failed:', error);
      throw error;
    }
  }
}