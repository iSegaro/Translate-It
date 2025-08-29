import { ref, computed } from "vue";
import { useBrowserAPI } from "./useBrowserAPI.js";
import { getLanguageCodeForTTS } from "@/utils/i18n/languages.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { MessageActions } from '@/messaging/core/MessageActions.js';

// Error types for comprehensive handling
const ERROR_TYPES = {
  NETWORK_ERROR: 'network_error',
  AUDIO_CONTEXT_ERROR: 'audio_context_error', 
  PERMISSION_DENIED: 'permission_denied',
  TIMEOUT_ERROR: 'timeout_error',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  INVALID_TEXT: 'invalid_text',
  LANGUAGE_NOT_SUPPORTED: 'language_not_supported'
};

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'useTTSSmart');

export function useTTSSmart() {
  const browserAPI = useBrowserAPI('tts-smart');
  
  // Enhanced state management
  const ttsState = ref('idle'); // 'idle' | 'loading' | 'playing' | 'paused' | 'error'
  const currentTTSId = ref(null);
  const errorMessage = ref('');
  const errorType = ref('');
  const retryCount = ref(0);
  const maxRetries = ref(2);
  const progress = ref(0);
  const lastText = ref('');
  const lastLanguage = ref('auto');

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

  // Error classification helper
  const classifyError = (error) => {
    const errorMsg = error.message || error.toString().toLowerCase();
    
    if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('connection')) {
      return ERROR_TYPES.NETWORK_ERROR;
    }
    if (errorMsg.includes('audio') || errorMsg.includes('context')) {
      return ERROR_TYPES.AUDIO_CONTEXT_ERROR;
    }
    if (errorMsg.includes('permission') || errorMsg.includes('denied')) {
      return ERROR_TYPES.PERMISSION_DENIED;
    }
    if (errorMsg.includes('timeout')) {
      return ERROR_TYPES.TIMEOUT_ERROR;
    }
    if (errorMsg.includes('service') || errorMsg.includes('unavailable')) {
      return ERROR_TYPES.SERVICE_UNAVAILABLE;
    }
    if (errorMsg.includes('text') || errorMsg.includes('empty')) {
      return ERROR_TYPES.INVALID_TEXT;
    }
    if (errorMsg.includes('language')) {
      return ERROR_TYPES.LANGUAGE_NOT_SUPPORTED;
    }
    
    return ERROR_TYPES.NETWORK_ERROR; // Default fallback
  };

  // Recovery strategies
  const getRecoveryStrategy = (errorType) => {
    const strategies = {
      [ERROR_TYPES.NETWORK_ERROR]: { 
        canRetry: true, 
        retryDelay: 1000,
        userAction: 'Check your internet connection'
      },
      [ERROR_TYPES.AUDIO_CONTEXT_ERROR]: { 
        canRetry: true, 
        retryDelay: 500,
        userAction: 'Try again - audio system may need to restart'
      },
      [ERROR_TYPES.PERMISSION_DENIED]: { 
        canRetry: false,
        retryDelay: 0,
        userAction: 'Please allow audio permissions in your browser'
      },
      [ERROR_TYPES.TIMEOUT_ERROR]: { 
        canRetry: true,
        retryDelay: 2000,
        userAction: 'Request timed out - try again'
      },
      [ERROR_TYPES.SERVICE_UNAVAILABLE]: { 
        canRetry: true,
        retryDelay: 3000,
        userAction: 'TTS service temporarily unavailable'
      },
      [ERROR_TYPES.INVALID_TEXT]: { 
        canRetry: false,
        retryDelay: 0,
        userAction: 'Please provide valid text to speak'
      },
      [ERROR_TYPES.LANGUAGE_NOT_SUPPORTED]: { 
        canRetry: true,
        retryDelay: 0,
        userAction: 'Language not supported - trying English fallback'
      }
    };
    
    return strategies[errorType] || strategies[ERROR_TYPES.NETWORK_ERROR];
  };

  const speak = async (text, lang = "auto") => {
    if (!text || !text.trim()) {
      logger.warn("[useTTSSmart] No text provided for TTS");
      return false;
    }

    try {
      // Stop any current TTS first
      await stopAll();

      ttsState.value = 'loading';
      errorMessage.value = '';
      progress.value = 0;
      currentTTSId.value = generateTTSId();
      
      const language = getLanguageCodeForTTS(lang) || "en";
      logger.debug("[useTTSSmart] Speaking via GOOGLE_TTS_SPEAK:", text.substring(0, 50) + "...");

      // Send to background handler
      const response = await browserAPI.sendMessage({
        action: MessageActions.GOOGLE_TTS_SPEAK,
        data: {
          text: text.trim(),
          language: language,
          ttsId: currentTTSId.value
        }
      });

      if (!response?.success) {
        throw new Error(response?.error || 'TTS failed');
      }

      ttsState.value = 'playing';
      logger.debug("[useTTSSmart] TTS started successfully");
      
      // Optimized progress simulation
      let progressInterval;
      let autoResetTimeout;
      
      const startProgressTracking = () => {
        progress.value = 0;
        progressInterval = setInterval(() => {
          if (ttsState.value === 'playing' && progress.value < 90) {
            progress.value += Math.random() * 8 + 2; // More consistent progress
          } else if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
        }, 150); // Slightly less frequent updates
      };
      
      const startAutoReset = () => {
        const estimatedDuration = Math.min(text.length * 80, 25000); // Optimized estimation
        autoResetTimeout = setTimeout(() => {
          if (ttsState.value === 'playing') {
            ttsState.value = 'idle';
            progress.value = 100;
            currentTTSId.value = null;
            
            // Cleanup intervals
            if (progressInterval) {
              clearInterval(progressInterval);
              progressInterval = null;
            }
          }
        }, estimatedDuration);
      };
      
      startProgressTracking();
      startAutoReset();
      
      // Store cleanup functions
      if (currentTTSId.value) {
        window[`tts_cleanup_${currentTTSId.value}`] = () => {
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
          if (autoResetTimeout) {
            clearTimeout(autoResetTimeout);
            autoResetTimeout = null;
          }
        };
      }

      return true;
    } catch (error) {
      logger.error("[useTTSSmart] TTS failed:", error);
      
      // Store for retry
      lastText.value = text;
      lastLanguage.value = lang;
      
      // Classify and handle error
      const classifiedErrorType = classifyError(error);
      errorType.value = classifiedErrorType;
      errorMessage.value = error.message || 'TTS failed';
      
      const recoveryStrategy = getRecoveryStrategy(classifiedErrorType);
      
      // Auto-retry for network errors if not exceeded max retries
      if (recoveryStrategy.canRetry && retryCount.value < maxRetries.value) {
        logger.debug(`[useTTSSmart] Auto-retry attempt ${retryCount.value + 1}/${maxRetries.value} for ${classifiedErrorType}`);
        
        retryCount.value++;
        
        // Wait before retry
        if (recoveryStrategy.retryDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, recoveryStrategy.retryDelay));
        }
        
        // Special handling for language errors - fallback to English
        const retryLang = classifiedErrorType === ERROR_TYPES.LANGUAGE_NOT_SUPPORTED ? 'en' : lang;
        
        try {
          const retryResult = await speak(text, retryLang);
          retryCount.value = 0; // Reset on success
          return retryResult;
        } catch (retryError) {
          logger.error("[useTTSSmart] Auto-retry failed:", retryError);
          // Fall through to error state
        }
      }
      
      // Set final error state
      ttsState.value = 'error';
      errorMessage.value = recoveryStrategy.userAction || errorMessage.value;
      currentTTSId.value = null;
      progress.value = 0;
      
      return false;
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
      const response = await browserAPI.sendMessage({
        action: MessageActions.GOOGLE_TTS_PAUSE,
        data: { ttsId: currentTTSId.value }
      });

      if (response?.success) {
        ttsState.value = 'paused';
        logger.debug("[useTTSSmart] TTS paused successfully");
        return true;
      } else {
        throw new Error(response?.error || 'Pause failed');
      }
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
      const response = await browserAPI.sendMessage({
        action: MessageActions.GOOGLE_TTS_RESUME,
        data: { ttsId: currentTTSId.value }
      });

      if (response?.success) {
        ttsState.value = 'playing';
        logger.debug("[useTTSSmart] TTS resumed successfully");
        return true;
      } else {
        throw new Error(response?.error || 'Resume failed');
      }
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
      
      // Cleanup any active intervals/timeouts before stopping
      if (currentTTSId.value && window[`tts_cleanup_${currentTTSId.value}`]) {
        window[`tts_cleanup_${currentTTSId.value}`]();
        delete window[`tts_cleanup_${currentTTSId.value}`];
      }
      
      const response = await browserAPI.sendMessage({
        action: MessageActions.GOOGLE_TTS_STOP_ALL,
        data: { ttsId: currentTTSId.value }
      });

      // Reset state regardless of response
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      errorMessage.value = '';
      errorType.value = '';

      if (response?.success) {
        logger.debug("[useTTSSmart] TTS stopped successfully");
      } else {
        logger.warn("[useTTSSmart] Stop response failed, but state reset:", response?.error);
      }
      
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
      const response = await browserAPI.sendMessage({
        action: MessageActions.GOOGLE_TTS_STOP_ALL,
        data: {}
      });

      // Reset local state
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      errorMessage.value = '';

      logger.debug("[useTTSSmart] All TTS instances stopped");
      return true;
    } catch (error) {
      logger.error("[useTTSSmart] Failed to stop all TTS:", error);
      // Still reset local state
      ttsState.value = 'idle';
      currentTTSId.value = null;
      progress.value = 0;
      return true;
    }
  };

  const retry = async () => {
    if (ttsState.value === 'error') {
      logger.debug("[useTTSSmart] Manual retry initiated");
      
      // Clear error state
      ttsState.value = 'idle';
      errorMessage.value = '';
      errorType.value = '';
      retryCount.value = 0; // Reset retry counter for manual retry
      
      // If we have stored text, try speaking it again
      if (lastText.value) {
        logger.debug("[useTTSSmart] Retrying with stored text:", lastText.value.substring(0, 50) + '...');
        return await speak(lastText.value, lastLanguage.value);
      }
      
      logger.debug("[useTTSSmart] Error state cleared for manual retry");
      return true;
    }
    return false;
  };

  // Additional recovery methods
  const getErrorType = () => errorType.value;
  
  const getRecoveryInfo = () => {
    if (ttsState.value === 'error' && errorType.value) {
      const strategy = getRecoveryStrategy(errorType.value);
      return {
        errorType: errorType.value,
        canRetry: strategy.canRetry,
        userAction: strategy.userAction,
        retryAttempts: retryCount.value,
        maxRetries: maxRetries.value,
        canManualRetry: true
      };
    }
    return null;
  };

  const clearError = () => {
    if (ttsState.value === 'error') {
      ttsState.value = 'idle';
      errorMessage.value = '';
      errorType.value = '';
      retryCount.value = 0;
      lastText.value = '';
      lastLanguage.value = 'auto';
      logger.debug("[useTTSSmart] Error state manually cleared");
      return true;
    }
    return false;
  };

  const getStatus = async () => {
    try {
      const response = await browserAPI.sendMessage({
        action: MessageActions.GOOGLE_TTS_GET_STATUS,
        data: { ttsId: currentTTSId.value }
      });

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

  // Listen for TTS completion messages from offscreen
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === MessageActions.GOOGLE_TTS_ENDED) {
        logger.debug("[useTTSSmart] TTS ended notification received");
        ttsState.value = 'idle';
        currentTTSId.value = null;
        progress.value = 0;
        errorMessage.value = '';
        errorType.value = '';
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
    getRecoveryInfo,
    
    // State
    ttsState,
    currentTTSId,
    errorMessage,
    errorType,
    retryCount,
    maxRetries,
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
    isAvailable,
    
    // Error types for external reference
    ERROR_TYPES 
  };
}
