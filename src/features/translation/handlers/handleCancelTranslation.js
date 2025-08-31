// src/background/handlers/translation/handleCancelTranslation.js

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleCancelTranslation');

/**
 * Handle translation cancellation requests from content scripts
 */
export async function handleCancelTranslation(request, sender) {
  try {
    const { messageId } = request.data || {};
    
    logger.debug('[CancelTranslation] Cancellation request received', { 
      messageId, 
      tabId: sender.tab?.id 
    });

    // Get the translation engine instance
    const translationEngine = globalThis.backgroundService?.translationEngine;
    
    if (!translationEngine) {
      logger.warn('[CancelTranslation] Translation engine not available');
      return {
        success: false,
        error: 'Translation engine not available'
      };
    }

    // Cancel any ongoing translation operations
    if (messageId) {
      logger.debug('[CancelTranslation] Attempting to cancel translation', { messageId });
      
      const cancelled = translationEngine.cancelTranslation(messageId);
      if (cancelled) {
        logger.debug('[CancelTranslation] Successfully cancelled translation', { messageId });
      } else {
        logger.debug('[CancelTranslation] Translation was not active or already completed', { messageId });
      }
    }

    // Always return success since the cancellation intent is acknowledged
    return {
      success: true,
      messageId,
      message: 'Translation cancellation acknowledged'
    };

  } catch (error) {
    logger.error('[CancelTranslation] Error handling cancellation:', error);
    return {
      success: false,
      error: error.message || 'Failed to cancel translation'
    };
  }
}