// src/managers/content/windows/translation/TTSManager.js

import browser from "webextension-polyfill";
import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";
import { WindowsConfig } from "../core/WindowsConfig.js";
import { MessageActions } from "../../../../messaging/core/MessageActions.js";
import { sendReliable } from '@/messaging/core/ReliableMessaging.js';

/**
 * Manages Text-to-Speech functionality for WindowsManager
 */
export class TTSManager {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TTSManager');
  }

  /**
   * Speak text using unified TTS system (background service)
   */
  async speakTextUnified(text) {
    if (!text || !text.trim()) {
      this.logger.warn("No text provided for TTS");
      return;
    }

    try {
      this.logger.debug("Speaking via background Google TTS:", text.substring(0, 50) + "...");

      // Detect language
      const language = this.detectSimpleLanguage(text) || "en";
      
      // Send to background service (use reliable messenger)
      await sendReliable({
        action: MessageActions.GOOGLE_TTS_SPEAK,
        data: {
          text: text.trim(),
          language: language
        }
      });

      this.logger.debug("Background Google TTS request sent successfully");
    } catch (error) {
      this.logger.error("Background Google TTS failed:", error);
      throw error;
    }
  }

  /**
   * Direct Google TTS implementation (fallback)
   */
  speakWithGoogleTTS(text, language) {
    return new Promise((resolve, reject) => {
      try {
        const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&q=${encodeURIComponent(text)}&tl=${language}`;
        
        const audio = new Audio(ttsUrl);
        
        // Add timeout
        const timeout = setTimeout(() => {
          audio.pause();
          audio.src = "";
          reject(new Error('Google TTS timeout'));
        }, WindowsConfig.TIMEOUTS.TTS_TIMEOUT);
        
        audio.onended = () => {
          clearTimeout(timeout);
          this.logger.debug("Google TTS audio completed");
          resolve();
        };
        
        audio.onerror = (error) => {
          clearTimeout(timeout);
          this.logger.error("Google TTS audio error:", error);
          reject(new Error(`Google TTS failed: ${error.message}`));
        };
        
        audio.play().catch((playError) => {
          clearTimeout(timeout);
          reject(new Error(`Google TTS play failed: ${playError.message}`));
        });
        
        this.logger.debug("Google TTS audio started");
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop any currently playing TTS
   */
  stopCurrentTTS() {
    try {
      // Stop any playing audio elements (Google TTS)
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.pause();
        audio.src = "";
      });
      
      this.logger.debug("TTS stopped");
    } catch (error) {
      this.logger.warn("Error stopping TTS", error);
    }
  }

  /**
   * Simple language detection for TTS
   */
  detectSimpleLanguage(text) {
    // Simple patterns for major languages
    const patterns = {
      'fa': /[\u06A9\u06AF\u06C0-\u06D3]/,  // Persian specific chars
      'ar': /[\u0600-\u06FF]/,              // Arabic/Persian range
      'zh': /[\u4E00-\u9FFF]/,              // Chinese
      'ja': /[\u3040-\u309F\u30A0-\u30FF]/, // Japanese  
      'ko': /[\uAC00-\uD7AF]/,              // Korean
      'ru': /[\u0400-\u04FF]/,              // Russian
    };

    // Check patterns in priority order
    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }
    
    return 'en'; // Default to English
  }

  /**
   * Create TTS icon with click handler
   */
  createTTSIcon(textToSpeak, title = "Speak", factory) {
    const icon = factory.createTTSIcon(title);
    
    icon.addEventListener("click", async (e) => {
      e.stopPropagation();
      this.logger.debug("🔊 TTS icon clicked!", { text: textToSpeak?.substring(0, 50) + "...", title });
      try {
        await this.speakTextUnified(textToSpeak.trim());
        this.logger.debug("TTS started via unified system");
      } catch (error) {
        this.logger.warn("Error speaking text", error);
        
        // Try fallback method
        try {
          const language = this.detectSimpleLanguage(textToSpeak);
          await this.speakWithGoogleTTS(textToSpeak.trim(), language);
          this.logger.debug("TTS started via fallback method");
        } catch (fallbackError) {
          this.logger.error("Both TTS methods failed", fallbackError);
        }
      }
    });
    
    return icon;
  }

  /**
   * Check if TTS is supported
   */
  isTTSSupported() {
    // Check for Audio API support
    if (typeof Audio === 'undefined') {
      return false;
    }

    // Check for basic browser extension API support
    if (!browser?.runtime?.sendMessage) {
      return false;
    }

    return true;
  }

  /**
   * Get available TTS voices (if using Web Speech API)
   */
  getAvailableVoices() {
    if (!window.speechSynthesis) {
      return [];
    }

    return window.speechSynthesis.getVoices();
  }

  /**
   * Speak using Web Speech API (alternative method)
   */
  speakWithWebSpeech(text, language = 'en') {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('Speech synthesis not supported'));
        return;
      }

      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language;
        utterance.rate = 0.8;
        utterance.pitch = 1;
        
        utterance.onend = () => {
          this.logger.debug("Web Speech TTS completed");
          resolve();
        };
        
        utterance.onerror = (error) => {
          this.logger.error("Web Speech TTS error:", error);
          reject(new Error(`Web Speech TTS failed: ${error.error}`));
        };
        
        // Stop any current speech
        window.speechSynthesis.cancel();
        
        // Start speaking
        window.speechSynthesis.speak(utterance);
        
        this.logger.debug("Web Speech TTS started");
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get TTS method priority list
   */
  getTTSMethodPriority() {
    return [
      'unified', // Background service (preferred)
      'google',  // Direct Google TTS
      'webspeech' // Web Speech API (fallback)
    ];
  }

  /**
   * Cleanup TTS manager
   */
  cleanup() {
    this.stopCurrentTTS();
    
    // Cancel any pending Web Speech
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    this.logger.debug('TTSManager cleanup completed');
  }
}