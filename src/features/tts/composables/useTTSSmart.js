/**
 * useTTSSmart - Independent Text-to-Speech composable.
 * Each instance of this composable maintains its own state, allowing multiple
 * buttons to exist in the same page without unwanted synchronization.
 */
import { ref, computed, onUnmounted } from "vue";
import { utilsFactory } from "@/utils/UtilsFactory.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { sendMessage } from '@/shared/messaging/core/UnifiedMessaging.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { SimpleMarkdown } from "@/shared/utils/text/markdown.js";

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'useTTSSmart');

/**
 * Independent TTS Controller
 */
export function useTTSSmart() {
  // Instance-level state - Every call to useTTSSmart() gets its own refs
  const ttsState = ref('idle'); // 'idle' | 'loading' | 'playing' | 'error'
  const currentTTSId = ref(null);
  const errorMessage = ref('');
  const errorType = ref('');
  const progress = ref(0);
  const lastText = ref('');
  const lastLanguage = ref('auto');
  const isProcessing = ref(false);

  const isPlaying = computed(() => ttsState.value === 'playing');
  const isLoading = computed(() => ttsState.value === 'loading');
  const canStop = computed(() => ttsState.value === 'playing');
  const isError = computed(() => ttsState.value === 'error');

  /**
   * Generates a unique ID for each TTS request to track it across contexts.
   */
  const generateTTSId = () => `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  /**
   * Handle completion or error of a TTS request
   */
  const handleTTSResult = (status, errorData = null) => {
    if (status === 'completed' || status === 'stopped' || status === 'interrupted' || status === 'idle') {
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = (status === 'completed' || status === 'idle') ? 100 : 0;
      errorMessage.value = '';
      errorType.value = '';
      
      if (status === 'completed' || status === 'idle') {
        setTimeout(() => { if (ttsState.value === 'idle') progress.value = 0; }, 1000);
      }
    } else if (status === 'error') {
      ttsState.value = 'error';
      errorMessage.value = errorData?.error || 'TTS failed';
      errorType.value = errorData?.errorType || '';
      progress.value = 0;
    }
  };

  /**
   * Starts a speech request
   */
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
      
      // Reset local state for the new request
      errorMessage.value = '';
      errorType.value = '';
      progress.value = 0;
      
      // Stop any other active TTS globally before starting this one
      await stopAll();

      ttsState.value = 'loading';
      currentTTSId.value = generateTTSId();
      
      let language = lang;
      if (lang !== 'auto' && lang !== 'unknown') {
        const { getLanguageCodeForTTS } = await utilsFactory.getI18nUtils();
        language = await getLanguageCodeForTTS(lang) || "en";
      }
      
      const cleanText = SimpleMarkdown.getCleanTranslation(text);
      lastText.value = text;
      lastLanguage.value = lang;

      const message = {
        action: MessageActions.GOOGLE_TTS_SPEAK,
        data: {
          text: cleanText.trim(),
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

      if (!response.success) {
        const err = new Error(response.error || 'TTS failed');
        if (response.errorType) err.errorType = response.errorType;
        throw err;
      }

      // If we reach here, Background has successfully started or queued the request
      ttsState.value = 'playing';
      return true;
    } catch (error) {
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'tts:speak');
      } else {
        logger.error("[useTTSSmart] TTS start failed:", error);
      }
      
      handleTTSResult('error', { 
        error: error.message, 
        errorType: error.errorType 
      });
      
      return false;
    } finally {
      isProcessing.value = false;
    }
  };

  /**
   * Stops the current instance's TTS request
   */
  const stop = async () => {
    if (ttsState.value === 'idle') return true;

    try {
      const message = {
        action: MessageActions.TTS_STOP,
        data: { ttsId: currentTTSId.value },
        context: 'tts-smart'
      };
      
      await sendMessage(message);
      handleTTSResult('stopped');
      return true;
    } catch (error) {
      logger.error("[useTTSSmart] Stop failed:", error);
      handleTTSResult('idle');
      return true;
    }
  };

  /**
   * Stops ALL TTS requests globally
   */
  const stopAll = async () => {
    try {
      const message = {
        action: MessageActions.TTS_STOP,
        data: {},
        context: 'tts-smart'
      };
      
      await sendMessage(message);
      return true;
    } catch {
      logger.debug("[useTTSSmart] Global stop failed (expected if none playing)");
      return true;
    }
  };

  /**
   * Toggle between Speak and Stop
   */
  const toggle = async (text, lang = "auto") => {
    if (isPlaying.value || isLoading.value) {
      return await stop();
    }
    return await speak(text, lang);
  };

  /**
   * Message listener for this specific instance.
   * Only reacts to events matching the currentTTSId.
   */
  const messageListener = (message) => {
    if (message.action !== MessageActions.GOOGLE_TTS_ENDED) return;

    const status = message.status || message.reason || 'completed';
    const msgId = message.ttsId;

    // 1. Precise Match: Sync with ID-specific messages
    if (msgId && msgId === currentTTSId.value) {
      handleTTSResult(status, message.error ? { error: message.error, errorType: message.errorType } : null);
    }
    
    // 2. Loose Match: If a broadcast arrives with null ID but this instance is waiting/active
    // This handles cases where ID was lost in background but the failure is still relevant.
    else if (!msgId && (isPlaying.value || isLoading.value)) {
      if (status === 'error') {
        handleTTSResult('error', { error: message.error, errorType: message.errorType });
      } else {
        handleTTSResult('interrupted');
      }
    }
  };

  const browserAPI = typeof browser !== "undefined" ? browser : chrome;
  if (browserAPI?.runtime?.onMessage) {
    browserAPI.runtime.onMessage.addListener(messageListener);
  }

  // Cleanup listener when the component using this instance is unmounted
  onUnmounted(() => {
    if (browserAPI?.runtime?.onMessage) {
      browserAPI.runtime.onMessage.removeListener(messageListener);
    }
  });

  return { 
    speak, 
    stop, 
    stopAll,
    toggle, 
    clearError: () => handleTTSResult('idle'),
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
    isAvailable: () => true
  };
}
