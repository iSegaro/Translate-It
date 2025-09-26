// Unified translation composable for both popup and sidepanel
// Combines the logic from usePopupTranslation and useSidepanelTranslation
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useSettingsStore } from "@/features/settings/stores/settings.js";
import { useTranslationStore } from "@/features/translation/stores/translation.js";
import { useBrowserAPI } from "@/composables/core/useBrowserAPI.js";
import { useTranslationError } from "@/features/translation/composables/useTranslationError.js";
import { generateMessageId } from "@/utils/messaging/messageId.js";
import { isSingleWordOrShortPhrase } from "@/shared/utils/text/textAnalysis.js";
import { TranslationMode } from "@/shared/config/config.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { MessagingContexts } from "@/shared/messaging/core/MessagingCore.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import browser from "webextension-polyfill";
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/shared/config/config.js";
import { AUTO_DETECT_VALUE, DEFAULT_TARGET_LANGUAGE } from "@/shared/config/constants.js";
import { utilsFactory } from "@/utils/UtilsFactory.js";

// Lazy logger initialization to avoid TDZ issues
let logger = null;
function getLogger() {
  if (!logger) {
    try {
      logger = getScopedLogger(LOG_COMPONENTS.UI, 'useUnifiedTranslation');
      // Ensure logger is not null
      if (!logger) {
        logger = {
          debug: () => {},
          warn: () => {},
          error: () => {},
          info: () => {},
          init: () => {}
        };
      }
    } catch (error) {
      // Fallback to noop logger
      logger = {
        debug: () => {},
        warn: () => {},
        error: () => {},
        info: () => {},
        init: () => {}
      };
    }
  }
  return logger;
}

