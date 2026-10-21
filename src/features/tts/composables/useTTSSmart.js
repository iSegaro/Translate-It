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
import { SimpleMarkdown, ExtractionStrategy } from "@/shared/utils/text/markdown.js";

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'useTTSSmart');
let latestRequest = null;
let handoff = Promise.resolve();

const stopRequest = (ttsId) => sendMessage({
  action: MessageActions.TTS_STOP,
  data: { ttsId, stopOnlyIfOwner: true },
  context: 'tts-smart'
});

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
  const detectedLanguage = ref('');
  const isProcessing = ref(false);
  let disposed = false;
  let requestRevision = 0;

  const isPlaying = computed(() => ttsState.value === 'playing');
  const isLoading = computed(() => ttsState.value === 'loading');
  const canStop = computed(() => ttsState.value === 'playing');
  const isError = computed(() => ttsState.value === 'error');

  /**
   * Generates a unique ID for each TTS request to track it across contexts.
   */
  const generateTTSId = () => `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const instance = {
    resetForHandoff: () => {
      requestRevision += 1;
      isProcessing.value = false;
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      errorMessage.value = '';
      errorType.value = '';
    }
  };

  /**
   * Handle completion or error of a TTS request
   */
  const handleTTSResult = (status, errorData = null) => {
    // A terminal event for this instance's request invalidates any in-flight
    // start continuation: a late successful start response must not restore
    // playing (or re-attribute an error) after the request already ended.
    requestRevision += 1;
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
   * @param {string} text - The text to speak
   * @param {string} lang - The language code
   * @param {Object} options - Additional options (e.g., { isDictionary: boolean })
   */
  const speak = async (text, lang = "auto", options = {}) => {
    if (!text || !text.trim()) {
      logger.warn("[useTTSSmart] No text provided for TTS");
      return false;
    }

    const request = { owner: instance, id: generateTTSId(), revision: ++requestRevision };
    if (latestRequest?.owner !== instance) {
      latestRequest?.owner?.resetForHandoff();
    }
    latestRequest = request;
    isProcessing.value = true;
    currentTTSId.value = request.id;
    ttsState.value = 'loading';
    const isCurrentRequest = () => !disposed && latestRequest === request && request.revision === requestRevision;

    const operation = handoff.then(async () => {
      if (!isCurrentRequest()) return false;
      try {
      
      // Reset local state for the new request
      errorMessage.value = '';
      errorType.value = '';
      detectedLanguage.value = '';
      progress.value = 0;
      
      // Stop any other active TTS globally before starting this one
      await stopAll();
      if (!isCurrentRequest()) return false;
      
      let language = lang;
      if (lang !== 'auto' && lang !== 'unknown') {
        const { getLanguageCodeForTTS } = await utilsFactory.getI18nUtils();
        if (!isCurrentRequest()) return false;
        language = await getLanguageCodeForTTS(lang) || "en";
        if (!isCurrentRequest()) return false;
      }
      
      // Determine extraction strategy based on options
      const strategy = options.isDictionary ? ExtractionStrategy.PRIMARY_ONLY : ExtractionStrategy.FULL_TEXT;
      const cleanText = SimpleMarkdown.getCleanTranslation(text, strategy);
      
      lastText.value = text;
      lastLanguage.value = lang;

      // Snapshot reactive settings before crossing the WebExtension messaging boundary.
      const preferredVoices = options.preferredVoices === undefined
        ? undefined
        : JSON.parse(JSON.stringify(options.preferredVoices));

      const message = {
        action: MessageActions.GOOGLE_TTS_SPEAK,
        data: {
          text: cleanText.trim(),
          language: language,
          ttsId: request.id,
          preferredVoices,
          engine: options.engine
        },
        context: 'tts-smart',
        messageId: `tts-speak-${request.id}`
      };
      
      const response = await sendMessage(message);

      if (!isCurrentRequest()) {
        await stopRequest(request.id).catch(() => {});
        return false;
      }

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
      if (!isCurrentRequest()) return false;
      if (ExtensionContextManager.isContextError(error)) {
        ExtensionContextManager.handleContextError(error, 'tts:speak');
      } else if (error.errorType === 'ERRORS_TTS_EMPTY_RESPONSE') {
        logger.info("[useTTSSmart] TTS empty response (silent):", error.message);
        handleTTSResult('idle');
        return false;
      } else {
        logger.error("[useTTSSmart] TTS start failed:", error);
      }
      
      handleTTSResult('error', { 
        error: error.message, 
        errorType: error.errorType 
      });
      
      return false;
      } finally {
        if (latestRequest === request) isProcessing.value = false;
      }
    });
    handoff = operation.catch(() => {});
    return operation;
  };

  /**
   * Stops the current instance's TTS request
   * @param {Object} options - Stop options
   */
  const stop = async (options = {}) => {
    const ttsId = currentTTSId.value;
    if (!ttsId) return true;
    requestRevision += 1;
    if (latestRequest?.owner === instance) latestRequest = null;
    ttsState.value = 'idle';
    currentTTSId.value = null;
    isProcessing.value = false;

    try {
      const message = {
        action: MessageActions.TTS_STOP,
        data: { 
          ttsId,
          ...options,
          stopOnlyIfOwner: true
        },
        context: 'tts-smart'
      };
      
      await sendMessage(message);
      return true;
    } catch (error) {
      logger.error("[useTTSSmart] Stop failed:", error);
      return true;
    }
  };

  /**
   * Stops ALL TTS requests globally
   * @param {Object} options - Stop options
   */
  const stopAll = async (options = {}) => {
    try {
      const message = {
        action: MessageActions.TTS_STOP,
        data: { ...options },
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

  const messageListener = (message) => {
    if (message.action !== MessageActions.GOOGLE_TTS_ENDED && message.action !== MessageActions.TTS_LANG_DETECTED) return;

    const status = message.status || message.reason || 'completed';
    const msgId = message.ttsId;

    // 1. Precise Match: Sync with ID-specific messages
    if (msgId && msgId === currentTTSId.value) {
      if (message.detectedSourceLanguage) {
        detectedLanguage.value = message.detectedSourceLanguage;
      }
      
      if (message.action === MessageActions.GOOGLE_TTS_ENDED) {
        handleTTSResult(status, message.error ? { error: message.error, errorType: message.errorType } : null);
      }
    }
  };

  const browserAPI = typeof browser !== "undefined" ? browser : chrome;
  if (browserAPI?.runtime?.onMessage) {
    browserAPI.runtime.onMessage.addListener(messageListener);
  }

  // Cleanup listener when the component using this instance is unmounted
  onUnmounted(() => {
    disposed = true;
    requestRevision += 1;
    if (latestRequest?.owner === instance) latestRequest = null;
    const ownedId = currentTTSId.value;
    if (ownedId) void stopRequest(ownedId).catch(() => {});
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
    detectedLanguage,
    canStop,
    isError,
    isPlaying, 
    isLoading,
    isAvailable: () => true
  };
}
