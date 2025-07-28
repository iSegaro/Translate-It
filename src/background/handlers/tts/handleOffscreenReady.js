// src/background/handlers/tts/handleOffscreenReady.js
// Handler for offscreen document readiness signals

/**
 * Handle offscreen document ready signal
 * This is called when offscreen document signals it's ready for TTS
 * @param {Object} request - Message request
 * @param {Object} sender - Message sender
 * @returns {Promise<Object>} Response
 */
export const handleOffscreenReady = async (request, sender) => {
  try {
    console.log('[OffscreenReadyHandler] Offscreen document signaled readiness:', sender);

    // Notify TTS manager about offscreen readiness
    if (globalThis.backgroundService && globalThis.backgroundService.features) {
      const ttsManager = globalThis.backgroundService.features.ttsManager;
      if (ttsManager && typeof ttsManager.handleOffscreenReady === 'function') {
        ttsManager.handleOffscreenReady();
        console.log('[OffscreenReadyHandler] TTS manager notified of offscreen readiness');
      }
    }

    // Also trigger any cached readiness callbacks
    if (globalThis.offscreenReadyCallbacks) {
      globalThis.offscreenReadyCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.warn('[OffscreenReadyHandler] Error in readiness callback:', error);
        }
      });
      globalThis.offscreenReadyCallbacks = [];
    }

    return { success: true, message: 'Offscreen readiness acknowledged' };

  } catch (error) {
    console.error('[OffscreenReadyHandler] Error handling offscreen ready:', error);
    return {
      success: false,
      error: error.message || 'Failed to handle offscreen ready signal'
    };
  }
};