export function useUnifiedTranslation(context = 'popup') {
  // Validate context
  const validContexts = ['popup', 'sidepanel'];
  if (!validContexts.includes(context)) {
    throw new Error(`Invalid context: ${context}. Must be one of: ${validContexts.join(', ')}`);
  }

  // --- State ---
  const sourceText = ref("");
  const translatedText = ref("");
  const sourceLanguage = ref(AUTO_DETECT_VALUE);
  const targetLanguage = ref(DEFAULT_TARGET_LANGUAGE);
  const isTranslating = ref(false);
  const lastTranslation = ref(null);
  
  const pendingRequests = ref(new Set());
  const loadingStartTime = ref(null);
  const MINIMUM_LOADING_DURATION = 100;

  // --- Stores & Composables ---
  const settingsStore = useSettingsStore();
  const translationStore = useTranslationStore();
  const browserAPI = context === 'popup' ? useBrowserAPI() : null;
  const errorManager = useTranslationError(context);

  // --- Computed Properties ---
  const hasTranslation = computed(() => Boolean(translatedText.value?.trim()));
  const canTranslate = computed(
    () => Boolean(sourceText.value?.trim()) && !isTranslating.value
  );

  // --- Language Management ---
  const resetLanguagesToDefaults = async () => {
    try {
      const { findLanguageCode } = await utilsFactory.getI18nUtils();
      const [savedSource, savedTarget] = await Promise.all([
        getSourceLanguageAsync(),
        getTargetLanguageAsync()
      ]);
      sourceLanguage.value = await findLanguageCode(savedSource) || AUTO_DETECT_VALUE;
      targetLanguage.value = await findLanguageCode(savedTarget) || DEFAULT_TARGET_LANGUAGE;
      getLogger().debug(`[${context}] Languages (re)set to defaults:`, { source: sourceLanguage.value, target: targetLanguage.value });
    } catch (error) {
      getLogger().error(`[${context}] Failed to reset languages:`, error);
      // Fallback to hardcoded defaults in case of storage error
      sourceLanguage.value = AUTO_DETECT_VALUE;
      targetLanguage.value = DEFAULT_TARGET_LANGUAGE;
    }
  };

  // --- Translation Logic ---
  const getTranslationMode = (text) => {
    const baseMode = context === 'popup' ? TranslationMode.Popup_Translate : TranslationMode.Sidepanel_Translate;
    const isDictionaryCandidate = isSingleWordOrShortPhrase(text);
    
    if (settingsStore.settings.ENABLE_DICTIONARY && isDictionaryCandidate) {
      return TranslationMode.Dictionary_Translation;
    }
    
    return baseMode;
  };

  const createTranslationRequest = (sourceLang, targetLang, messageId) => {
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
        sourceLanguage: sourceLang || sourceLanguage.value,
        targetLanguage: targetLang || targetLanguage.value,
        mode: mode,
        options: {}
      }
    };
  };

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
    getLogger().info(`[${context}] Translation updated successfully`);
  };

  const handleTranslationError = (error, messageId = null) => {
    const errorMessage = error?.message || error?.type || error || "Translation failed";
    errorManager.handleError(errorMessage);
    translatedText.value = "";
    lastTranslation.value = null;
    
    if (messageId && context === 'sidepanel') {
      pendingRequests.value.delete(messageId);
    }
    
    getLogger().error(`[${context}] Translation error:`, errorMessage);
  };

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

  const triggerTranslation = async (sourceLang = null, targetLang = null) => {
    if (!canTranslate.value) return false;

    isTranslating.value = true;
    if (context === 'sidepanel') {
      loadingStartTime.value = Date.now();
    }
    errorManager.clearError();
    translatedText.value = "";

    if (context === 'sidepanel') await nextTick();

    try {
      const messageId = generateMessageId(context);
      const requestData = createTranslationRequest(sourceLang, targetLang, messageId);
      
      getLogger().debug(`[${context}] Translation request:`, requestData.data);

      if (context === 'sidepanel') {
        pendingRequests.value.add(messageId);
      }

      const { sendMessage } = await import('@/shared/messaging/core/UnifiedMessaging.js');
      const timeoutOptions = context === 'sidepanel' ? { totalTimeout: 20000, retries: 1 } : {};
      
      const response = await sendMessage(requestData, timeoutOptions);

      if (response && (response.result || response.data || response.translatedText)) {
        let resultData = response.result || response.data || response;
        
        if (resultData.success === false && resultData.error) {
          handleTranslationError(resultData.error, messageId);
        } else if (resultData.translatedText) {
          handleTranslationSuccess(resultData);
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

      if (context === 'popup') {
        getLogger().operation('Translation request sent. Waiting for result...');
      }
      return true;

    } catch (error) {
      getLogger().error(`[${context}] Failed to send/process translation request:`, error);
      handleTranslationError(error);
      isTranslating.value = false;
      await ensureMinimumLoadingDuration();
      return false;
    }
  };

  // --- Public Methods ---
  const clearTranslation = async () => {
    sourceText.value = "";
    translatedText.value = "";
    errorManager.clearError();
    lastTranslation.value = null;
    await resetLanguagesToDefaults();
  };

  const loadLastTranslation = () => {
    if (lastTranslation.value) {
      sourceText.value = lastTranslation.value.source;
      translatedText.value = lastTranslation.value.target;
    }
  };

  // --- Lifecycle & Watchers ---
  watch(() => translationStore.currentTranslation, async (newTranslation) => {
    if (newTranslation) {
      const { findLanguageCode } = await utilsFactory.getI18nUtils();
      getLogger().debug(`[${context}] Syncing with store currentTranslation:`, newTranslation);
      sourceText.value = newTranslation.sourceText || '';
      translatedText.value = newTranslation.translatedText || '';
      sourceLanguage.value = await findLanguageCode(newTranslation.sourceLanguage) || AUTO_DETECT_VALUE;
      targetLanguage.value = await findLanguageCode(newTranslation.targetLanguage) || DEFAULT_TARGET_LANGUAGE;
      errorManager.clearError();
    }
  }, { deep: true });

  let messageListener = null;

  onMounted(async () => {
    await resetLanguagesToDefaults();

    messageListener = (message) => {
      if (context === 'popup') {
        getLogger().debug(`[${context}] Raw message received:`, message);
        let resultData = message.result || message.data || (message.translatedText ? message : null);

        if (resultData && (resultData.translatedText || resultData.success === false)) {
          isTranslating.value = false;
          if (resultData.success === false && resultData.error) {
            handleTranslationError(resultData.error);
          } else if (resultData.translatedText) {
            handleTranslationSuccess(resultData);
          } else {
            handleTranslationError("Unexpected response format");
          }
        }
      } else if (context === 'sidepanel') {
        if (message.action !== MessageActions.TRANSLATION_RESULT_UPDATE || (message.context && message.context !== MessagingContexts.SIDEPANEL)) {
          return;
        }
        const messageId = message.messageId;
        if (messageId && !pendingRequests.value.has(messageId)) return;
        if (messageId) pendingRequests.value.delete(messageId);

        nextTick(async () => {
          await ensureMinimumLoadingDuration();
          isTranslating.value = false;
          if (message.data.success === false && message.data.error) {
            handleTranslationError(message.data.error);
          } else if (message.data.translatedText) {
            handleTranslationSuccess(message.data);
          } else {
            handleTranslationError("Unexpected response format in sidepanel");
          }
        });
      }
    };

    const messageTarget = context === 'popup' && browserAPI ? browserAPI.onMessage : browser.runtime.onMessage;
    messageTarget.addListener(messageListener);
  });

  onUnmounted(() => {
    if (messageListener) {
      try {
        const messageTarget = context === 'popup' && browserAPI ? browserAPI.onMessage : browser.runtime.onMessage;
        messageTarget.removeListener(messageListener);
      } catch (err) {
        getLogger().warn(`[${context}] Failed to remove message listener:`, err);
      }
    }
    if (context === 'sidepanel') {
      pendingRequests.value.clear();
    }
  });

  return {
    // State
    sourceText,
    translatedText,
    sourceLanguage,
    targetLanguage,
    isTranslating,
    hasTranslation,
    canTranslate,
    lastTranslation,
    // Error management
    translationError: errorManager.errorMessage,
    hasError: errorManager.hasError,
    canRetry: errorManager.canRetry,
    canOpenSettings: errorManager.canOpenSettings,
    // Methods
    triggerTranslation,
    clearTranslation,
    loadLastTranslation,
    getRetryCallback: errorManager.getRetryCallback,
    getSettingsCallback: errorManager.getSettingsCallback,
    // Context
    context
  };
}
