// src/background/handlers/translation/handleCancelTranslation.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { streamingManager } from "../core/StreamingManager.js";

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
      logger.info(`[CancelTranslation] Cancelling all active translations for context: ${context || 'all'}`);
      cancelledCount = await translationEngine.cancelAllTranslations?.(context) || 0;
      logger.info(`[CancelTranslation] Engine cancelled ${cancelledCount} translations for context: ${context || 'all'}`);
    } else if (messageId) {
      logger.info(`[CancelTranslation] Cancelling specific translation: ${messageId}`);
      const cancelled = await translationEngine.cancelTranslation(messageId);
      if (cancelled) {
        cancelledCount = 1;
        logger.info(`[CancelTranslation] Engine successfully cancelled translation: ${messageId}`);
      } else {
        logger.info(`[CancelTranslation] Translation ${messageId} was not active or already completed`);
      }
    }
    
    // Step 2: Cancel streaming sessions (cleans up streaming state)
    try {
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
        logger.info(`[CancelTranslation] Clearing all pending requests in RateLimitManager for context: ${context || 'all'}`);
        rateLimitManager.clearPendingRequests();
      } else if (messageId) {
        logger.info(`[CancelTranslation] Clearing pending requests for messageId: ${messageId}`);
        rateLimitManager.clearPendingRequests(messageId);
      }
    } catch (error) {
      logger.error('[CancelTranslation] RateLimitManager cleanup failed:', error);
    }

    // Step 4: Clear pending retries in QueueManager
    try {
      const { queueManager } = await import("../core/QueueManager.js");
      if (cancelAll && context) {
        logger.info(`[CancelTranslation] Clearing pending retries in QueueManager for context: ${context}`);
        queueManager.cancelByUiContext(context);
      } else if (messageId) {
        logger.info(`[CancelTranslation] Clearing pending retries in QueueManager for messageId: ${messageId}`);
        queueManager.cancelByMessageId(messageId);
      } else if (cancelAll) {
        logger.info('[CancelTranslation] Clearing ALL pending retries in QueueManager (no context provided)');
        // If we want to be safe and clear everything when cancelAll is true but no context
        // we can call a general clear, but usually context is popup/sidepanel
      }
    } catch (error) {
      logger.error('[CancelTranslation] QueueManager cleanup failed:', error);
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