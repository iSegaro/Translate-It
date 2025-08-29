// src/managers/content/windows/translation/TTSManager.js

import browser from "webextension-polyfill";
import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";
import { WindowsConfig } from "../core/WindowsConfig.js";
import { MessageActions } from "../../../../messaging/core/MessageActions.js";
import { sendReliable } from '@/messaging/core/ReliableMessaging.js';
import { useTTSGlobal } from '@/composables/useTTSGlobal.js';

/**
 * Manages Text-to-Speech functionality for WindowsManager
 */
export class TTSManager {
  constructor(windowId = 'unknown') {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TTSManager');
    this.windowId = windowId;
    
    // Initialize TTS Global Manager
    this.ttsGlobal = useTTSGlobal({ 
      type: 'windows-manager', 
      name: `TTSManager-${windowId}`
    });
    
    // Register with cleanup callback
    this.ttsGlobal.register(async () => {
      this.logger.debug(`[TTSManager ${windowId}] TTS cleanup callback - stopping TTS`)
      // Use direct background message instead of stopCurrentTTS to avoid recursion
      try {
        await sendReliable({
          action: MessageActions.GOOGLE_TTS_STOP_ALL,
          data: { source: 'windows-manager-cleanup', windowId }
        })
      } catch (error) {
        this.logger.error(`[TTSManager ${windowId}] Failed to stop TTS during cleanup:`, error)
      }
    });
    
    this.logger.debug(`TTSManager initialized for window: ${windowId}`)
  }

  /**
   * Speak text using enhanced TTS system with global management
   */
  async speakTextUnified(text, language = null) {
    if (!text || !text.trim()) {
      this.logger.warn("No text provided for TTS");
      return false;
    }

    try {
      this.logger.debug(`[TTSManager ${this.windowId}] Speaking via enhanced TTS:`, text.substring(0, 50) + "...");

      // Notify global manager that this instance is starting TTS
      await this.ttsGlobal.startTTS({ text, language });

      // Detect language if not provided
      const detectedLanguage = language || this.detectSimpleLanguage(text) || "en";
      
      // Send to background service with enhanced message actions
      await sendReliable({
        action: MessageActions.GOOGLE_TTS_SPEAK,
        data: {
          text: text.trim(),
          language: detectedLanguage,
          instanceId: this.ttsGlobal.instanceId,
          windowId: this.windowId
        }
      });

      // Update activity
      this.ttsGlobal.updateActivity();

      this.logger.debug(`[TTSManager ${this.windowId}] Enhanced TTS request sent successfully`);
      return true;
    } catch (error) {
      this.logger.error(`[TTSManager ${this.windowId}] Enhanced TTS failed:`, error);
      throw error;
    }
  }

  /**
   * Pause current TTS
   */
  async pauseTTS() {
    try {
      this.logger.debug(`[TTSManager ${this.windowId}] Pausing TTS`);
      
      await sendReliable({
        action: MessageActions.GOOGLE_TTS_PAUSE,
        data: { 
          instanceId: this.ttsGlobal.instanceId,
          windowId: this.windowId
        }
      });
      
      this.ttsGlobal.updateActivity();
      return true;
    } catch (error) {
      this.logger.error(`[TTSManager ${this.windowId}] Pause TTS failed:`, error);
      return false;
    }
  }

  /**
   * Resume current TTS
   */
  async resumeTTS() {
    try {
      this.logger.debug(`[TTSManager ${this.windowId}] Resuming TTS`);
      
      await sendReliable({
        action: MessageActions.GOOGLE_TTS_RESUME,
        data: { 
          instanceId: this.ttsGlobal.instanceId,
          windowId: this.windowId
        }
      });
      
      this.ttsGlobal.updateActivity();
      return true;
    } catch (error) {
      this.logger.error(`[TTSManager ${this.windowId}] Resume TTS failed:`, error);
      return false;
    }
  }

  /**
   * Get current TTS status
   */
  async getTTSStatus() {
    try {
      const response = await sendReliable({
        action: MessageActions.GOOGLE_TTS_GET_STATUS,
        data: { 
          instanceId: this.ttsGlobal.instanceId,
          windowId: this.windowId
        }
      });
      
      return response?.status || 'idle';
    } catch (error) {
      this.logger.error(`[TTSManager ${this.windowId}] Get TTS status failed:`, error);
      return 'error';
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
   * Stop any currently playing TTS (enhanced with global management)
   */
  async stopCurrentTTS() {
    try {
      this.logger.debug(`[TTSManager ${this.windowId}] Stopping current TTS`);
      
      // Stop via background service first
      try {
        await sendReliable({
          action: MessageActions.GOOGLE_TTS_STOP_ALL,
          data: { 
            instanceId: this.ttsGlobal.instanceId,
            windowId: this.windowId
          }
        });
        
        this.logger.debug(`[TTSManager ${this.windowId}] Background TTS stop sent`);
      } catch (bgError) {
        this.logger.warn(`[TTSManager ${this.windowId}] Background stop failed:`, bgError);
      }
      
      // Local cleanup as fallback
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.pause();
        audio.src = "";
      });
      
      // Cancel any Web Speech
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      
      this.logger.debug(`[TTSManager ${this.windowId}] TTS stopped (local cleanup completed)`);
      return true;
    } catch (error) {
      this.logger.warn(`[TTSManager ${this.windowId}] Error stopping TTS:`, error);
      return false;
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
   * Enhanced cleanup with global manager integration
   */
  async cleanup() {
    this.logger.debug(`[TTSManager ${this.windowId}] Starting cleanup`);
    
    // Stop current TTS
    await this.stopCurrentTTS();
    
    // Unregister from global manager
    this.ttsGlobal.unregister();
    
    // Cancel any pending Web Speech
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    this.logger.debug(`[TTSManager ${this.windowId}] Cleanup completed`);
  }

  /**
   * Check if this instance is currently active
   */
  isActive() {
    return this.ttsGlobal.isActive();
  }

  /**
   * Get global TTS statistics
   */
  getGlobalStats() {
    return this.ttsGlobal.getStats();
  }
}