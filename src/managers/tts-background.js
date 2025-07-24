// src/managers/tts-background.js
// Background page TTS implementation for Firefox and fallback

import { getBrowserAPI } from '../utils/browser-unified.js';
import { environment } from '../utils/environment.js';

/**
 * Background TTS Manager for Firefox and fallback scenarios
 * Uses background page context with Web Audio API or Speech Synthesis
 */
export class BackgroundTTSManager {
  constructor() {
    this.browser = null;
    this.audioContext = null;
    this.currentUtterance = null;
    this.currentAudio = null;
    this.initialized = false;
    this.availableMethods = [];
  }

  /**
   * Initialize the background TTS manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.browser = await getBrowserAPI();
      await environment.initialize();

      console.log('🔊 Initializing background TTS manager');

      // Detect available TTS methods
      await this.detectAvailableMethods();

      if (this.availableMethods.length === 0) {
        throw new Error('No TTS methods available in background context');
      }

      this.initialized = true;
      console.log('✅ Background TTS manager initialized with methods:', this.availableMethods);

    } catch (error) {
      console.error('❌ Failed to initialize background TTS manager:', error);
      throw error;
    }
  }

  /**
   * Detect available TTS methods in background context
   * @private
   */
  async detectAvailableMethods() {
    this.availableMethods = [];

    // Method 1: Browser TTS API (Chrome/Firefox native)
    if (this.browser.tts && typeof this.browser.tts.speak === 'function') {
      this.availableMethods.push('browser-tts');
      console.log('✅ Browser TTS API available');
    }

    // Method 2: Speech Synthesis API (if available in background context)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.availableMethods.push('speech-synthesis');
      console.log('✅ Speech Synthesis API available');
    }

    // Method 3: Web Audio API for generated speech
    if (typeof window !== 'undefined' && 
        (window.AudioContext || window.webkitAudioContext)) {
      this.availableMethods.push('web-audio');
      console.log('✅ Web Audio API available');
    }

