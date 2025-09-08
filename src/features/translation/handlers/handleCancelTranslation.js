// src/background/handlers/translation/handleCancelTranslation.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

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

    // Cancel operations with proper order: Engine → Streaming → RateLimit
    const { cancelAll, reason, context } = request.data || {};
    
    // Step 1: Cancel active translations in TranslationEngine (stops network requests)
    let cancelledCount = 0;
    if (cancelAll) {
      logger.debug('[CancelTranslation] Cancelling all active translations');
      cancelledCount = await translationEngine.cancelAllTranslations?.() || 0;
      logger.debug('[CancelTranslation] Engine cancelled all translations', { cancelledCount });
    } else if (messageId) {
      logger.debug('[CancelTranslation] Cancelling specific translation', { messageId });
      const cancelled = await translationEngine.cancelTranslation(messageId);
      if (cancelled) {
        cancelledCount = 1;
        logger.debug('[CancelTranslation] Engine successfully cancelled translation', { messageId });
      } else {
        logger.debug('[CancelTranslation] Translation was not active or already completed', { messageId });
      }
    }
    
    // Step 2: Cancel streaming sessions (cleans up streaming state)
    try {
      const { streamingManager } = await import("../core/StreamingManager.js");
      if (cancelAll) {
        await streamingManager.cancelAllStreams('All translations cancelled by user');
        logger.debug('[CancelTranslation] StreamingManager cancelled all streams');
      } else if (messageId) {
        await streamingManager.cancelStream(messageId, 'Translation cancelled by user');
        logger.debug('[CancelTranslation] StreamingManager cancelled stream', { messageId });
      }
    } catch (error) {
      logger.debug('[CancelTranslation] StreamingManager cleanup failed (may not be available):', error);
    }
    
    // Step 3: Clear pending requests in RateLimitManager (clears queues)
    try {
      const { rateLimitManager } = await import("../core/RateLimitManager.js");
      if (cancelAll) {
        await rateLimitManager.clearPendingRequests();
        logger.debug('[CancelTranslation] RateLimitManager cleared all pending requests');
      } else if (messageId) {
        await rateLimitManager.clearPendingRequests(messageId);
        logger.debug('[CancelTranslation] RateLimitManager cleared pending requests', { messageId });
      }
    } catch (error) {
      logger.debug('[CancelTranslation] RateLimitManager cleanup failed (may not have clearPendingRequests method):', error);
    }

    // Always return success since the cancellation intent is acknowledged
    return {
      success: true,
      messageId,
      cancelledCount,
      reason: reason || 'user_request',
      context: context || 'background',
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