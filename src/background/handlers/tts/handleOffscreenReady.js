// Background handler for offscreen document ready notifications (Chrome-specific)
// Simply acknowledges that offscreen document is ready

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'OffscreenReadyHandler');

/**
 * Handle OFFSCREEN_READY messages from offscreen document (Chrome only)
 * Firefox uses direct audio playback and doesn't need offscreen documents
 * @param {Object} request - Request object
 * @returns {Promise<Object>} Response
 */
export const handleOffscreenReady = async (request) => {
  try {
    // Check if this is Chrome (offscreen documents are Chrome-specific)
    const isChrome = /chrome/i.test(navigator.userAgent || '') && !/edge/i.test(navigator.userAgent || '');
    
    if (!isChrome) {
      logger.debug('[OffscreenReadyHandler] ⚠️ Received OFFSCREEN_READY on non-Chrome browser, ignoring');
      return { 
        success: true, 
        acknowledged: false,
        reason: 'Firefox uses direct audio, no offscreen document needed'
      };
    }
    
    logger.debug('[OffscreenReadyHandler] 📡 Chrome offscreen document ready');
    
    return { 
      success: true, 
      acknowledged: true,
      browser: 'chrome',
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