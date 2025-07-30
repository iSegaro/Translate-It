// Lightweight translation composable specifically for popup
// Simplified version without heavy dependencies
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useSettingsStore } from "@/store/core/settings.js";
import { UnifiedTranslationClient } from "@/core/UnifiedTranslationClient.js";
import { useBrowserAPI } from "@/composables/useBrowserAPI.js";

export function usePopupTranslation() {
  // State
  const sourceText = ref("");
  const translatedText = ref("");
  const isTranslating = ref(false);
  const translationError = ref("");
  const lastTranslation = ref(null);

  // Store
  const settingsStore = useSettingsStore();

  // Translation client
  const translationClient = new UnifiedTranslationClient("popup");

  // Browser API
  const browserAPI = useBrowserAPI();

  // Computed
  const hasTranslation = computed(() => Boolean(translatedText.value?.trim()));
  const canTranslate = computed(
    () => Boolean(sourceText.value?.trim()) && !isTranslating.value,
  );

  // Methods
  const triggerTranslation = async () => {
    if (!canTranslate.value) return;

    isTranslating.value = true;
    translationError.value = "";
    translatedText.value = ""; // Clear previous translation

    try {
      // Use UnifiedTranslationClient for translation request
      // The actual translation result will come via a separate message
      const response = await translationClient.translate(sourceText.value, {
        provider: settingsStore.settings.TRANSLATION_API,
        sourceLanguage: settingsStore.settings.SOURCE_LANGUAGE,
        targetLanguage: settingsStore.settings.TARGET_LANGUAGE,
        mode: "popup",
      });

      // Check response - should be TRANSLATION_RESULT_UPDATE message
      console.log("[usePopupTranslation] Received response:", response);
      if (response && response.action === "TRANSLATION_RESULT_UPDATE" && response.translatedText) {
        // Direct translation result via TRANSLATION_RESULT_UPDATE
        console.log("[usePopupTranslation] TRANSLATION_RESULT_UPDATE received:", response.translatedText);
        translatedText.value = response.translatedText;
        lastTranslation.value = {
          source: response.originalText || sourceText.value,
          target: response.translatedText,
          provider: response.provider,
          timestamp: response.timestamp || Date.now(),
        };
        isTranslating.value = false;
      } else if (response && response.success) {
        console.log(
          "[usePopupTranslation] Generic success response. Waiting for TRANSLATION_RESULT_UPDATE...",
        );
        // Fallback: wait for TRANSLATION_RESULT_UPDATE message listener
      } else {
        console.error("[usePopupTranslation] Response failed:", response);
        throw new Error(response?.error || response?.message || "Translation failed");
      }
    } catch (error) {
      console.error("[usePopupTranslation] Translation error:", error);
      translationError.value = error.message || "Translation failed";
    } finally {
      // isTranslating will be set to false by the message listener
      // if an error occurs before the listener, it will be handled here
      if (translationError.value) {
        isTranslating.value = false;
      }
    }
  };

  const clearTranslation = () => {
    sourceText.value = "";
    translatedText.value = "";
    translationError.value = "";
    lastTranslation.value = null;
  };

  const loadLastTranslation = () => {
    if (lastTranslation.value) {
      sourceText.value = lastTranslation.value.source;
      translatedText.value = lastTranslation.value.target;
    }
  };

  // Listen for translation result updates from background script
  onMounted(() => {
    browserAPI.onMessage.addListener((message) => {
      if (
        message.action === "TRANSLATION_RESULT_UPDATE" &&
        message.context === "popup"
      ) {
        console.log(
          "[usePopupTranslation] Received TRANSLATION_RESULT_UPDATE:",
          message,
        );
        translatedText.value = message.translatedText;
        translationError.value = ""; // Clear any previous error
        isTranslating.value = false;
        lastTranslation.value = {
          source: message.originalText,
          target: message.translatedText,
          provider: message.provider,
          timestamp: message.timestamp,
        };
        console.log("[usePopupTranslation] Translation updated successfully");
      }
    });
  });

  // Clean up listener on unmount
  onUnmounted(() => {
    // No specific cleanup needed for browser.runtime.onMessage.addListener
    // as it's managed by the browser's lifecycle for extension pages.
  });

  return {
    // State
    sourceText,
    translatedText,
    isTranslating,
    translationError,
    hasTranslation,
    canTranslate,
    lastTranslation,

    // Methods
    triggerTranslation,
    clearTranslation,
    loadLastTranslation,
  };
}
