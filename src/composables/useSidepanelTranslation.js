// Lightweight translation composable specifically for sidepanel
// Based on usePopupTranslation but adapted for sidepanel context
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useSettingsStore } from "@/store/core/settings.js";
import browser from "webextension-polyfill";
import { useTranslationError } from "@/composables/useTranslationError.js";
import { generateMessageId } from "../utils/messaging/messageId.js";
import { isSingleWordOrShortPhrase } from "../utils/text/detection.js";
import { TranslationMode } from "@/config.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { MessagingContexts } from "@/messaging/core/MessagingCore.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useSidepanelTranslation');

export function useSidepanelTranslation() {
  // State
  const sourceText = ref("");
  const translatedText = ref("");
  const isTranslating = ref(false);
  const lastTranslation = ref(null);
  
  // Track pending requests to avoid race conditions
  const pendingRequests = ref(new Set());
  
  // Track loading start time for minimum spinner duration
  const loadingStartTime = ref(null);
  const MINIMUM_LOADING_DURATION = 100; // Minimum 100ms to show spinner

  // Store
  const settingsStore = useSettingsStore();
  
  // Error management
  const errorManager = useTranslationError('sidepanel');


  // Computed
  const hasTranslation = computed(() => Boolean(translatedText.value?.trim()));
  const canTranslate = computed(
    () => Boolean(sourceText.value?.trim()) && !isTranslating.value,
  );

  // Methods
  const triggerTranslation = async (sourceLang = null, targetLang = null) => {
    if (!canTranslate.value) return false;

    try {
      // Set loading state and clear previous results
      isTranslating.value = true;
      loadingStartTime.value = Date.now(); // Track when loading started
      errorManager.clearError(); // Clear previous errors
      translatedText.value = ""; // Clear previous translation - SAME AS POPUP

      // Force UI update using nextTick to ensure spinner is shown
      await nextTick();
      
      // Use provided languages or fallback to settings
      const sourceLanguage = sourceLang || settingsStore.settings.SOURCE_LANGUAGE;
      const targetLanguage = targetLang || settingsStore.settings.TARGET_LANGUAGE;
      
      // Get current provider from settings
      const currentProvider = settingsStore.settings.TRANSLATION_API || 'google';
      const messageId = generateMessageId('sidepanel');
      
      // Track this request to avoid race conditions
      pendingRequests.value.add(messageId);
      
      // Determine translation mode (same logic as TranslationService.sidepanelTranslate)
      let mode = TranslationMode.Sidepanel_Translate;
      const isDictionaryCandidate = isSingleWordOrShortPhrase(sourceText.value);
      if (settingsStore.settings.ENABLE_DICTIONARY && isDictionaryCandidate) {
        mode = TranslationMode.Dictionary_Translation;
      }
      
      // Send translation request using reliable messenger (retries + port fallback)
      try {
        const { sendReliable } = await import('@/messaging/core/ReliableMessaging.js')
        const response = await sendReliable({
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
        })
        
        // Handle the response directly
        if (response && response.result && response.result.success) {
          const result = response.result;
          translatedText.value = result.translatedText;
          lastTranslation.value = {
            text: sourceText.value,
            translatedText: result.translatedText,
            sourceLanguage: result.sourceLanguage,
            targetLanguage: result.targetLanguage,
            provider: result.provider,
            timestamp: result.timestamp
          };
          pendingRequests.value.delete(messageId);
          
          // Ensure minimum loading duration
          const elapsed = Date.now() - loadingStartTime.value;
          const remaining = Math.max(0, MINIMUM_LOADING_DURATION - elapsed);
          
          setTimeout(() => {
            isTranslating.value = false;
            loadingStartTime.value = null;
          }, remaining);
          
          logger.debug("[useSidepanelTranslation] Translation successful:", result.translatedText);
          return true;
        } else {
          throw new Error(response?.result?.error || 'Translation failed');
        }
      } catch (error) {
        logger.error("Failed to send translation request (reliable)", error);
        // Clean up pending request and reset loading state if message sending fails
        pendingRequests.value.delete(messageId);
        isTranslating.value = false;
        loadingStartTime.value = null;
        errorManager.handleError("Failed to send translation request");
        return null;
      }

      return true;

    } catch (error) {
      logger.error("[useSidepanelTranslation] Translation error:", error);
      await errorManager.handleError(error);
      isTranslating.value = false; // Ensure loading state is reset on immediate error
      loadingStartTime.value = null;
      return false;
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

  // Internal methods for specific UI operations (history, store integration)
  const _setTranslationResult = (text) => {
    translatedText.value = text;
    errorManager.clearError();
  };

  const _setSourceText = (text) => {
    sourceText.value = text;
  };

  // Listen for translation result updates from background script
  onMounted(() => {
    const messageListener = (message) => {
      if (
        message.action === MessageActions.TRANSLATION_RESULT_UPDATE
      ) {
        // Only process messages intended for sidepanel or without specific context
        if (message.context && message.context !== MessagingContexts.SIDEPANEL) {
          return;
        }
        
        // Check if this message is for a pending request
        const messageId = message.messageId;
        if (messageId && !pendingRequests.value.has(messageId)) {
          return;
        }
        
        // Remove from pending requests
        if (messageId) {
          pendingRequests.value.delete(messageId);
        }
        
        // Ensure minimum loading duration for better UX
        const ensureMinimumLoadingDuration = async () => {
          if (loadingStartTime.value) {
            const elapsed = Date.now() - loadingStartTime.value;
            const remaining = MINIMUM_LOADING_DURATION - elapsed;
            
            if (remaining > 0) {
              await new Promise(resolve => setTimeout(resolve, remaining));
            }
            
            loadingStartTime.value = null;
          }
        };
        
        // Always reset loading state when receiving any result
        // Use nextTick to ensure UI is properly updated
        nextTick(async () => {
          // Wait for minimum duration before hiding spinner
          await ensureMinimumLoadingDuration();
          
          isTranslating.value = false;
          
          if (message.data.success === false && message.data.error) {
            // ERROR case - handle error with new error management system
            // Extract error message from error object
            const errorMessage = message.data.error?.message || message.data.error?.type || message.data.error || "Translation failed";
            errorManager.handleError(errorMessage);
            translatedText.value = ""; // Clear any previous translation
            lastTranslation.value = null; // Clear last translation on error
          } else if (message.data.success !== false && message.data.translatedText) {
            // SUCCESS case - display translation and clear error
            translatedText.value = message.data.translatedText;
            errorManager.clearError(); // Clear any previous error
            lastTranslation.value = {
              source: message.data.originalText,
              target: message.data.translatedText,
              provider: message.data.provider,
              timestamp: message.data.timestamp,
            };
            
          } else {
            // UNEXPECTED case - handle gracefully
            logger.warn("[useSidepanelTranslation] Unexpected message data structure:", message.data);
            errorManager.handleError("Unexpected response format");
            translatedText.value = "";
          }
        });
      }
    };
    
    browser.runtime.onMessage.addListener(messageListener);
    
    // Store reference for cleanup
    const cleanupListener = () => {
      browser.runtime.onMessage.removeListener(messageListener);
      pendingRequests.value.clear(); // Clear any pending requests
    };
    
    onUnmounted(cleanupListener);
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
    
    // Internal methods (prefixed with _ to indicate internal use)
    _setTranslationResult,
    _setSourceText,
    
    // Error methods
    getRetryCallback: errorManager.getRetryCallback,
    getSettingsCallback: errorManager.getSettingsCallback,
  };
}