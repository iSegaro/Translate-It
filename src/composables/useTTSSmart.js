import { ref } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { getLanguageCodeForTTS } from "@/utils/i18n/languages.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { MessageActions } from '@/messaging/core/MessageActions.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useTTSSmart');

export function useTTSSmart() {
  const browserAPI = useBrowserAPI('tts-smart');
  const isPlaying = ref(false);
  const isLoading = ref(false);

  const speak = async (text, lang = "auto") => {
    if (!text || !text.trim()) {
      logger.warn("[useTTSSmart] No text provided for TTS");
      return;
    }

    try {
      isLoading.value = true;
      isPlaying.value = true;
      
      const language = getLanguageCodeForTTS(lang) || "en";
      logger.debug("[useTTSSmart] Speaking via GOOGLE_TTS_SPEAK:", text.substring(0, 50) + "...");

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

      logger.debug("[useTTSSmart] TTS completed successfully");
    } catch (error) {
      logger.error("[useTTSSmart] TTS failed:", error);
      throw error;
    } finally {
      isLoading.value = false;
      setTimeout(() => { if (isPlaying.value) isPlaying.value = false; }, 1000);
    }
  };




  const stop = async () => {
    try {
      // Reset state - background TTS doesn't support stop
      isPlaying.value = false;
      isLoading.value = false;
      logger.debug("[useTTSSmart] TTS state reset");
    } catch (error) {
      logger.error("[useTTSSmart] Failed to stop TTS:", error);
      isPlaying.value = false;
      isLoading.value = false;
    }
  };

  const toggle = async (text, lang = "auto", options = {}) => {
    if (isPlaying.value) {
      await stop();
    } else {
      await speak(text, lang, options);
    }
  };

  const isAvailable = () => true;

  return { speak, stop, toggle, isPlaying, isLoading, isAvailable };
}
