// Lightweight translation composable specifically for sidepanel
// Based on usePopupTranslation but adapted for sidepanel context
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useSettingsStore } from "@/store/core/settings.js";
import { TranslationService } from "../core/TranslationService.js";
import { useBrowserAPI } from "@/composables/useBrowserAPI.js";
import browser from "webextension-polyfill";
import { MessagingContexts } from "../messaging/core/MessagingCore.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";

export function useSidepanelTranslation() {
  // State
  const sourceText = ref("");
  const translatedText = ref("");
  const isTranslating = ref(false);
  const translationError = ref("");
  const lastTranslation = ref(null);

  // Store
  const settingsStore = useSettingsStore();

  // Translation client
  const translationService = new TranslationService(MessagingContexts.SIDEPANEL);

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
    translatedText.value = ""; // Clear previous translation - SAME AS POPUP

    try {
      // Initiate translation request. The actual result will be received via TRANSLATION_RESULT_UPDATE message.
      await translationService.sidepanelTranslate(sourceText.value, settingsStore.settings.SOURCE_LANGUAGE, settingsStore.settings.TARGET_LANGUAGE);

      console.log("[useSidepanelTranslation] Translation request sent. Waiting for result...");

    } catch (error) {
      console.error("[useSidepanelTranslation] Translation error:", error);
      translationError.value = error.message || "Translation failed";
      isTranslating.value = false; // Ensure loading state is reset on immediate error
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
    browser.runtime.onMessage.addListener((message) => {
      console.log("[useSidepanelTranslation] Raw message received by listener:", message);
      if (
        message.action === MessageActions.TRANSLATION_RESULT_UPDATE &&
        message.context === MessagingContexts.SIDEPANEL
      ) {
        console.log(
          "[useSidepanelTranslation] Received TRANSLATION_RESULT_UPDATE:",
          message,
        );
        translatedText.value = message.data.translatedText;
        translationError.value = ""; // Clear any previous error
        isTranslating.value = false;
        lastTranslation.value = {
          source: message.data.originalText,
          target: message.data.translatedText,
          provider: message.data.provider,
          timestamp: message.data.timestamp,
        };
        console.log("[useSidepanelTranslation] Translation updated successfully");
      } else {
        console.log("[useSidepanelTranslation] Message filtered out. Action:", message.action, "Context:", message.context);
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