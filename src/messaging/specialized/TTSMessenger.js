/**
 * Specialized TTS Messenger
 * Handles all Text-to-Speech related messaging operations
 */

import { MessageActions } from '../core/MessageActions.js';

export class TTSMessenger {
  constructor(context, parentMessenger) {
    this.context = context;
    this.messenger = parentMessenger;
  }

  /**
   * Speak text with enhanced options and error handling
   * @param {string} text - Text to speak
   * @param {string} language - Language code (e.g., 'en-US', 'fa')
   * @param {Object} options - TTS options (rate, pitch, volume, voice)
   * @returns {Promise<Object>} TTS operation result
   */
  async speak(text, language, options = {}) {
    if (!text || !text.trim()) {
      throw new Error('Text to speak cannot be empty');
    }

    const ttsOptions = {
      text: text.trim(),
      language: language || 'en-US',
      rate: options.rate || 1,
      pitch: options.pitch || 1,
      volume: options.volume || 1,
      voice: options.voice || null,
      ...options
    };

    return this.messenger.sendMessage({
      action: MessageActions.TTS_SPEAK,
      target: 'offscreen', // Explicitly target offscreen context for Chrome
      data: ttsOptions,
      timestamp: Date.now()
    });
  }

  /**
   * Stop current speech
   * @returns {Promise<Object>} Stop operation result
   */
  async stop() {
    return this.messenger.sendMessage({
      action: MessageActions.TTS_STOP,
      target: 'offscreen',
      timestamp: Date.now()
    });
  }

  /**
   * Pause current speech
   * @returns {Promise<Object>} Pause operation result
   */
  async pause() {
    return this.messenger.sendMessage({
      action: MessageActions.TTS_PAUSE,
      target: 'offscreen',
      timestamp: Date.now()
    });
  }

  /**
   * Resume paused speech
   * @returns {Promise<Object>} Resume operation result
   */
  async resume() {
    return this.messenger.sendMessage({
      action: MessageActions.TTS_RESUME,
      target: 'offscreen',
      timestamp: Date.now()
    });
  }

  /**
   * Get available voices
   * @returns {Promise<Array>} Array of available voices
   */
  async getVoices() {
    const response = await this.messenger.sendMessage({
      action: MessageActions.TTS_GET_VOICES,
      target: 'offscreen',
      timestamp: Date.now()
    });

    return response?.voices || [];
  }

  /**
   * Play cached audio blob
   * @param {Blob} audioBlob - Audio blob to play
   * @returns {Promise<Object>} Playback result
   */
  async playAudioBlob(audioBlob) {
    if (!audioBlob || !(audioBlob instanceof Blob)) {
      throw new Error('Valid audio blob is required');
    }

    // Convert blob to ArrayBuffer for message passing
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioData = Array.from(new Uint8Array(arrayBuffer));

    return this.messenger.sendMessage({
      action: MessageActions.TTS_PLAY_CACHED_AUDIO,
      target: 'offscreen',
      data: { audioData },
      timestamp: Date.now()
    });
  }
}

export default TTSMessenger;