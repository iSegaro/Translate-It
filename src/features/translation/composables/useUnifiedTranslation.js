// Unified translation composable for both popup and sidepanel
// Combines the logic from usePopupTranslation and useSidepanelTranslation
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useSettingsStore } from "@/features/settings/stores/settings.js";
import { useBrowserAPI } from "@/composables/core/useBrowserAPI.js";
import { useTranslationError } from "@/features/translation/composables/useTranslationError.js";
import { generateMessageId } from "@/utils/messaging/messageId.js";
import { isSingleWordOrShortPhrase } from "@/utils/text/detection.js";
import { TranslationMode } from "@/shared/config/config.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { MessagingContexts } from "@/shared/messaging/core/MessagingCore.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import browser from "webextension-polyfill";

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useUnifiedTranslation');

export function useUnifiedTranslation(context = 'popup') {
  // Validate context
  const validContexts = ['popup', 'sidepanel'];
  if (!validContexts.includes(context)) {
    throw new Error(`Invalid context: ${context}. Must be one of: ${validContexts.join(', ')}`);
  }

  // State
  const sourceText = ref("");
  const translatedText = ref("");
  const isTranslating = ref(false);
  const lastTranslation = ref(null);
  
  // Context-specific state
  const pendingRequests = ref(new Set()); // For sidepanel race condition management
  const loadingStartTime = ref(null); // For sidepanel minimum loading duration
  const MINIMUM_LOADING_DURATION = 100; // Minimum 100ms to show spinner

  // Store
  const settingsStore = useSettingsStore();

  // Browser API (popup uses useBrowserAPI, sidepanel uses direct browser)
  const browserAPI = context === 'popup' ? useBrowserAPI() : null;
  
  // Error management
  const errorManager = useTranslationError(context);

  // Computed
  const hasTranslation = computed(() => Boolean(translatedText.value?.trim()));
  const canTranslate = computed(
    () => Boolean(sourceText.value?.trim()) && !isTranslating.value
  );

  // Translation mode determination (common logic)
  const getTranslationMode = (text) => {
    const baseMode = context === 'popup' ? TranslationMode.Popup_Translate : TranslationMode.Sidepanel_Translate;
    const isDictionaryCandidate = isSingleWordOrShortPhrase(text);
    
    if (settingsStore.settings.ENABLE_DICTIONARY && isDictionaryCandidate) {
      return TranslationMode.Dictionary_Translation;
    }
    
    return baseMode;
  };

  // Create translation request data (common logic)
  const createTranslationRequest = (sourceLang, targetLang, messageId) => {
    const sourceLanguage = sourceLang || settingsStore.settings.SOURCE_LANGUAGE;
    const targetLanguage = targetLang || settingsStore.settings.TARGET_LANGUAGE;
    const currentProvider = settingsStore.settings.TRANSLATION_API || (context === 'popup' ? 'google-translate' : 'google');
    const mode = getTranslationMode(sourceText.value);

    return {
      action: MessageActions.TRANSLATE,
      messageId: messageId,
      context: context,
      timestamp: Date.now(),
      data: {
        text: sourceText.value,
        provider: currentProvider,
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        mode: mode,
        options: {}
      }
    };
  };

  // Handle translation success (common logic)
  const handleTranslationSuccess = (resultData) => {
    translatedText.value = resultData.translatedText;
    errorManager.clearError();
    lastTranslation.value = {
      source: resultData.originalText || sourceText.value,
      target: resultData.translatedText,
      provider: resultData.provider,
      timestamp: resultData.timestamp || Date.now(),
      sourceLanguage: resultData.sourceLanguage,
      targetLanguage: resultData.targetLanguage
    };
    logger.info(`[${context}] Translation updated successfully`);
  };

  // Handle translation error (common logic)
  const handleTranslationError = (error, messageId = null) => {
    const errorMessage = error?.message || error?.type || error || "Translation failed";
    errorManager.handleError(errorMessage);
    translatedText.value = "";
    lastTranslation.value = null;
    
    // Clean up pending request if provided
    if (messageId && context === 'sidepanel') {
      pendingRequests.value.delete(messageId);
    }
    
    logger.error(`[${context}] Translation error:`, errorMessage);
  };

  // Ensure minimum loading duration (sidepanel-specific)
  const ensureMinimumLoadingDuration = async () => {
    if (context === 'sidepanel' && loadingStartTime.value) {
      const elapsed = Date.now() - loadingStartTime.value;
      const remaining = Math.max(0, MINIMUM_LOADING_DURATION - elapsed);
      
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining));
      }
      
      loadingStartTime.value = null;
    }
  };

  // Main translation method
  const triggerTranslation = async (sourceLang = null, targetLang = null) => {
    if (!canTranslate.value) return false;

    // Set loading state and clear previous results
    isTranslating.value = true;
    if (context === 'sidepanel') {
      loadingStartTime.value = Date.now();
    }
    errorManager.clearError();
    translatedText.value = "";

    // Force UI update for sidepanel
    if (context === 'sidepanel') {
      await nextTick();
    }

    try {
      const messageId = generateMessageId(context);
      const requestData = createTranslationRequest(sourceLang, targetLang, messageId);
      
      logger.debug(`[${context}] Translation request:`, {
        sourceLang: requestData.data.sourceLanguage,
        targetLang: requestData.data.targetLanguage,
        provider: requestData.data.provider
      });

      // Track request for sidepanel
      if (context === 'sidepanel') {
        pendingRequests.value.add(messageId);
      }

      // Send translation request using smart messaging
      try {
        const { sendSmart } = await import('@/shared/messaging/core/SmartMessaging.js');
        const timeoutOptions = context === 'sidepanel' ? {
          totalTimeout: 20000,
          retries: 1
        } : {};
        
        const response = await sendSmart(requestData, timeoutOptions);

        // Handle direct response (mainly for sidepanel)
        if (response && (response.result || response.data || response.translatedText)) {
          let resultData = response.result || response.data || response;
          
          if (resultData.success === false && resultData.error) {
            handleTranslationError(resultData.error, messageId);
          } else if (resultData.translatedText) {
            handleTranslationSuccess(resultData);
            
            // Clean up for sidepanel
            if (context === 'sidepanel') {
              pendingRequests.value.delete(messageId);
              await ensureMinimumLoadingDuration();
            }
          }
          
          isTranslating.value = false;
          return true;
        } else if (response && response.success === false && response.error) {
          handleTranslationError(response.error, messageId);
          isTranslating.value = false;
          return false;
        }

        // For popup, response might come via message listener
        if (context === 'popup') {
          logger.operation('Translation request sent. Waiting for result...');
          return true;
        }

      } catch (error) {
        logger.error(`[${context}] Failed to send translation request:`, error);
        handleTranslationError(error, messageId);
        isTranslating.value = false;
        await ensureMinimumLoadingDuration();
        return false;
      }

      return true;

    } catch (error) {
      logger.error(`[${context}] Translation error:`, error);
      await errorManager.handleError(error);
      isTranslating.value = false;
      await ensureMinimumLoadingDuration();
      return false;
    }
  };

  // Common utility methods
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

  // Internal methods for specific UI operations
  const _setTranslationResult = (text) => {
    translatedText.value = text;
    errorManager.clearError();
  };

  const _setSourceText = (text) => {
    sourceText.value = text;
  };

  // Message listener setup
  let messageListener = null;

  onMounted(() => {
    // Create context-specific message listener
    messageListener = (message) => {
      if (context === 'popup') {
        // Popup message handling logic
        logger.debug(`[${context}] Raw message received:`, message);
        
        let resultData = null;
        if (message.result) {
          resultData = message.result;
        } else if (message.data) {
          resultData = message.data;
        } else if (message.translatedText) {
          resultData = message;
        }

        if (resultData && (resultData.translatedText || resultData.success === false)) {
          isTranslating.value = false;

          if (resultData.success === false && resultData.error) {
            handleTranslationError(resultData.error);
          } else if (resultData.translatedText) {
            handleTranslationSuccess(resultData);
          } else {
            logger.warn(`[${context}] Unexpected message data structure:`, resultData);
            handleTranslationError("Unexpected response format");
          }
        }
        
      } else if (context === 'sidepanel') {
        // Sidepanel message handling logic
        if (message.action !== MessageActions.TRANSLATION_RESULT_UPDATE) {
          return;
        }

        // Only process messages for this context
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

        // Handle the result with minimum loading duration
        nextTick(async () => {
          await ensureMinimumLoadingDuration();
          isTranslating.value = false;

          if (message.data.success === false && message.data.error) {
            handleTranslationError(message.data.error);
          } else if (message.data.success !== false && message.data.translatedText) {
            handleTranslationSuccess(message.data);
          } else {
            logger.warn(`[${context}] Unexpected message data structure:`, message.data);
            handleTranslationError("Unexpected response format");
          }
        });
      }
    };

    // Register listener based on context
    if (context === 'popup' && browserAPI) {
      browserAPI.onMessage.addListener(messageListener);
    } else if (context === 'sidepanel') {
      browser.runtime.onMessage.addListener(messageListener);
    }
  });

  // Cleanup on unmount
  onUnmounted(() => {
    if (messageListener) {
      try {
        if (context === 'popup' && browserAPI) {
          browserAPI.onMessage.removeListener(messageListener);
        } else if (context === 'sidepanel') {
          browser.runtime.onMessage.removeListener(messageListener);
        }
      } catch (err) {
        logger.warn(`[${context}] Failed to remove message listener:`, err);
      }
    }

    // Clean up pending requests for sidepanel
    if (context === 'sidepanel') {
      pendingRequests.value.clear();
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

    // Internal methods (prefixed with _ to indicate internal use)
    _setTranslationResult,
    _setSourceText,

    // Error methods
    getRetryCallback: errorManager.getRetryCallback,
    getSettingsCallback: errorManager.getSettingsCallback,
    
    // Context information
    context
  };
}