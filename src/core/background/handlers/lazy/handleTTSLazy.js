/**
 * Lazy TTS Handler - Dynamic Loading for Background Script
 * Handles TTS actions with lazy loading to reduce initial bundle size
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'TTSLazyHandler');

// Cache for loaded TTS handlers
const handlerCache = new Map();
const loadingPromises = new Map();

/**
 * Load TTS handlers dynamically
 */
async function loadTTSHandlers() {
  const cacheKey = 'tts_handlers';

  if (handlerCache.has(cacheKey)) {
    // Using cached TTS handlers - logged at TRACE level for detailed debugging
    // logger.trace('[TTSLazyHandler] Using cached TTS handlers');
    return handlerCache.get(cacheKey);
  }

  if (loadingPromises.has(cacheKey)) {
    // TTS handlers already loading - logged at TRACE level for detailed debugging
    // logger.trace('[TTSLazyHandler] TTS handlers already loading, waiting...');
    return loadingPromises.get(cacheKey);
  }

  logger.info('[TTSLazyHandler] Loading TTS handlers dynamically...');

  const loadingPromise = Promise.all([
    import('@/features/tts/handlers/handleGoogleTTS.js'),
    import('@/features/tts/handlers/handleOffscreenReady.js')
  ]).then(([googleTTS, offscreenReady]) => {
    const handlers = {
      handleGoogleTTSSpeak: googleTTS.handleGoogleTTSSpeak,
      handleGoogleTTSStopAll: googleTTS.handleGoogleTTSStopAll,
      handleOffscreenReady: offscreenReady.handleOffscreenReady
    };

    handlerCache.set(cacheKey, handlers);
    loadingPromises.delete(cacheKey);
    logger.info('[TTSLazyHandler] TTS handlers loaded and cached successfully');

    return handlers;
  }).catch(error => {
    logger.error('[TTSLazyHandler] Failed to load TTS handlers:', error);
    loadingPromises.delete(cacheKey);
    throw error;
  });

  loadingPromises.set(cacheKey, loadingPromise);
  return loadingPromise;
}

/**
 * Lazy handler for TTS_SPEAK action
 */
export const handleTTSSpeakLazy = async (message, sender) => {
  try {
    logger.info('[TTSLazyHandler] TTS_SPEAK requested');

    const { handleGoogleTTSSpeak } = await loadTTSHandlers();

    // Delegating to handleGoogleTTSSpeak - logged at TRACE level for detailed debugging
    // logger.trace('[TTSLazyHandler] Delegating to handleGoogleTTSSpeak');
    return await handleGoogleTTSSpeak(message, sender);
  } catch (error) {
    logger.error('[TTSLazyHandler] Failed to handle TTS_SPEAK:', error);
    return {
      success: false,
      error: {
        message: 'Failed to load TTS functionality',
        type: 'TTS_LOADING_ERROR'
      }
    };
  }
};

/**
 * Lazy handler for OFFSCREEN_READY action
 */
export const handleOffscreenReadyLazy = async (message, sender) => {
  try {
    logger.info('[TTSLazyHandler] OFFSCREEN_READY requested');

    const { handleOffscreenReady } = await loadTTSHandlers();

    // Delegating to handleOffscreenReady - logged at TRACE level for detailed debugging
    // logger.trace('[TTSLazyHandler] Delegating to handleOffscreenReady');
    return await handleOffscreenReady(message, sender);
  } catch (error) {
    logger.error('[TTSLazyHandler] Failed to handle OFFSCREEN_READY:', error);
    return {
      success: false,
      error: {
        message: 'Failed to load TTS offscreen functionality',
        type: 'TTS_LOADING_ERROR'
      }
    };
  }
};

/**
 * Lazy handler for TTS_STOP action
 */
export const handleTTSStopLazy = async (message, sender) => {
  try {
    logger.info('[TTSLazyHandler] TTS_STOP requested');

    // For stop actions, use the dedicated stop handler
    if (handlerCache.has('tts_handlers')) {
      // Using cached handlers for TTS_STOP - logged at TRACE level for detailed debugging
      // logger.trace('[TTSLazyHandler] Using cached handlers for TTS_STOP');
      const { handleGoogleTTSStopAll } = handlerCache.get('tts_handlers');
      return await handleGoogleTTSStopAll(message, sender);
    } else {
      // TTS handlers not loaded - logged at TRACE level for detailed debugging
      // logger.trace('[TTSLazyHandler] TTS handlers not loaded, loading for stop...');
      const { handleGoogleTTSStopAll } = await loadTTSHandlers();
      return await handleGoogleTTSStopAll(message, sender);
    }
  } catch (error) {
    logger.error('[TTSLazyHandler] Failed to handle TTS_STOP:', error);
    return {
      success: false,
      error: {
        message: 'Failed to stop TTS',
        type: 'TTS_STOP_ERROR'
      }
    };
  }
};

/**
 * Get TTS handler statistics
 */
export const getTTSHandlerStats = () => {
  return {
    handlersLoaded: handlerCache.has('tts_handlers'),
    isLoading: loadingPromises.has('tts_handlers'),
    cacheSize: handlerCache.size
  };
};

/**
 * Clear TTS handler cache (for testing/memory management)
 */
export const clearTTSHandlerCache = () => {
  logger.info('[TTSLazyHandler] Clearing TTS handler cache');
  handlerCache.clear();
  loadingPromises.clear();
};