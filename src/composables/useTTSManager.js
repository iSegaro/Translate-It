// src/composables/useTTSManager.js
// Vue composable for unified TTS functionality across Chrome/Firefox

import { ref, onUnmounted } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { getLanguageCodeForTTS } from "@/utils/i18n/languages.js";

export function useTTSManager() {
  // State
  const isPlaying = ref(false);
  const isStopping = ref(false);
  const currentText = ref("");
  const ttsError = ref("");

  // Composables
  const browserAPI = useBrowserAPI();

  // Play TTS with unified interface
  const speak = async (text, options = {}) => {
    if (!text || typeof text !== "string") {
      console.warn("[useTTSManager] Invalid text provided for TTS");
      return false;
    }

    // Stop any currently playing TTS
    await stop();

    try {
      isPlaying.value = true;
      currentText.value = text;
      ttsError.value = "";

      console.log(
        "[useTTSManager] Starting TTS playback:",
        text.substring(0, 50) + "...",
      );

      // Send TTS request to background with unified format
      const response = await browserAPI.safeSendMessage({
        action: "speak",
        data: {
          text: text,
          lang: getLanguageCodeForTTS(options.lang) || "en",
          rate: options.rate || 1.0,
          pitch: options.pitch || 1.0,
          volume: options.volume || 1.0,
          voice: options.voice,
        },
      });

      if (response._isConnectionError) {
        throw new Error("TTS service temporarily unavailable");
      }

      if (!response.success) {
        throw new Error(response.error || "TTS playback failed");
      }

      console.log("[useTTSManager] TTS playback started successfully");
      return true;
    } catch (error) {
      console.error("[useTTSManager] TTS speak failed:", error);
      ttsError.value = error.message || "Text-to-speech failed";
      isPlaying.value = false;
      currentText.value = "";
      return false;
    }
  };

  // Stop TTS playback
  const stop = async () => {
    if (!isPlaying.value && !isStopping.value) {
      return true;
    }

    try {
      isStopping.value = true;
      console.log("[useTTSManager] Stopping TTS playback");

      const response = await browserAPI.safeSendMessage({
        action: "stopTTS",
      });

      if (response._isConnectionError) {
        console.warn("[useTTSManager] Connection lost during TTS stop");
        // Don't treat connection errors as failures for stop operations
      } else if (!response.success && response.error) {
        console.warn("[useTTSManager] TTS stop warning:", response.error);
      }

      // Always update local state regardless of response
      isPlaying.value = false;
      currentText.value = "";
      ttsError.value = "";

      console.log("[useTTSManager] TTS playback stopped");
      return true;
    } catch (error) {
      console.error("[useTTSManager] TTS stop failed:", error);
      // Still update local state on error
      isPlaying.value = false;
      currentText.value = "";
      return false;
    } finally {
      isStopping.value = false;
    }
  };

  // Toggle TTS playback
  const toggle = async (text, options = {}) => {
    if (isPlaying.value) {
      return await stop();
    } else {
      return await speak(text, options);
    }
  };

  // Check if TTS is available
  const isAvailable = async () => {
    try {
      await browserAPI.ensureReady();
      return true;
    } catch (error) {
      console.warn("[useTTSManager] TTS not available:", error);
      return false;
    }
  };

  // Get TTS voices (if supported)
  const getVoices = async () => {
    try {
      const response = await browserAPI.safeSendMessage({
        action: "getTTSVoices",
      });

      if (response._isConnectionError || !response.success) {
        return [];
      }

      return response.voices || [];
    } catch (error) {
      console.warn("[useTTSManager] Could not get TTS voices:", error);
      return [];
    }
  };

  // Cleanup on unmount
  onUnmounted(async () => {
    if (isPlaying.value) {
      console.log("[useTTSManager] Component unmounting, stopping TTS");
      await stop();
    }
  });

  return {
    // State
    isPlaying,
    isStopping,
    currentText,
    ttsError,

    // Methods
    speak,
    stop,
    toggle,
    isAvailable,
    getVoices,
  };
}
