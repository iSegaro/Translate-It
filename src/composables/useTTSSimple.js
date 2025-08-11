// src/composables/useTTSSimple.js
// Simple TTS composable based on OLD implementation

import { ref } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { getLanguageCodeForTTS } from "@/utils/i18n/languages.js";
import { createLogger } from '@/utils/core/logger.js';
import { MessageActions } from '@/messaging/core/MessageActions.js';

const logger = createLogger('UI', 'useTTSSimple');

export function useTTSSimple() {
  const browserAPI = useBrowserAPI();
  const isPlaying = ref(false);

  /**
   * Speak text using unified GOOGLE_TTS_SPEAK message
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
      
      const language = getLanguageCodeForTTS(lang) || "en";
      logger.debug("[useTTSSimple] Speaking via GOOGLE_TTS_SPEAK:", text.substring(0, 50) + "...");

      // Send to background handler
      const response = await browserAPI.sendMessage({
        action: MessageActions.GOOGLE_TTS_SPEAK,
        data: {
          text: text.trim(),
          language: language
        }
      });

      if (!response?.success) {
        throw new Error(response?.error || 'TTS failed');
      }

      logger.debug("[useTTSSimple] TTS completed successfully");
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
      // Reset state - background TTS doesn't support stop
      isPlaying.value = false;
      logger.debug("[useTTSSimple] TTS state reset");
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