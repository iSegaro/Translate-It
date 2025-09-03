import { ref, computed } from "vue";
import { getLanguageCodeForTTS } from "@/utils/i18n/languages.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { sendSmart } from '@/shared/messaging/core/SmartMessaging.js';
// import { ERROR_TYPES, RECOVERY_STRATEGIES } from '@/constants/ttsErrorTypes.js'; // For future use

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'useTTSSmart');

export function useTTSSmart() {
  
  // Simplified state management
  const ttsState = ref('idle'); // 'idle' | 'loading' | 'playing' | 'paused' | 'error'
  const currentTTSId = ref(null);
  const errorMessage = ref('');
  const errorType = ref('');
  const progress = ref(0);
  const lastText = ref('');
  const lastLanguage = ref('auto');
  const isProcessing = ref(false); // Prevent duplicate requests

  // Backward compatibility
  const isPlaying = computed(() => ttsState.value === 'playing');
  const isLoading = computed(() => ttsState.value === 'loading');

  // Computed properties for UI
  const canPause = computed(() => ttsState.value === 'playing');
  const canResume = computed(() => ttsState.value === 'paused');
  const canStop = computed(() => ['playing', 'paused'].includes(ttsState.value));
  const isError = computed(() => ttsState.value === 'error');

  // Generate unique TTS ID
  const generateTTSId = () => `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Error classification helper (for future use)
  // const classifyError = (error) => {
  //   const errorMsg = error.message || error.toString().toLowerCase();
  //   
  //   if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('connection')) {
  //     return ERROR_TYPES.NETWORK_ERROR;
  //   }
  //   // ... other error classifications
  //   
  //   return ERROR_TYPES.NETWORK_ERROR; // Default fallback
  // };

  // Recovery strategies - now using imported constants (for future use)
  // const getRecoveryStrategy = (errorType) => {
  //   return RECOVERY_STRATEGIES[errorType] || RECOVERY_STRATEGIES[ERROR_TYPES.NETWORK_ERROR];
  // };

  const speak = async (text, lang = "auto") => {
    if (!text || !text.trim()) {
      logger.warn("[useTTSSmart] No text provided for TTS");
      return false;
    }

    // Prevent duplicate requests
    if (isProcessing.value) {
      logger.warn("[useTTSSmart] Already processing TTS request, ignoring duplicate");
      return false;
    }

    try {
      isProcessing.value = true;
      
      // Stop any current TTS first
      await stopAll();

      ttsState.value = 'loading';
      errorMessage.value = '';
      progress.value = 0;
      currentTTSId.value = generateTTSId();
      
      const language = getLanguageCodeForTTS(lang) || "en";
      logger.debug("[useTTSSmart] Speaking via GOOGLE_TTS_SPEAK:", text.substring(0, 50) + "...");

      // Use smart messaging for TTS (port-based for slow actions)
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
      
      const response = await sendSmart(message);

      // Handle empty or error responses
      if (!response) {
        throw new Error('No response from background service');
      }
      
      if (!response.success && response.error) {
        throw new Error(response.error);
      }

      ttsState.value = 'playing';
      progress.value = 0; // Reset progress, real progress will come from audio events
      logger.debug("[useTTSSmart] TTS started successfully");

      // Start polling for completion as fallback for content script context
      startCompletionPolling();

      return true;
    } catch (error) {
      logger.error("[useTTSSmart] TTS failed:", error);
      
      // Store text for potential manual retry
      lastText.value = text;
      lastLanguage.value = lang;
      
      // Simple error handling without automatic retry
      ttsState.value = 'error';
      errorMessage.value = error.message || 'TTS failed';
      currentTTSId.value = null;
      progress.value = 0;
      
      return false;
    } finally {
      isProcessing.value = false; // Always reset processing flag
    }
  };

  // New TTS control methods
  const pause = async () => {
    if (!canPause.value) {
      logger.warn("[useTTSSmart] Cannot pause - TTS not playing");
      return false;
    }

    try {
      logger.debug("[useTTSSmart] Pausing TTS");
      const message = {
        action: MessageActions.GOOGLE_TTS_PAUSE,
        data: { ttsId: currentTTSId.value },
        context: 'tts-smart',
        messageId: `tts-pause-${currentTTSId.value}`
      };
      
      const response = await sendSmart(message);
      
      if (!response?.success) {
        throw new Error(response?.error || 'Pause failed');
      }

      ttsState.value = 'paused';
      logger.debug("[useTTSSmart] TTS paused successfully");
      return true;
    } catch (error) {
      logger.error("[useTTSSmart] Failed to pause TTS:", error);
      errorMessage.value = error.message || 'Pause failed';
      return false;
    }
  };

  const resume = async () => {
    if (!canResume.value) {
      logger.warn("[useTTSSmart] Cannot resume - TTS not paused");
      return false;
    }

    try {
      logger.debug("[useTTSSmart] Resuming TTS");
      const message = {
        action: MessageActions.GOOGLE_TTS_RESUME,
        data: { ttsId: currentTTSId.value },
        context: 'tts-smart',
        messageId: `tts-resume-${currentTTSId.value}`
      };
      
      const response = await sendSmart(message);
      
      if (!response?.success) {
        throw new Error(response?.error || 'Resume failed');
      }

      ttsState.value = 'playing';
      logger.debug("[useTTSSmart] TTS resumed successfully");
      return true;
    } catch (error) {
      logger.error("[useTTSSmart] Failed to resume TTS:", error);
      errorMessage.value = error.message || 'Resume failed';
      return false;
    }
  };

  const stop = async () => {
    if (!canStop.value && ttsState.value !== 'loading') {
      logger.debug("[useTTSSmart] Nothing to stop");
      return true;
    }

    try {
      logger.debug("[useTTSSmart] Stopping TTS");
      
      const message = {
        action: MessageActions.GOOGLE_TTS_STOP_ALL,
        data: { ttsId: currentTTSId.value },
        context: 'tts-smart',
        messageId: `tts-stop-${currentTTSId.value || 'all'}`
      };
      
      const response = await sendSmart(message);

      // Stop polling
      if (completionPoller) {
        clearInterval(completionPoller);
        completionPoller = null;
      }

      // Reset state regardless of response
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      errorMessage.value = '';
      errorType.value = '';

      logger.debug("[useTTSSmart] TTS stopped successfully");
      
      return true;
    } catch (error) {
      logger.error("[useTTSSmart] Failed to stop TTS:", error);
      // Still reset state on error
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      errorMessage.value = '';
      errorType.value = '';
      return true; // Always succeed for stop
    }
  };

  const stopAll = async () => {
    try {
      logger.debug("[useTTSSmart] Stopping all TTS instances");
      const message = {
        action: MessageActions.GOOGLE_TTS_STOP_ALL,
        data: {},
        context: 'tts-smart',
        messageId: `tts-stop-all-${Date.now()}`
      };
      
      const response = await sendSmart(message);

      // Stop polling
      if (completionPoller) {
        clearInterval(completionPoller);
        completionPoller = null;
      }

      // Reset local state
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      errorMessage.value = '';
      isProcessing.value = false; // Reset processing flag when stopping

      logger.debug("[useTTSSmart] All TTS instances stopped");
      return true;
    } catch (error) {
      logger.error("[useTTSSmart] Failed to stop all TTS:", error);
      
      // Stop polling even on error
      if (completionPoller) {
        clearInterval(completionPoller);
        completionPoller = null;
      }
      
      // Still reset local state
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      isProcessing.value = false; // Reset processing flag when stopping (error case)
      return true;
    }
  };

  const retry = async () => {
    if (ttsState.value === 'error' && lastText.value) {
      logger.debug("[useTTSSmart] Manual retry initiated");
      
      // Clear error state
      ttsState.value = 'idle';
      errorMessage.value = '';
      errorType.value = '';
      
      // Try speaking the stored text again
      logger.debug("[useTTSSmart] Retrying with stored text:", lastText.value.substring(0, 50) + '...');
      return await speak(lastText.value, lastLanguage.value);
    }
    return false;
  };

  // Additional recovery methods
  const getErrorType = () => errorType.value;

  const clearError = () => {
    if (ttsState.value === 'error') {
      ttsState.value = 'idle';
      errorMessage.value = '';
      errorType.value = '';
      lastText.value = '';
      lastLanguage.value = 'auto';
      logger.debug("[useTTSSmart] Error state manually cleared");
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
      
      const response = await sendSmart(message);

      const serverStatus = response?.status || 'idle';
      
      // Sync local state with server state if different
      if (serverStatus !== ttsState.value && serverStatus !== 'error') {
        logger.debug("[useTTSSmart] Syncing state:", ttsState.value, "→", serverStatus);
        ttsState.value = serverStatus;
      }

      return { 
        local: ttsState.value, 
        server: serverStatus,
        synced: serverStatus === ttsState.value 
      };
    } catch (error) {
      logger.error("[useTTSSmart] Failed to get TTS status:", error);
      return { local: ttsState.value, server: 'error', synced: false };
    }
  };

  // Enhanced toggle with state cycling
  const toggle = async (text, lang = "auto") => {
    switch (ttsState.value) {
      case 'idle':
      case 'error':
        return await speak(text, lang);
      case 'loading':
        return await stop();
      case 'playing':
        return await pause();
      case 'paused':
        return await resume();
      default:
        logger.warn("[useTTSSmart] Unknown state for toggle:", ttsState.value);
        return await stop();
    }
  };

  const isAvailable = () => true;

  // Polling mechanism for completion detection (fallback for content script)
  let completionPoller = null;
  
  const startCompletionPolling = () => {
    if (completionPoller) {
      clearInterval(completionPoller);
    }
    
    logger.debug("[useTTSSmart] Starting completion polling as fallback");
    let pollCount = 0;
    const maxPolls = 30; // 15 seconds maximum (500ms * 30)
    
    completionPoller = setInterval(async () => {
      pollCount++;
      
      if (ttsState.value !== 'playing') {
        logger.debug("[useTTSSmart] Stopping completion polling - state changed");
        clearInterval(completionPoller);
        completionPoller = null;
        return;
      }
      
      if (pollCount >= maxPolls) {
        logger.warn("[useTTSSmart] Completion polling timeout - assuming completion");
        handleTTSCompletion();
        clearInterval(completionPoller);
        completionPoller = null;
        return;
      }
      
      // Check TTS status via background
      try {
        const status = await getStatus();
        
        if (status.server === 'idle' && ttsState.value === 'playing') {
          logger.debug("[useTTSSmart] Completion detected via polling");
          handleTTSCompletion();
          clearInterval(completionPoller);
          completionPoller = null;
        }
      } catch (error) {
        logger.debug("[useTTSSmart] Polling check skipped due to error:", error.message);
      }
    }, 500); // Poll every 500ms
  };
  
  const handleTTSCompletion = () => {
    logger.debug("[useTTSSmart] Handling TTS completion");
    
    if (ttsState.value === 'playing') {
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 100; // Mark as completed
      errorMessage.value = '';
      errorType.value = '';
      
      // Set progress back to 0 after a short delay for visual feedback
      setTimeout(() => {
        if (ttsState.value === 'idle') {
          progress.value = 0;
        }
      }, 1000);
    }
  };

  // Listen for TTS completion messages from offscreen
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'GOOGLE_TTS_ENDED') {
        logger.debug("[useTTSSmart] TTS ended notification received - audio playback completed");
        
        // Stop polling since we received the event
        if (completionPoller) {
          clearInterval(completionPoller);
          completionPoller = null;
        }
        
        handleTTSCompletion();
      }
    });
  }

  return { 
    // Core methods
    speak, 
    pause, 
    resume, 
    stop, 
    stopAll,
    retry,
    toggle, 
    getStatus,
    
    // Error handling methods
    clearError,
    getErrorType,
    
    // State
    ttsState,
    currentTTSId,
    errorMessage,
    errorType,
    progress,
    lastText,
    lastLanguage,
    
    // Computed properties
    canPause,
    canResume,
    canStop,
    isError,
    
    // Backward compatibility
    isPlaying, 
    isLoading, 
    isAvailable 
  };
}
