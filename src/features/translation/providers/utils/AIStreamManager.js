/**
 * AI Stream Manager - Handles streaming translation results and lifecycle
 * Connects AI providers to the central StreamingManager for unified tracking and timeout prevention.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { streamingManager } from '@/features/translation/core/StreamingManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'AIStreamManager');

export const AIStreamManager = {
  /**
   * Stream batch results to central manager
   */
  async streamBatchResults(providerName, batchResults, originalBatch, batchIndex, messageId, engine, sourceLanguage = null, targetLanguage = null) {
    if (!messageId) {
      logger.warn(`[${providerName}] Cannot stream results - missing messageId`);
      return;
    }

    try {
      // Delegate to central manager to ensure progress is tracked (prevents timeouts)
      // Note: Central manager handles the actual browser messaging
      await streamingManager.streamBatchResults(
        messageId,
        batchResults,
        originalBatch,
        batchIndex,
        sourceLanguage,
        targetLanguage
      );
      
      logger.debug(`[${providerName}] Stream results delegated to central manager for messageId: ${messageId}`);
    } catch (error) {
      logger.error(`[${providerName}] Failed to stream batch results:`, error);
    }
  },

  /**
   * Send streaming end notification to central manager
   */
  async sendStreamEnd(providerName, messageId, engine, options = {}) {
    if (!messageId) return;

    try {
      // Delegate to central manager for proper lifecycle completion
      await streamingManager.completeStream(messageId, !options.error, {
        error: options.error,
        targetLanguage: options.targetLanguage
      });
      
      logger.debug(`[${providerName}] Stream end delegated to central manager for messageId: ${messageId}`);
    } catch (error) {
      logger.error(`[${providerName}] Failed to send stream end:`, error);
    }
  },

  /**
   * Send error stream message to central manager
   */
  async streamErrorResults(providerName, error, batchIndex, messageId) {
    if (!messageId) return;
    try {
      // Delegate to central manager
      await streamingManager.streamBatchError(messageId, error, batchIndex);
      logger.debug(`[${providerName}] Stream error delegated to central manager for messageId: ${messageId}`);
    } catch (sendError) {
      logger.error(`[${providerName}] Failed to send stream error:`, sendError);
    }
  },

  /**
   * Stream fallback result to central manager
   */
  async streamFallbackResult(providerName, result, original, segmentIndex, messageId, engine, sourceLanguage = null, targetLanguage = null) {
    if (!messageId) return;
    try {
      // For fallbacks, we treat it as a single-segment batch update
      await streamingManager.streamBatchResults(
        messageId,
        [result],
        [original],
        segmentIndex,
        sourceLanguage,
        targetLanguage
      );
      
      logger.debug(`[${providerName}] Fallback result delegated for segment ${segmentIndex + 1}`);
    } catch (error) {
      logger.error(`[${providerName}] Failed to stream fallback result for segment ${segmentIndex + 1}:`, error);
    }
  },

  /**
   * Check if a streaming session is active for a messageId
   */
  isStreamActive(messageId) {
    if (!messageId) return false;
    return streamingManager.isStreamActive(messageId);
  }
};
