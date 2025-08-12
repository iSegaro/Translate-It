// Lightweight translation composable specifically for sidepanel
// Based on usePopupTranslation but adapted for sidepanel context
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
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
  
  // Track pending requests to avoid race conditions
  const pendingRequests = ref(new Set());
  
  // Track loading start time for minimum spinner duration
  const loadingStartTime = ref(null);
  const MINIMUM_LOADING_DURATION = 100; // Minimum 100ms to show spinner

  // Store
  const settingsStore = useSettingsStore();


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
      translationError.value = "";
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
      
      // Send direct message to background using browser.runtime.sendMessage 
      // (bypassing UnifiedMessenger to avoid timeout issues)
      const messageResult = await browser.runtime.sendMessage({
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
        // Clean up pending request and reset loading state if message sending fails
        pendingRequests.value.delete(messageId);
        isTranslating.value = false;
        loadingStartTime.value = null;
        translationError.value = "Failed to send translation request";
        return null;
      });

      return true;

    } catch (error) {
      logger.error("[useSidepanelTranslation] Translation error:", error);
      translationError.value = error.message || "Translation failed";
      isTranslating.value = false; // Ensure loading state is reset on immediate error
      loadingStartTime.value = null;
      return false;
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
            // ERROR case - display error message and clear translation
            translationError.value = message.data.error.message || "Translation failed";
            translatedText.value = ""; // Clear any previous translation
            lastTranslation.value = null; // Clear last translation on error
          } else if (message.data.success !== false && message.data.translatedText) {
            // SUCCESS case - display translation and clear error
            translatedText.value = message.data.translatedText;
            translationError.value = ""; // Clear any previous error
            lastTranslation.value = {
              source: message.data.originalText,
              target: message.data.translatedText,
              provider: message.data.provider,
              timestamp: message.data.timestamp,
            };
          } else {
            // UNEXPECTED case - handle gracefully
            logger.warn("[useSidepanelTranslation] Unexpected message data structure:", message.data);
            translationError.value = "Unexpected response format";
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