// src/composables/useTTSSimple.js
// Simple TTS composable based on OLD implementation

import { ref } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { getLanguageCodeForTTS } from "@/utils/i18n/languages.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('UI', 'useTTSSimple');

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
      logger.warn("[useTTSSimple] No text provided for TTS");
      return;
    }

    try {
      isPlaying.value = true;
      logger.debug("[useTTSSimple] Speaking:", text.substring(0, 50) + "...");

      // Use TTS_SPEAK action from MessageActions
      await browserAPI.sendMessage({
        action: MessageActions.TTS_SPEAK,
        data: {
          text: text.trim(),
          language: getLanguageCodeForTTS(lang) || "en",
          rate: 1,
          pitch: 1,
          volume: 1,
        },
      });

      logger.debug("[useTTSSimple] TTS message sent successfully");
    } catch (error) {
      logger.error("[useTTSSimple] TTS failed:", error);
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
        action: MessageActions.TTS_STOP,
      });
      isPlaying.value = false;
      logger.debug("[useTTSSimple] TTS stopped");
    } catch (error) {
      logger.error("[useTTSSimple] Failed to stop TTS:", error);
    }
  };

  return {
    speak,
    stop,
    isPlaying,
  };
}