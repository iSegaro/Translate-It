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
import { ProviderRegistryIds } from "@/features/translation/providers/ProviderConstants.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { MessagingContexts } from "@/shared/messaging/core/MessagingCore.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import browser from "webextension-polyfill";
import { getSourceLanguageAsync, getTargetLanguageAsync } from "@/shared/config/config.js";
import { AUTO_DETECT_VALUE, DEFAULT_TARGET_LANGUAGE } from "@/shared/config/constants.js";
import { utilsFactory } from "@/utils/UtilsFactory.js";

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useUnifiedTranslation');

/**
 * useUnifiedTranslation - Unified composable for translation features
 */
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
  const actualSourceLanguage = ref(AUTO_DETECT_VALUE);
  const actualTargetLanguage = ref(DEFAULT_TARGET_LANGUAGE);
  
  const pendingRequests = ref(new Set());
  const loadingStartTime = ref(null);
  const currentMessageId = ref(null);
  const MINIMUM_LOADING_DURATION = 100;

  /**
   * Cancels the currently active translation request.
   */
  const cancelTranslation = async () => {
    if (!isTranslating.value || !currentMessageId.value) return;

    logger.info(`[${context}] Cancelling translation: ${currentMessageId.value}`);
    
    try {
      const { sendMessage } = await import('@/shared/messaging/core/UnifiedMessaging.js');
      await sendMessage({
        action: MessageActions.CANCEL_TRANSLATION,
        data: { messageId: currentMessageId.value }
      });

      // Cleanup state immediately for better UX
      isTranslating.value = false;
      currentMessageId.value = null;
      loadingStartTime.value = null;
    } catch (error) {
      logger.error(`[${context}] Failed to cancel translation:`, error);
    }
  };

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

  /**
   * Returns the actual language detected by the provider/service during the last translation.
   * This is used to bypass redundant language detection in TTS.
   */
  const detectedSourceLanguage = computed(() => lastTranslation.value?.sourceLanguage || AUTO_DETECT_VALUE);

  // --- Language Management ---
  const resetLanguagesToDefaults = async () => {
    try {
      const { findLanguageCode } = await utilsFactory.getI18nUtils();
      const [savedSource, savedTarget] = await Promise.all([
        getSourceLanguageAsync(),
        getTargetLanguageAsync()
      ]);
      sourceLanguage.value = await findLanguageCode(savedSource) || AUTO_DETECT_VALUE;
      
      const targetLang = await findLanguageCode(savedTarget) || DEFAULT_TARGET_LANGUAGE;
      targetLanguage.value = targetLang;
      // Also sync store if it's the first time
      if (!translationStore.uiTargetLanguage) {
        translationStore.uiTargetLanguage = targetLang;
      }
      
      logger.debug(`[${context}] Languages (re)set to defaults:`, { source: sourceLanguage.value, target: targetLanguage.value });
    } catch (error) {
      logger.info(`[${context}] Failed to reset languages:`, error);
      // Fallback to hardcoded defaults in case of storage error
      sourceLanguage.value = AUTO_DETECT_VALUE;
      targetLanguage.value = DEFAULT_TARGET_LANGUAGE;
    }
  };

  // Watch for local targetLanguage changes to update store
  watch(targetLanguage, (newVal) => {
    if (newVal) {
      translationStore.uiTargetLanguage = newVal;
      // Also update actual language to reflect user's choice when manual selection changes
      actualTargetLanguage.value = newVal;
    }
  });

  // Watch for local sourceLanguage changes
  watch(sourceLanguage, (newVal) => {
    if (newVal) {
      actualSourceLanguage.value = newVal;
    }
  });

  // Reset lastTranslation when source text changes to ensure fresh detection for TTS
  // We keep translatedText as-is to prevent immediate UI clearing (better UX)
  watch(sourceText, (newVal, oldVal) => {
    if (newVal !== oldVal) {
      lastTranslation.value = null;
    }
  });

  // Watch for store changes to update local targetLanguage (for cross-component sync)
  watch(() => translationStore.uiTargetLanguage, (newVal) => {
    if (newVal && newVal !== targetLanguage.value) {
      targetLanguage.value = newVal;
    }
  });

  // --- Translation Logic ---
  const getTranslationMode = (text) => {
    const baseMode = context === 'popup' ? TranslationMode.Popup_Translate : TranslationMode.Sidepanel_Translate;
    const isDictionaryCandidate = isSingleWordOrShortPhrase(text);
    
    if (settingsStore.settings.ENABLE_DICTIONARY && isDictionaryCandidate) {
      return TranslationMode.Dictionary_Translation;
    }
    
    return baseMode;
  };

  const createTranslationRequest = (sourceLang, targetLang, messageId, overrideProvider = null) => {
    const currentProvider = overrideProvider || settingsStore.settings.TRANSLATION_API || ProviderRegistryIds.GOOGLE_V2;
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
    
    // Update actual languages used for TTS and labels
    if (resultData.sourceLanguage) actualSourceLanguage.value = resultData.sourceLanguage;
    if (resultData.targetLanguage) actualTargetLanguage.value = resultData.targetLanguage;

    // Update last translation metadata
    // We keep the actual source/target languages from the result for TTS and ActionToolbar labels
    // but we NO LONGER update the reactive targetLanguage/sourceLanguage refs to keep the dropdowns stable.
    lastTranslation.value = {
      source: resultData.originalText || sourceText.value,
      target: resultData.translatedText,
      provider: resultData.provider,
      timestamp: resultData.timestamp || Date.now(),
      sourceLanguage: resultData.sourceLanguage,
      targetLanguage: resultData.targetLanguage
    };

    // If same language translation, show appropriate message
    if (resultData.translatedText === null && resultData.sourceLanguage === resultData.targetLanguage) {
      const originalText = resultData.originalText || sourceText.value;
      translatedText.value = originalText;
      logger.debug(`[${context}] Same language detected - showing original text: "${originalText}"`);
    }

    logger.debug(`[${context}] Translation updated successfully - final translatedText: "${translatedText.value}"`);
  };

  const handleTranslationError = (error, messageId = null) => {
    errorManager.handleError(error);
    translatedText.value = "";
    lastTranslation.value = null;
    
    if (messageId && context === 'sidepanel') {
      pendingRequests.value.delete(messageId);
    }
    
    logger.debug(`[${context}] Translation error:`, error?.message || error);
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

  const triggerTranslation = async (sourceLang = null, targetLang = null, overrideProvider = null) => {
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
      currentMessageId.value = messageId;
      const requestData = createTranslationRequest(sourceLang, targetLang, messageId, overrideProvider);
      
      logger.debug(`[${context}] Translation request:`, requestData.data);

      if (context === 'sidepanel') {
        pendingRequests.value.add(messageId);
      }

      const { sendMessage } = await import('@/shared/messaging/core/UnifiedMessaging.js');
      const timeoutOptions = context === 'sidepanel' ? { totalTimeout: 20000, retries: 1 } : {};
      
      const response = await sendMessage(requestData, timeoutOptions);

      logger.debug(`[${context}] Response received:`, response);

      if (response && (response.result || response.data || response.translatedText !== undefined)) {
        let resultData = response.result || response.data || response;
        logger.debug(`[${context}] Processing direct response - resultData:`, resultData);

        if (resultData.success === false && resultData.error) {
          handleTranslationError(resultData.error, messageId);
        } else if (resultData.success === true && resultData.translatedText !== undefined) {
          handleTranslationSuccess(resultData);
          if (context === 'sidepanel') {
            pendingRequests.value.delete(messageId);
            await ensureMinimumLoadingDuration();
          }
        }
        isTranslating.value = false;
        currentMessageId.value = null;
        logger.debug(`[${context}] Direct response processed successfully`);
        return true;
      } else if (response && response.success === false && response.error) {
        handleTranslationError(response.error, messageId);
        isTranslating.value = false;
        currentMessageId.value = null;
        return false;
      } else {
        logger.warn(`[${context}] No valid response received`, response);
        isTranslating.value = false;
        currentMessageId.value = null;
        return false;
      }

    } catch (error) {
      const { matchErrorToType } = await import('@/shared/error-management/ErrorMatcher.js');
      const { ErrorTypes } = await import('@/shared/error-management/ErrorTypes.js');
      
      const errorType = matchErrorToType(error);

      if (errorType === ErrorTypes.USER_CANCELLED) {
        logger.debug(`[${context}] Translation request was cancelled by user.`);
      } else {
        logger.error(`[${context}] Failed to send/process translation request: ${error.message}`);
        handleTranslationError(error);
      }
      
      isTranslating.value = false;
      currentMessageId.value = null;
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
      logger.debug(`[${context}] Syncing with store currentTranslation:`, newTranslation);
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
      // 1. Handle TTS status updates to capture detected language from background
      // Only update the local UI state for display, do NOT pollute lastTranslation
      if (message.action === MessageActions.TTS_LANG_DETECTED) {
        if (message.detectedSourceLanguage) {
          logger.debug(`[${context}] Captured language from TTS: ${message.detectedSourceLanguage}`);
          
          // Only update actualSourceLanguage for immediate UI feedback (labels)
          // We don't touch lastTranslation here to avoid polluting translation metadata
          actualSourceLanguage.value = message.detectedSourceLanguage;
        }
        return;
      }

      // 2. Handle Translation Results (Popup context)
      if (context === 'popup') {
        logger.debug(`[${context}] Message listener triggered - isTranslating: ${isTranslating.value}`);
        logger.debug(`[${context}] Raw message received:`, message);
        let resultData = message.result || message.data || (message.translatedText ? message : null);
        logger.debug(`[${context}] Extracted resultData:`, resultData);

        if (resultData && (resultData.translatedText !== undefined || resultData.success === false || resultData.success === true)) {
          logger.debug(`[${context}] Processing result - setting isTranslating to false`);
          isTranslating.value = false;
          if (resultData.success === false && resultData.error) {
            handleTranslationError(resultData.error);
          } else if (resultData.success === true && resultData.translatedText !== undefined) {
            handleTranslationSuccess(resultData);
            logger.debug(`[${context}] Translation result processed - translatedText: ${resultData.translatedText}`);
          } else {
            handleTranslationError("Unexpected response format");
          }
        } else {
          logger.debug(`[${context}] Message ignored - no result data found`, { message, resultData });
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
          } else if (message.data.success === true && message.data.translatedText !== undefined) {
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
        logger.warn(`[${context}] Failed to remove message listener:`, err);
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
    detectedSourceLanguage,
    actualSourceLanguage,
    actualTargetLanguage,
    lastTranslation,
    // Error management
    translationError: errorManager.errorMessage,
    errorType: errorManager.errorType,
    hasError: errorManager.hasError,
    canRetry: errorManager.canRetry,
    canOpenSettings: errorManager.canOpenSettings,
    // Methods
    triggerTranslation,
    cancelTranslation,
    clearTranslation,
    loadLastTranslation,
    getRetryCallback: errorManager.getRetryCallback,
    getSettingsCallback: errorManager.getSettingsCallback,
    // Context
    context
  };
}
