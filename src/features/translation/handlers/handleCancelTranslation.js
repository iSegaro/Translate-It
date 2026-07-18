// src/background/handlers/translation/handleCancelTranslation.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { streamingManager } from "../core/StreamingManager.js";
import { translationRequestTracker } from '@/core/services/translation/TranslationRequestTracker.js';
import { dispatchTranslationCancellation } from '@/core/services/translation/UnifiedResultDispatcher.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'handleCancelTranslation');

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
    const { cancelAll, reason, context, sessionId } = request.data || {};
    const tabId = sender?.tab?.id;
    
    // Step 1: Identify messageIds to cancel
    let messageIdsToCancel = [];
    logger.debug(`[CancelTranslation] Processing cancel request: cancelAll=${cancelAll}, context=${context}, sessionId=${sessionId}, tabId=${tabId}`);

    if (cancelAll && tabId) {
      // Precise surgical cancellation: Find all active requests for this tab 
      // that match the context and sessionId.
      const tabRequests = translationRequestTracker.getTabRequests(tabId);
      logger.debug(`[CancelTranslation] Tab ${tabId} has ${tabRequests.length} tracked requests`);

      messageIdsToCancel = tabRequests
        .filter(req => {
          const contextMatch = !context || req.context === context;
          const sessionMatch = !sessionId || req.data?.sessionId === sessionId || req.metadata?.sessionId === sessionId;
          
          if (!contextMatch || !sessionMatch) {
            logger.debug(`[CancelTranslation] Request ${req.messageId} mismatch: context(${req.context} vs ${context}), session(${req.data?.sessionId || req.metadata?.sessionId} vs ${sessionId})`);
          }
          
          return contextMatch && sessionMatch;
        })
        .map(req => req.messageId);
      
      logger.debug(`[CancelTranslation] Identified ${messageIdsToCancel.length} messageIds to cancel for tab ${tabId}`);
    } else if (messageId) {
      messageIdsToCancel = [messageId];
    } else if (cancelAll) {
      // No sender ownership is available; snapshot lifecycle-owned IDs by context.
      logger.info(`[CancelTranslation] Falling back to lifecycle cancellation for context: ${context || 'all'}`);
      messageIdsToCancel = translationEngine.getActiveTranslationIds?.(context) || [];
    }

    const { queueManager } = await import("../core/QueueManager.js");
    const { rateLimitManager } = await import("../core/RateLimitManager.js");

    const results = await Promise.allSettled(messageIdsToCancel.map(async (id) => {
      let cancelled = false;
      const cancellation = translationRequestTracker.cancelRequest(id, reason || 'Translation cancelled by user');
      if (cancellation.accepted) {
        try {
          await dispatchTranslationCancellation({ messageId: id, request: cancellation.request });
        } catch { /* continue exact-ID cleanup */ }
      }
      try {
        cancelled = await translationEngine.cancelTranslation(id);
      } catch { /* continue remaining exact-ID cleanup */ }

      await Promise.allSettled([
        Promise.resolve().then(() => streamingManager.cancelStream(
          id,
          reason || 'Translation cancelled by user'
        )),
        Promise.resolve().then(() => rateLimitManager.clearPendingRequests(id)),
        Promise.resolve().then(() => queueManager.cancelByMessageId(id))
      ]);

      return cancelled;
    }));
    const totalCancelledCount = results.filter((result) => result.status === 'fulfilled' && result.value).length;

    // Always return success since the cancellation intent is acknowledged
    return {
      success: true,
      cancelledCount: totalCancelledCount,
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
