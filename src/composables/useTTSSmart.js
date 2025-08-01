import { ref } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { getLanguageCodeForTTS } from "@/utils/languages.js";

export function useTTSSmart() {
  const { messenger } = useBrowserAPI('tts-smart');
  const isPlaying = ref(false);
  const isLoading = ref(false);

  const speak = async (text, lang = "auto", options = {}) => {
    if (!text || !text.trim()) return;

    try {
      isLoading.value = true;
      isPlaying.value = true;

      await messenger.specialized.tts.speak(
        text.trim(),
        getLanguageCodeForTTS(lang) || "en",
        options
      );

    } catch (error) {
      throw error;
    } finally {
      isLoading.value = false;
      setTimeout(() => { if (isPlaying.value) isPlaying.value = false; }, 5000);
    }
  };

  const stop = async () => {
    try {
      await messenger.specialized.tts.stop();
      isPlaying.value = false;
      isLoading.value = false;
    } catch (error) {
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
