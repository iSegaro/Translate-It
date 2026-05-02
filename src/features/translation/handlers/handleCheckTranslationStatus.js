// src/features/translation/handlers/handleCheckTranslationStatus.js

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handleCheckTranslationStatus');

/**
 * Handle translation status check requests from content scripts
 * Used to prevent duplicate fallback requests when translation has already completed
 */
export async function handleCheckTranslationStatus(request, sender) {
  try {
    const { messageId } = request.data || {};

    if (!messageId) {
      logger.warn('[CheckTranslationStatus] No messageId provided in request');
      return {
        success: false,
        error: 'Message ID is required'
      };
    }

    logger.debug('[CheckTranslationStatus] Status check request received', {
      messageId,
      tabId: sender.tab?.id,
      isFallback: messageId.startsWith('fallback-')
    });

    // Get the translation engine instance
    const translationEngine = globalThis.backgroundService?.translationEngine;

    if (!translationEngine) {
      logger.warn('[CheckTranslationStatus] Translation engine not available');
      return {
        success: false,
        error: 'Translation engine not available'
      };
    }

    // Check if this is a fallback request - we should never consider fallback requests as completed
    // since they're created when the original request timed out
    if (messageId.startsWith('fallback-')) {
      logger.debug('[CheckTranslationStatus] Fallback request detected - never considered completed', { messageId });
      return {
        success: true,
        completed: false,
        messageId,
        isFallback: true,
        reason: 'fallback_requests_never_completed'
      };
    }

    // Check streaming manager first for active or recently completed translations
    let streamingStatus = null;
    try {
      const { streamingManager } = await import("../core/StreamingManager.js");
      streamingStatus = streamingManager.getStreamStatus(messageId);
      logger.debug('[CheckTranslationStatus] Streaming status checked', {
        messageId,
        status: streamingStatus?.status,
        hasResults: streamingStatus?.hasResults
      });
    } catch (error) {
      logger.debug('[CheckTranslationStatus] StreamingManager check failed:', error);
    }

    // Check lifecycle registry for active (but not necessarily streaming) requests
    let isActive = false;
    try {
      if (translationEngine.getAbortController && translationEngine.getAbortController(messageId)) {
        isActive = true;
        logger.debug('[CheckTranslationStatus] Request found in LifecycleRegistry (Active)', { messageId });
      }
    } catch (error) {
      logger.debug('[CheckTranslationStatus] LifecycleRegistry check failed:', error);
    }

    // Determine completion and progress status
    let completed = false;
    let inProgress = isActive || streamingStatus?.status === 'active';
    let reason = '';
    let hasResults = false;
    let results = null;

    // 1. Check if it's completed with results
    if (streamingStatus?.isComplete && streamingStatus?.hasResults) {
      completed = true;
      hasResults = true;
      results = streamingStatus.results;
      reason = 'completed_with_results';
      inProgress = false;
    } 
    // 2. Check if it's marked as error or cancelled
    else if (streamingStatus?.status === 'error' || streamingStatus?.status === 'cancelled') {
      completed = true;
      reason = `streaming_${streamingStatus.status}`;
      inProgress = false;
    }
    // 3. Just in progress
    else if (inProgress) {
      reason = 'still_in_progress';
    } else {
      reason = 'not_found';
    }

    const response = {
      success: true,
      completed,
      inProgress,
      messageId,
      hasResults,
      results,
      reason,
      timestamp: Date.now()
    };

    logger.debug('[CheckTranslationStatus] Status check completed', response);
    return response;

  } catch (error) {
    logger.error('[CheckTranslationStatus] Error handling status check:', error);
    return {
      success: false,
      error: error.message || 'Failed to check translation status',
      messageId: request.data?.messageId
    };
  }
}