    // Method 4: Content script delegation
    this.availableMethods.push('content-script');
    console.log('✅ Content script delegation available (fallback)');
  }

  /**
   * Speak text using the best available method
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

    console.log('🔊 Speaking text via background:', text.substring(0, 50));

    // Try methods in order of preference
    for (const method of this.availableMethods) {
      try {
        await this.speakWithMethod(method, ttsOptions);
        console.log(`✅ TTS successful with method: ${method}`);
        return;
      } catch (error) {
        console.warn(`⚠️ TTS method ${method} failed:`, error.message);
        continue;
      }
    }

    throw new Error('All TTS methods failed');
  }

  /**
   * Speak using a specific method
   * @private
   */
  async speakWithMethod(method, options) {
    switch (method) {
      case 'browser-tts':
        return this.speakWithBrowserTTS(options);
      
      case 'speech-synthesis':
        return this.speakWithSpeechSynthesis(options);
      
      case 'web-audio':
        return this.speakWithWebAudio(options);
      
      case 'content-script':
        return this.speakWithContentScript(options);
      
      default:
        throw new Error(`Unknown TTS method: ${method}`);
    }
  }

  /**
   * Speak using browser TTS API
   * @private
   */
  async speakWithBrowserTTS(options) {
    return new Promise((resolve, reject) => {
      const ttsOptions = {
        lang: options.lang,
        rate: options.rate,
        pitch: options.pitch,
        volume: options.volume
      };

      if (options.voice) {
        ttsOptions.voiceName = options.voice;
      }

      this.browser.tts.speak(options.text, ttsOptions, () => {
        if (this.browser.runtime.lastError) {
          reject(new Error(this.browser.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Speak using Speech Synthesis API
   * @private
   */
  async speakWithSpeechSynthesis(options) {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        throw new Error('Speech Synthesis API not available');
      }

      const utterance = new SpeechSynthesisUtterance(options.text);
      utterance.lang = options.lang;
      utterance.rate = options.rate;
      utterance.pitch = options.pitch;
      utterance.volume = options.volume;

      if (options.voice) {
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.name === options.voice || v.lang === options.lang);
        if (voice) {
          utterance.voice = voice;
        }
      }

      utterance.onend = () => {
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = (event) => {
        this.currentUtterance = null;
        reject(new Error(`Speech synthesis error: ${event.error}`));
      };

      this.currentUtterance = utterance;
      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Speak using Web Audio API (generates audio tones as fallback)
   * @private
   */
  async speakWithWebAudio(options) {
    // This is a basic implementation that generates audio tones
    // In a real implementation, you'd use a TTS service or pre-recorded audio
    
    if (!this.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
    }

    return new Promise((resolve, reject) => {
      try {
        // Generate a simple tone pattern based on text length
        const duration = Math.min(options.text.length * 0.1, 3); // Max 3 seconds
        const frequency = 440; // A4 note

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        gainNode.gain.setValueAtTime(options.volume * 0.1, this.audioContext.currentTime);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);

        oscillator.onended = () => {
          resolve();
        };

        console.log(`🎵 Generated audio tone for ${duration}s (Web Audio fallback)`);

      } catch (error) {
        reject(new Error(`Web Audio TTS failed: ${error.message}`));
      }
    });
  }

  /**
   * Speak using content script delegation
   * @private
   */
  async speakWithContentScript(options) {
    try {
      // Get active tab
      const [tab] = await this.browser.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Send message to content script
      const response = await this.browser.tabs.sendMessage(tab.id, {
        action: 'TTS_SPEAK',
        source: 'background',
        data: options
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Content script TTS failed');
      }

      console.log('🔗 TTS delegated to content script');

    } catch (error) {
      throw new Error(`Content script TTS failed: ${error.message}`);
    }
  }

  /**
   * Stop current speech
   */
  async stop() {
    try {
      // Stop browser TTS
      if (this.browser.tts && this.browser.tts.stop) {
        this.browser.tts.stop();
      }

      // Stop speech synthesis
      if (this.currentUtterance && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        this.currentUtterance = null;
      }

      // Stop web audio
      if (this.audioContext) {
        await this.audioContext.suspend();
      }

      console.log('🛑 Background TTS stopped');

    } catch (error) {
      console.error('❌ Failed to stop background TTS:', error);
    }
  }

  /**
   * Get available voices
   * @returns {Promise<Array>} Array of available voices
   */
  async getVoices() {
    const voices = [];

    try {
      // Get browser TTS voices
      if (this.browser.tts && this.browser.tts.getVoices) {
        const browserVoices = await new Promise((resolve) => {
          this.browser.tts.getVoices(resolve);
        });
        voices.push(...browserVoices.map(v => ({
          ...v,
          source: 'browser-tts'
        })));
      }

      // Get speech synthesis voices
      if (window.speechSynthesis) {
        const synthVoices = window.speechSynthesis.getVoices();
        voices.push(...synthVoices.map(v => ({
          name: v.name,
          lang: v.lang,
          localService: v.localService,
          default: v.default,
          source: 'speech-synthesis'
        })));
      }

    } catch (error) {
      console.error('❌ Failed to get voices:', error);
    }

    return voices;
  }

  /**
   * Check if TTS is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.initialized && this.availableMethods.length > 0;
  }

  /**
   * Get debug information
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      type: 'background',
      initialized: this.initialized,
      availableMethods: this.availableMethods,
      hasAudioContext: !!this.audioContext,
      currentUtterance: !!this.currentUtterance,
      browserTTS: !!this.browser?.tts,
      speechSynthesis: typeof window !== 'undefined' && !!window.speechSynthesis
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up background TTS manager');
    
    await this.stop();

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.initialized = false;
    this.currentUtterance = null;
    this.availableMethods = [];
  }
}