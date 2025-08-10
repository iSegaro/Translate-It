import { ref } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { getLanguageCodeForTTS } from "@/utils/i18n/languages.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('UI', 'useTTSSmart');

export function useTTSSmart() {
  const browserAPI = useBrowserAPI('tts-smart');
  const isPlaying = ref(false);
  const isLoading = ref(false);

  const speak = async (text, lang = "auto", options = {}) => {
    if (!text || !text.trim()) {
      logger.warn("[useTTSSmart] No text provided for TTS");
      return;
    }

    try {
      isLoading.value = true;
      isPlaying.value = true;
      logger.debug("[useTTSSmart] Speaking:", text.substring(0, 50) + "...");

      // Use unified message format - same as useTTSSimple
      await browserAPI.sendMessage({
        action: MessageActions.TTS_SPEAK,
        data: {
          text: text.trim(),
          language: getLanguageCodeForTTS(lang) || "en",
          rate: options.rate || 1,
          pitch: options.pitch || 1,
          volume: options.volume || 1,
        },
      });

      logger.debug("[useTTSSmart] TTS message sent successfully");
    } catch (error) {
      logger.error("[useTTSSmart] TTS failed:", error);
      throw error;
    } finally {
      isLoading.value = false;
      setTimeout(() => { if (isPlaying.value) isPlaying.value = false; }, 5000);
    }
  };

  const stop = async () => {
    try {
      await browserAPI.sendMessage({
        action: MessageActions.TTS_STOP,
      });
      isPlaying.value = false;
      isLoading.value = false;
      logger.debug("[useTTSSmart] TTS stopped");
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
