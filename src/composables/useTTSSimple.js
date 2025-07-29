// src/composables/useTTSSimple.js
// Simple TTS composable based on OLD implementation

import { ref } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { getLanguageCodeForTTS } from "@/utils/languages.js";

export function useTTSSimple() {
  const browserAPI = useBrowserAPI();
  const isPlaying = ref(false);

  /**
   * Speak text using simple message to background
   * @param {string} text - Text to speak
   * @param {string} lang - Language code (optional)
   */
  const speak = async (text, lang = "auto") => {
    if (!text || !text.trim()) {
      console.warn("[useTTSSimple] No text provided for TTS");
      return;
    }

    try {
      isPlaying.value = true;
      console.log("[useTTSSimple] Speaking:", text.substring(0, 50) + "...");

      // Unified message format for consistency with popup
      await browserAPI.safeSendMessage({
        action: "speak",
        data: {
          text: text.trim(),
          lang: getLanguageCodeForTTS(lang) || "en",
          rate: 1,
          pitch: 1,
          volume: 1,
        },
      });

      console.log("[useTTSSimple] TTS message sent successfully");
    } catch (error) {
      console.error("[useTTSSimple] TTS failed:", error);
    } finally {
      // Reset playing state after a delay
      setTimeout(() => {
        isPlaying.value = false;
      }, 1000);
    }
  };

  /**
   * Stop TTS playback
   */
  const stop = async () => {
    try {
      await browserAPI.safeSendMessage({
        action: "stopTTS",
      });
      isPlaying.value = false;
      console.log("[useTTSSimple] TTS stopped");
    } catch (error) {
      console.error("[useTTSSimple] Failed to stop TTS:", error);
    }
  };

  return {
    speak,
    stop,
    isPlaying,
  };
}
