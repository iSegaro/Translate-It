// src/composables/useTTSSmart.js
// Smart TTS composable with automatic Chrome/Firefox detection
// Reusable across popup, sidepanel, and other components

import { ref } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { getLanguageCodeForTTS } from "@/utils/languages.js";

/**
 * Smart TTS composable that intelligently detects browser
 * and provides unified TTS interface for Chrome and Firefox
 */
export function useTTSSmart() {
  const browserAPI = useBrowserAPI();
  const isPlaying = ref(false);
  const isLoading = ref(false);

  /**
   * Speak text using smart browser detection
   * @param {string} text - Text to speak
   * @param {string} lang - Language code (optional)
   * @param {Object} options - TTS options (voice, rate, pitch, volume)
   */
  const speak = async (text, lang = "auto", options = {}) => {
    if (!text || !text.trim()) {
      console.warn("[useTTSSmart] No text provided for TTS");
      return;
    }

    try {
      isLoading.value = true;
      isPlaying.value = true;

      console.log("[useTTSSmart] Speaking with smart detection:", {
        text: text.substring(0, 50) + "...",
        lang,
        options,
      });

      // Send message to background with unified format
      const response = await browserAPI.safeSendMessage({
        action: "speak",
        data: {
          text: text.trim(),
          lang: getLanguageCodeForTTS(lang) || "en",
          rate: options.rate || 1,
          pitch: options.pitch || 1,
          volume: options.volume || 1,
          voice: options.voice,
        },
      });

      if (response && !response._isConnectionError) {
        console.log("[useTTSSmart] TTS started successfully");
      } else {
        throw new Error("TTS service temporarily unavailable");
      }
    } catch (error) {
      console.error("[useTTSSmart] TTS failed:", error);
      throw error;
    } finally {
      isLoading.value = false;
      // Keep playing state until stop or timeout
      setTimeout(() => {
        if (isPlaying.value) isPlaying.value = false;
      }, 5000); // Auto-reset after 5 seconds
    }
  };

  /**
   * Stop TTS playback
   */
  const stop = async () => {
    try {
      console.log("[useTTSSmart] Stopping TTS");

      await browserAPI.safeSendMessage({
        action: "stopTTS",
      });

      isPlaying.value = false;
      isLoading.value = false;
      console.log("[useTTSSmart] TTS stopped successfully");
    } catch (error) {
      console.error("[useTTSSmart] Failed to stop TTS:", error);
      // Still reset state even if stop fails
      isPlaying.value = false;
      isLoading.value = false;
    }
  };

  /**
   * Toggle TTS playback (play if not playing, stop if playing)
   * @param {string} text - Text to speak (if starting)
   * @param {string} lang - Language code
   * @param {Object} options - TTS options
   */
  const toggle = async (text, lang = "auto", options = {}) => {
    if (isPlaying.value) {
      await stop();
    } else {
      await speak(text, lang, options);
    }
  };

  /**
   * Check if TTS is available
   */
  const isAvailable = () => {
    // TTS is available in both Chrome and Firefox through background
    return true;
  };

  return {
    speak,
    stop,
    toggle,
    isPlaying,
    isLoading,
    isAvailable,
  };
}
