// Background handler for offscreen document ready notifications (Chromium-specific)
// Simply acknowledges that offscreen document is ready

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TTS, 'OffscreenReadyHandler');

/**
 * Handle OFFSCREEN_READY messages from offscreen document (Chromium-based browsers)
 * Note: This handler is only registered in Chromium browsers. Firefox uses direct audio playback.
 * @param {Object} request - Request object
 * @returns {Promise<Object>} Response
 */
export const handleOffscreenReady = async (request) => {
  try {
    logger.debug('[OffscreenReadyHandler] 📡 Offscreen document ready');
    
    return { 
      success: true, 
      acknowledged: true,
      timestamp: Date.now()
    };
    
  } catch (error) {
    logger.error('[OffscreenReadyHandler] ❌ Error handling offscreen ready:', error);
    return {
      success: false,
      error: error.message || 'Offscreen ready handler failed'
    };
  }
};