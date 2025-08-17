// Lightweight translation composable specifically for popup
// Simplified version without heavy dependencies
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useSettingsStore } from "@/store/core/settings.js";
import { useBrowserAPI } from "@/composables/useBrowserAPI.js";
import { useTranslationError } from "@/composables/useTranslationError.js";
import { generateMessageId } from "../utils/messaging/messageId.js";
import { isSingleWordOrShortPhrase } from "../utils/text/detection.js";
import { TranslationMode } from "@/config.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { getScopedLogger } from '@/utils/core/logger.js';
const logger = getScopedLogger('UI', 'usePopupTranslation');

export function usePopupTranslation() {
  // State
  const sourceText = ref("");
  const translatedText = ref("");
  const isTranslating = ref(false);
  const lastTranslation = ref(null);

  // Store
  const settingsStore = useSettingsStore();

  // Browser API
  const browserAPI = useBrowserAPI();
  
  // Error management
  const errorManager = useTranslationError('popup');

  // Computed
  const hasTranslation = computed(() => Boolean(translatedText.value?.trim()));
  const canTranslate = computed(
    () => Boolean(sourceText.value?.trim()) && !isTranslating.value
  );

  // Methods
  const triggerTranslation = async (sourceLang = null, targetLang = null) => {
    if (!canTranslate.value) return false;

    isTranslating.value = true;
    errorManager.clearError(); // Clear previous errors
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
        errorManager.handleError(error);
      });

      logger.operation('Translation request sent. Waiting for result...');
      
      return true; // Indicate successful initiation
    } catch (error) {
      logger.error('Translation error', error);
      await errorManager.handleError(error);
      isTranslating.value = false; // Ensure loading state is reset on immediate error
      return false; // Indicate failure
    }
  };

  const clearTranslation = () => {
    sourceText.value = "";
    translatedText.value = "";
    errorManager.clearError();
    lastTranslation.value = null;
  };

  const loadLastTranslation = () => {
    if (lastTranslation.value) {
      sourceText.value = lastTranslation.value.source;
      translatedText.value = lastTranslation.value.target;
    }
  };

  // Listener reference for cleanup
  let popupMessageListener = null

  // Listen for translation result updates from background script
  onMounted(() => {
    // Register a named listener so we can remove it on unmount
    popupMessageListener = (message) => {
      logger.debug('Raw message received by listener:', message);
      if (message.action === MessageActions.TRANSLATION_RESULT_UPDATE) {
        logger.debug('Received TRANSLATION_RESULT_UPDATE:', message);

        // Always reset loading state when receiving any result
        isTranslating.value = false;

        if (message.data.success === false && message.data.error) {
          // ERROR case - handle error with new error management system
          logger.error('Translation error received', message.data.error);
          // Extract error message from error object
          const errorMessage = message.data.error?.message || message.data.error?.type || message.data.error || "Translation failed";
          errorManager.handleError(errorMessage);
          translatedText.value = ""; // Clear any previous translation
          lastTranslation.value = null; // Clear last translation on error
        } else if (message.data.success !== false && message.data.translatedText) {
          // SUCCESS case - display translation and clear error
          logger.info('Translation success received');
          translatedText.value = message.data.translatedText;
          errorManager.clearError(); // Clear any previous error
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
          errorManager.handleError("Unexpected response format");
          translatedText.value = "";
        }
      } else {
        logger.debug('Message filtered out. Action:', message.action, 'Context:', message.context);
      }
    };

    browserAPI.onMessage.addListener(popupMessageListener);
  });

  // Clean up listener on unmount
  onUnmounted(() => {
    // Remove the popup message listener to avoid duplicate handlers on remount
    try {
      if (typeof popupMessageListener === 'function') {
        browserAPI.onMessage.removeListener(popupMessageListener);
      }
    } catch (err) {
      logger.warn('Failed to remove popup message listener on unmount:', err);
    }
  });

  return {
    // State
    sourceText,
    translatedText,
    isTranslating,
    hasTranslation,
    canTranslate,
    lastTranslation,

    // Error management (from errorManager)
    translationError: errorManager.errorMessage,
    hasError: errorManager.hasError,
    canRetry: errorManager.canRetry,
    canOpenSettings: errorManager.canOpenSettings,
    
    // Methods
    triggerTranslation,
    clearTranslation,
    loadLastTranslation,
    
    // Error methods
    getRetryCallback: errorManager.getRetryCallback,
    getSettingsCallback: errorManager.getSettingsCallback,
  };
}