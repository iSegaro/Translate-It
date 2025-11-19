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

    // Check streaming manager first for active streaming translations
    let streamingStatus = null;
    try {
      const { streamingManager } = await import("../core/StreamingManager.js");
      streamingStatus = streamingManager.getStreamStatus(messageId);
      logger.debug('[CheckTranslationStatus] Streaming status checked', {
        messageId,
        streamingStatus: streamingStatus?.status,
        hasResults: streamingStatus?.hasResults
      });
    } catch (error) {
      logger.debug('[CheckTranslationStatus] StreamingManager check failed:', error);
    }

    // Check translation engine for completed requests
    let engineStatus = null;
    try {
      if (translationEngine.getRequestStatus) {
        engineStatus = translationEngine.getRequestStatus(messageId);
        logger.debug('[CheckTranslationStatus] Engine status checked', {
          messageId,
          engineStatus: engineStatus?.status
        });
      }
    } catch (error) {
      logger.debug('[CheckTranslationStatus] Engine status check failed:', error);
    }

    // Determine completion status
    let completed = false;
    let reason = '';
    let hasResults = false;

    // Check if streaming completed successfully
    if (streamingStatus?.status === 'completed' && streamingStatus?.hasResults) {
      completed = true;
      hasResults = true;
      reason = 'streaming_completed';
      logger.info('[CheckTranslationStatus] Translation completed via streaming', { messageId });
    }
    // Check if engine completed successfully
    else if (engineStatus?.status === 'completed' && engineStatus?.hasResults) {
      completed = true;
      hasResults = true;
      reason = 'engine_completed';
      logger.info('[CheckTranslationStatus] Translation completed via engine', { messageId });
    }
    // Check if either system reports completion (even without results)
    else if (streamingStatus?.status === 'completed' || engineStatus?.status === 'completed') {
      completed = true;
      reason = 'system_completed';
      logger.info('[CheckTranslationStatus] Translation marked as completed by system', { messageId });
    }

    const response = {
      success: true,
      completed,
      messageId,
      hasResults,
      reason,
      streamingStatus: streamingStatus?.status,
      engineStatus: engineStatus?.status,
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