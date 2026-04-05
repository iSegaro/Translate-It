import { ref, computed } from "vue";
import { utilsFactory } from "@/utils/UtilsFactory.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import ExtensionContextManager from '@/core/extensionContext.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'useTTSSmart');

const ttsState = ref('idle'); // 'idle' | 'loading' | 'playing' | 'error'
const currentTTSId = ref(null);
const errorMessage = ref('');
const errorType = ref('');
const progress = ref(0);
const lastText = ref('');
const lastLanguage = ref('auto');
const isProcessing = ref(false);

export function useTTSSmart() {
  const isPlaying = computed(() => ttsState.value === 'playing');
  const isLoading = computed(() => ttsState.value === 'loading');

  const canStop = computed(() => ttsState.value === 'playing');
  const isError = computed(() => ttsState.value === 'error');

  const generateTTSId = () => `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const speak = async (text, lang = "auto") => {
    if (!text || !text.trim()) {
      logger.warn("[useTTSSmart] No text provided for TTS");
      return false;
    }

    if (isProcessing.value) {
      logger.warn("[useTTSSmart] Already processing TTS request, ignoring duplicate");
      return false;
    }

    try {
      isProcessing.value = true;
      await stopAll();

      ttsState.value = 'loading';
      errorMessage.value = '';
      progress.value = 0;
      currentTTSId.value = generateTTSId();
      
      const { getLanguageCodeForTTS } = await utilsFactory.getI18nUtils();
      const language = await getLanguageCodeForTTS(lang) || "en";
      
      logger.info(`[useTTSSmart] Starting TTS: ${text.length} chars in ${language}`);

      // The dispatcher in background will handle routing to Google or Edge and language fallbacks
      const message = {
        action: MessageActions.GOOGLE_TTS_SPEAK,
        data: {
          text: text.trim(),
          language: language,
          ttsId: currentTTSId.value
        },
        context: 'tts-smart',
        messageId: `tts-speak-${currentTTSId.value}`
      };
      
      const response = await sendMessage(message);

      if (!response) {
        throw new Error('No response from background service');
      }

      if (!response.success && response.error) {
        throw new Error(response.error);
      }

      ttsState.value = 'playing';
      progress.value = 0;

      startCompletionTimeout();
      return true;
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'tts:speak');
      } else {
        logger.error("[useTTSSmart] TTS failed:", error);
      }
      
      lastText.value = text;
      lastLanguage.value = lang;
      currentTTSId.value = null; // Clear ID on error
      
      ttsState.value = 'error';
      errorMessage.value = error.message || 'TTS failed';
      progress.value = 0;
      
      return false;
    } finally {
      isProcessing.value = false;
    }
  };

  const stop = async () => {
    if (!canStop.value && ttsState.value !== 'loading') {
      return true;
    }

    try {
      const message = {
        action: MessageActions.TTS_STOP,
        data: { ttsId: currentTTSId.value },
        context: 'tts-smart',
        messageId: `tts-stop-${currentTTSId.value || 'all'}`
      };
      
      await sendMessage(message);

      if (completionTimeout) {
        clearTimeout(completionTimeout);
        completionTimeout = null;
      }

      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      errorMessage.value = '';
      errorType.value = '';
      
      return true;
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'tts:stop');
      } else {
        await ErrorHandler.getInstance().handle(error, {
          type: ErrorTypes.TTS,
          context: 'useTTSSmart-stop',
          showToast: false,
          showInUI: false
        });
      }
      
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      errorMessage.value = '';
      errorType.value = '';
      return true;
    }
  };

  const stopAll = async () => {
    try {
      const message = {
        action: MessageActions.TTS_STOP,
        data: {},
        context: 'tts-smart',
        messageId: `tts-stop-all-${Date.now()}`
      };
      
      await sendMessage(message);

      if (completionTimeout) {
        clearTimeout(completionTimeout);
        completionTimeout = null;
      }

      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      errorMessage.value = '';
      isProcessing.value = false;

      return true;
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'tts:stop-all');
      } else {
        await ErrorHandler.getInstance().handle(error, {
          type: ErrorTypes.TTS,
          context: 'useTTSSmart-stopAll',
          showToast: false,
          showInUI: false
        });
      }
      
      if (completionTimeout) {
        clearTimeout(completionTimeout);
        completionTimeout = null;
      }
      
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      isProcessing.value = false;
      return true;
    }
  };

  const retry = async () => {
    if (ttsState.value === 'error' && lastText.value) {
      ttsState.value = 'idle';
      errorMessage.value = '';
      errorType.value = '';
      
      logger.info(`[useTTSSmart] Retrying TTS: ${lastText.value.length} chars`);
      return await speak(lastText.value, lastLanguage.value);
    }
    return false;
  };

  const getErrorType = () => errorType.value;

  const clearError = () => {
    if (ttsState.value === 'error') {
      ttsState.value = 'idle';
      errorMessage.value = '';
      errorType.value = '';
      lastText.value = '';
      lastLanguage.value = 'auto';
      currentTTSId.value = null;
      return true;
    }
    return false;
  };

  const getStatus = async () => {
    try {
      const message = {
        action: MessageActions.GOOGLE_TTS_GET_STATUS,
        data: { ttsId: currentTTSId.value },
        context: 'tts-smart',
        messageId: `tts-status-${currentTTSId.value || 'unknown'}`
      };
      
      const response = await sendMessage(message);

      const serverStatus = response?.status || 'idle';
      
      // Map 'paused' to 'playing' or 'idle' since we removed 'paused' locally
      let mappedStatus = serverStatus;
      if (serverStatus === 'paused') mappedStatus = 'playing';

      if (mappedStatus !== ttsState.value && mappedStatus !== 'error') {
        ttsState.value = mappedStatus;
      }

      return { 
        local: ttsState.value, 
        server: serverStatus,
        synced: mappedStatus === ttsState.value 
      };
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'tts:get-status');
      } else {
        logger.error("[useTTSSmart] Failed to get TTS status:", error);
      }
      return { local: ttsState.value, server: 'error', synced: false };
    }
  };

  const toggle = async (text, lang = "auto") => {
    switch (ttsState.value) {
      case 'idle':
      case 'error':
        return await speak(text, lang);
      case 'loading':
      case 'playing':
        return await stop();
      default:
        logger.warn("[useTTSSmart] Unknown state for toggle:", ttsState.value);
        return await stop();
    }
  };

  const isAvailable = () => true;

  return { 
    speak, 
    stop, 
    stopAll,
    retry,
    toggle, 
    getStatus,
    clearError,
    getErrorType,
    ttsState,
    currentTTSId,
    errorMessage,
    errorType,
    progress,
    lastText,
    lastLanguage,
    canStop,
    isError,
    isPlaying, 
    isLoading, 
    isAvailable 
  };
}

let completionTimeout = null;

const startCompletionTimeout = () => {
  if (completionTimeout) {
    clearTimeout(completionTimeout);
  }

  completionTimeout = setTimeout(() => {
    if (ttsState.value === 'playing') {
      handleTTSCompletion();
    }
    completionTimeout = null;
  }, 30000);
};

const handleTTSCompletion = () => {
  if (ttsState.value === 'playing') {
    ttsState.value = 'idle';
    currentTTSId.value = null;
    progress.value = 100;
    errorMessage.value = '';
    errorType.value = '';
    
    setTimeout(() => {
      if (ttsState.value === 'idle') {
        progress.value = 0;
      }
    }, 1000);
  }
};

const browserAPI = typeof browser !== "undefined" ? browser : chrome;
if (browserAPI?.runtime) {
  browserAPI.runtime.onMessage.addListener((message) => {
    if (message.action === MessageActions.GOOGLE_TTS_ENDED) {
      if (completionTimeout) {
        clearTimeout(completionTimeout);
        completionTimeout = null;
      }

      handleTTSCompletion();
    }
  });
}
