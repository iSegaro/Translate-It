/**
 * Traditional Batch Processor - Handles sequential batch processing for traditional translation providers
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { matchErrorToType, isFatalError } from "@/shared/error-management/ErrorMatcher.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TraditionalBatchProcessor');

export const TraditionalBatchProcessor = {
  /**
   * Processes an array of text segments in batches, respecting provider-specific limits.
   */
  async processInBatches(provider, segments, translateChunk, limits, abortController = null, priority = null) {
    const { CHUNK_SIZE, CHAR_LIMIT } = limits;
    const { TranslationPriority, rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    const targetPriority = priority || TranslationPriority.NORMAL;

    const chunks = [];
    const chunkIndexMap = [];
    let currentChunk = [];
    let currentCharCount = 0;
    let currentIndices = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentLength = segment.length;

      if (segmentLength > CHAR_LIMIT) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          chunkIndexMap.push([...currentIndices]);
          currentChunk = [];
          currentCharCount = 0;
          currentIndices = [];
        }
        chunks.push([segment]);
        chunkIndexMap.push([i]);
        continue;
      }

      if (
        currentChunk.length > 0 &&
        (currentChunk.length >= CHUNK_SIZE ||
          currentCharCount + segmentLength > CHAR_LIMIT)
      ) {
        chunks.push(currentChunk);
        chunkIndexMap.push([...currentIndices]);
        currentChunk = [];
        currentCharCount = 0;
        currentIndices = [];
      }

      currentChunk.push(segment);
      currentCharCount += segmentLength;
      currentIndices.push(i);
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
      chunkIndexMap.push([...currentIndices]);
    }

    const translatedSegments = new Array(segments.length);

    for (let i = 0; i < chunks.length; i++) {
      if (abortController && abortController.signal.aborted) {
        const cancelError = new Error('Translation cancelled by user');
        cancelError.name = 'AbortError';
        cancelError.type = ErrorTypes.USER_CANCELLED;
        throw cancelError;
      }

      const chunk = chunks[i];
      const indices = chunkIndexMap[i];
      const context = `batch-${i + 1}/${chunks.length}`;

      try {
        const result = await rateLimitManager.executeWithRateLimit(
          provider.providerName,
          () => translateChunk(chunk, i, chunks.length),
          context,
          targetPriority
        );

        if (result.length === chunk.length) {
          for (let j = 0; j < indices.length; j++) {
            translatedSegments[indices[j]] = result[j];
          }
        } else {
          for (let j = 0; j < indices.length; j++) {
            translatedSegments[indices[j]] = chunk[j];
          }
        }
      } catch (error) {
        logger.error(`[${provider.providerName}] Chunk ${i + 1} failed:`, error);
        const errorType = error.type || matchErrorToType(error);
        if (!error.type) error.type = errorType;

        if (isFatalError(error) || isFatalError(errorType)) {
          throw error;
        }

        for (let j = 0; j < indices.length; j++) {
          translatedSegments[indices[j]] = chunk[j];
        }
      }
    }

    return translatedSegments;
  }
};
