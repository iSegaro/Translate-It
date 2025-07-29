// src/composables/useSidepanelTTS.js
// Simple TTS composable for sidepanel (matches original functionality)
import { ref } from "vue";
import browser from "webextension-polyfill";
import { AUTO_DETECT_VALUE } from "@/constants.js";

export function useSidepanelTTS() {
  // State
  const isSpeaking = ref(false);
  const ttsError = ref("");

  // Speak text using background script TTS (matches original ttsManager.js)
  const speakText = async (text, lang = AUTO_DETECT_VALUE) => {
    if (!text || !text.trim()) {
      return false;
    }

    try {
      isSpeaking.value = true;
      ttsError.value = "";

      const browser = browser;
      await browser.runtime.sendMessage({
        action: "speak",
        text: text.trim(),
        lang,
      });

      return true;
    } catch (error) {
      console.error("Error sending TTS message:", error);
      ttsError.value = "Failed to play text-to-speech";
      return false;
    } finally {
      // Reset speaking state after a delay
      setTimeout(() => {
        isSpeaking.value = false;
      }, 1000);
    }
  };

  // Stop current TTS playback
  const stopTTS = async () => {
    try {
      const browser = browser;
      await browser.runtime.sendMessage({ action: "stopTTS" });
      isSpeaking.value = false;
      return true;
    } catch (error) {
      console.error("Error stopping TTS:", error);
      return false;
    }
  };

  // Handle source text TTS
  const handleSourceTTS = async (sourceText, sourceLanguage) => {
    const lang = sourceLanguage || AUTO_DETECT_VALUE;
    return await speakText(sourceText, lang);
  };

  // Handle translated text TTS
  const handleTargetTTS = async (translationResult, targetLanguage) => {
    if (!translationResult) return false;

    const text = translationResult.textContent?.trim() || "";
    const lang = targetLanguage || AUTO_DETECT_VALUE;
    return await speakText(text, lang);
  };

  // Handle TTS with click-to-stop functionality
  const handleTTSWithStop = async (text, lang, isCurrentlyPlaying = false) => {
    if (isCurrentlyPlaying || isSpeaking.value) {
      // If currently playing, stop TTS
      return await stopTTS();
    } else {
      // If not playing, start TTS
      return await speakText(text, lang);
    }
  };

  return {
    // State
    isSpeaking,
    ttsError,

    // Methods
    speakText,
    stopTTS,
    handleSourceTTS,
    handleTargetTTS,
    handleTTSWithStop,
  };
}
