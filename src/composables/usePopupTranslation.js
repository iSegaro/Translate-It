// Lightweight translation composable specifically for popup
// Simplified version without heavy dependencies
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useSettingsStore } from "@/store/core/settings.js";
import { useBrowserAPI } from "@/composables/useBrowserAPI.js";
import { generateMessageId } from "../utils/messaging/messageId.js";
import { isSingleWordOrShortPhrase } from "../utils/text/detection.js";
import { TranslationMode } from "@/config.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'usePopupTranslation');

export function usePopupTranslation() {
  // State
  const sourceText = ref("");
  const translatedText = ref("");
  const isTranslating = ref(false);
  const translationError = ref("");
  const lastTranslation = ref(null);

  // Store
  const settingsStore = useSettingsStore();


  // Browser API
  const browserAPI = useBrowserAPI();

  // Computed
  const hasTranslation = computed(() => Boolean(translatedText.value?.trim()));
  const canTranslate = computed(
    () => Boolean(sourceText.value?.trim()) && !isTranslating.value
  );

  // Methods
  const triggerTranslation = async (sourceLang = null, targetLang = null) => {
    if (!canTranslate.value) return false;

    isTranslating.value = true;
    translationError.value = "";
    translatedText.value = ""; // Clear previous translation

    try {
      // Use provided languages or fallback to settings
      const sourceLanguage = sourceLang || settingsStore.settings.SOURCE_LANGUAGE;
      const targetLanguage = targetLang || settingsStore.settings.TARGET_LANGUAGE;
      
      logger.debug("Translation with languages (received params):", { sourceLang, targetLang });
      logger.debug("Translation with languages (final):", { sourceLanguage, targetLanguage });
      
      // Get current provider from settings
      const currentProvider = settingsStore.settings.TRANSLATION_API || 'google-translate';
      const messageId = generateMessageId('popup');
      
      // Determine translation mode (same logic as sidepanel)
      let mode = TranslationMode.Popup_Translate;
      const isDictionaryCandidate = isSingleWordOrShortPhrase(sourceText.value);
      if (settingsStore.settings.ENABLE_DICTIONARY && isDictionaryCandidate) {
        mode = TranslationMode.Dictionary_Translation;
      }
      
      // Send direct message to background using browser.runtime.sendMessage 
      // (bypassing UnifiedMessenger to avoid timeout issues)
      browserAPI.sendMessage({
        action: MessageActions.TRANSLATE,
        messageId: messageId,
        context: 'popup',
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

      logger.operation('Translation request sent. Waiting for result...');
      
      return true; // Indicate successful initiation
    } catch (error) {
      logger.error('Translation error', error);
      translationError.value = error.message || "Translation failed";
      isTranslating.value = false; // Ensure loading state is reset on immediate error
      return false; // Indicate failure
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
      logger.debug('Raw message received by listener:', message);
      if (
        message.action === MessageActions.TRANSLATION_RESULT_UPDATE
      ) {
        logger.debug('Received TRANSLATION_RESULT_UPDATE:', message);
        
        // Always reset loading state when receiving any result
        isTranslating.value = false;
        
        if (message.data.success === false && message.data.error) {
          // ERROR case - display error message and clear translation
          logger.error('Translation error received', message.data.error);
          translationError.value = message.data.error.message || "Translation failed";
          translatedText.value = ""; // Clear any previous translation
          lastTranslation.value = null; // Clear last translation on error
          logger.debug('Error state updated:', translationError.value);
        } else if (message.data.success !== false && message.data.translatedText) {
          // SUCCESS case - display translation and clear error
          logger.info('Translation success received');
          translatedText.value = message.data.translatedText;
          translationError.value = ""; // Clear any previous error
          lastTranslation.value = {
            source: message.data.originalText,
            target: message.data.translatedText,
            provider: message.data.provider,
            timestamp: message.data.timestamp,
          };
          logger.info('Translation updated successfully');
        } else {
          // UNEXPECTED case - handle gracefully
          logger.warn('Unexpected message data structure:', message.data);
          translationError.value = "Unexpected response format";
          translatedText.value = "";
        }
      } else {
        logger.debug('Message filtered out. Action:', message.action, 'Context:', message.context);
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