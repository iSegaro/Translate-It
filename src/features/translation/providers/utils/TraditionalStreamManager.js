/**
 * Traditional Stream Manager - Handles streaming results for traditional translation providers
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { streamingManager } from "@/features/translation/core/StreamingManager.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TraditionalStreamManager');

export const TraditionalStreamManager = {
  /**
   * Stream chunk results
   */
  async streamChunkResults(providerName, chunkResults, originalChunkTexts, chunkIndex, messageId, sourceLanguage = null, targetLanguage = null, charCount = null, originalCharCount = null) {
    try {
      await streamingManager.streamBatchResults(
        messageId,
        chunkResults,
        originalChunkTexts,
        chunkIndex,
        sourceLanguage,
        targetLanguage,
        charCount,
        originalCharCount
      );
      logger.debug(`[${providerName}] Successfully streamed chunk ${chunkIndex + 1} results`);
    } catch (error) {
      logger.error(`[${providerName}] Failed to stream chunk ${chunkIndex + 1} results:`, error);
    }
  },

  /**
   * Stream error for a chunk
   */
  async streamChunkError(providerName, error, chunkIndex, messageId) {
    try {
      await streamingManager.streamBatchError(messageId, error, chunkIndex);
      logger.debug(`[${providerName}] Error streamed for chunk ${chunkIndex + 1}`);
    } catch (streamError) {
      logger.error(`[${providerName}] Failed to stream error for chunk ${chunkIndex + 1}:`, streamError);
    }
  },

  /**
   * Send streaming end notification
   */
  async sendStreamEnd(providerName, messageId, options = {}) {
    try {
      await streamingManager.completeStream(messageId, !options.error, options);
      logger.debug(`[${providerName}] Streaming session completed`);
    } catch (error) {
      logger.error(`[${providerName}] Failed to complete streaming session:`, error);
    }
  }
};
