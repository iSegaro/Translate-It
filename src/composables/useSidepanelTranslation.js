// Lightweight translation composable specifically for sidepanel
// Based on usePopupTranslation but adapted for sidepanel context
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useSettingsStore } from "@/store/core/settings.js";
import browser from "webextension-polyfill";
import { generateMessageId } from "../utils/messaging/messageId.js";
import { isSingleWordOrShortPhrase } from "../utils/text/detection.js";
import { TranslationMode } from "@/config.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { MessagingContexts } from "@/messaging/core/MessagingCore.js";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('UI', 'useSidepanelTranslation');

export function useSidepanelTranslation() {
  // State
  const sourceText = ref("");
  const translatedText = ref("");
  const isTranslating = ref(false);
  const translationError = ref("");
  const lastTranslation = ref(null);

  // Store
  const settingsStore = useSettingsStore();


  // Computed
  const hasTranslation = computed(() => Boolean(translatedText.value?.trim()));
  const canTranslate = computed(
    () => Boolean(sourceText.value?.trim()) && !isTranslating.value,
  );

  // Methods
  const triggerTranslation = async (sourceLang = null, targetLang = null) => {
    if (!canTranslate.value) return;

    isTranslating.value = true;
    translationError.value = "";
    translatedText.value = ""; // Clear previous translation - SAME AS POPUP

    try {
      // Use provided languages or fallback to settings
      const sourceLanguage = sourceLang || settingsStore.settings.SOURCE_LANGUAGE;
      const targetLanguage = targetLang || settingsStore.settings.TARGET_LANGUAGE;
      
      logger.debug("[useSidepanelTranslation] Translation with languages (received params):", { sourceLang, targetLang });
      logger.debug("[useSidepanelTranslation] Translation with languages (final):", { sourceLanguage, targetLanguage });
      
      // Get current provider from settings
      const currentProvider = settingsStore.settings.TRANSLATION_API || 'google';
      const messageId = generateMessageId('sidepanel');
      
      // Determine translation mode (same logic as TranslationService.sidepanelTranslate)
      let mode = TranslationMode.Sidepanel_Translate;
      const isDictionaryCandidate = isSingleWordOrShortPhrase(sourceText.value);
      if (settingsStore.settings.ENABLE_DICTIONARY && isDictionaryCandidate) {
        mode = TranslationMode.Dictionary_Translation;
      }
      
      // Send direct message to background using browser.runtime.sendMessage 
      // (bypassing UnifiedMessenger to avoid timeout issues)
      browser.runtime.sendMessage({
        action: MessageActions.TRANSLATE,
        messageId: messageId,
        context: 'sidepanel',
        timestamp: Date.now(),
        data: {
          text: sourceText.value,
          provider: currentProvider,
          sourceLanguage: sourceLanguage,
          targetLanguage: targetLanguage,
          mode: mode,
          options: {}
        }
      }).catch(error => {
        logger.error("Failed to send translation request", error);
      });

      logger.debug("[useSidepanelTranslation] Translation request sent. Waiting for result...");

    } catch (error) {
      logger.error("[useSidepanelTranslation] Translation error:", error);
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
      logger.debug("[useSidepanelTranslation] Raw message received by listener:", message);
      if (
        message.action === MessageActions.TRANSLATION_RESULT_UPDATE
      ) {
        // Only process messages intended for sidepanel or without specific context
        if (message.context && message.context !== MessagingContexts.SIDEPANEL) {
          logger.debug("[useSidepanelTranslation] Message filtered out. Context:", message.context, "Expected:", MessagingContexts.SIDEPANEL);
          return;
        }
        
        logger.debug(
          "[useSidepanelTranslation] Received TRANSLATION_RESULT_UPDATE:",
          message,
        );
        
        // Always reset loading state when receiving any result
        isTranslating.value = false;
        
        if (message.data.success === false && message.data.error) {
          // ERROR case - display error message and clear translation
          logger.debug("[useSidepanelTranslation] Translation error received:", message.data.error);
          translationError.value = message.data.error.message || "Translation failed";
          translatedText.value = ""; // Clear any previous translation
          lastTranslation.value = null; // Clear last translation on error
          logger.debug("[useSidepanelTranslation] Error state updated:", translationError.value);
        } else if (message.data.success !== false && message.data.translatedText) {
          // SUCCESS case - display translation and clear error
          logger.debug("[useSidepanelTranslation] Translation success received");
          translatedText.value = message.data.translatedText;
          translationError.value = ""; // Clear any previous error
          lastTranslation.value = {
            source: message.data.originalText,
            target: message.data.translatedText,
            provider: message.data.provider,
            timestamp: message.data.timestamp,
          };
          logger.debug("[useSidepanelTranslation] Translation updated successfully");
        } else {
          // UNEXPECTED case - handle gracefully
          logger.warn("[useSidepanelTranslation] Unexpected message data structure:", message.data);
          translationError.value = "Unexpected response format";
          translatedText.value = "";
        }
      } else {
        logger.debug("[useSidepanelTranslation] Message filtered out. Action:", message.action, "Context:", message.context);
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