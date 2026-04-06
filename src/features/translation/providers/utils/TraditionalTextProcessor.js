/**
 * Traditional Text Processor - Handles chunking and character counting for traditional providers
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TraditionalTextProcessor');

export const TraditionalTextProcessor = {
  /**
   * Create chunks based on provider strategy
   */
  createChunks(texts, providerName, strategy, charLimit, maxChunksPerBatch) {
    const chunks = [];
    const delimiterLength = TRANSLATION_CONSTANTS.TEXT_DELIMITER?.length || 0;

    if (strategy === 'character_limit') {
      let currentChunk = [];
      let currentCharCount = 0;

      for (const text of texts) {
        const effectiveLength = text.length + (currentChunk.length > 0 ? delimiterLength : 0);
        const wouldExceedCharLimit = currentChunk.length > 0 && currentCharCount + effectiveLength > charLimit;
        const wouldExceedSegmentLimit = currentChunk.length >= maxChunksPerBatch;

        if (wouldExceedCharLimit || wouldExceedSegmentLimit) {
          chunks.push({ texts: currentChunk, charCount: currentCharCount });
          currentChunk = [];
          currentCharCount = 0;
        }
        
        const addedLength = text.length + (currentChunk.length > 0 ? delimiterLength : 0);
        currentChunk.push(text);
        currentCharCount += addedLength;
      }

      if (currentChunk.length > 0) {
        chunks.push({ texts: currentChunk, charCount: currentCharCount });
      }
    } else {
      for (let i = 0; i < texts.length; i += maxChunksPerBatch) {
        const chunkTexts = texts.slice(i, i + maxChunksPerBatch);
        const rawChars = chunkTexts.reduce((sum, text) => sum + text.length, 0);
        const delimitersCount = Math.max(0, chunkTexts.length - 1);
        chunks.push({ texts: chunkTexts, charCount: rawChars + (delimitersCount * delimiterLength) });
      }
    }

    logger.debug(`[${providerName}] Created ${chunks.length} chunks from ${texts.length} texts`);
    return chunks;
  },

  /**
   * Check if texts need chunking
   */
  needsChunking(texts, strategy, charLimit, maxChunksPerBatch) {
    if (strategy === 'character_limit') {
      const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
      return totalChars > charLimit;
    }
    return texts.length > maxChunksPerBatch;
  },

  /**
   * Calculate network character count for traditional providers
   */
  calculateTraditionalCharCount(texts) {
    if (!texts || texts.length === 0) return 0;
    const rawChars = texts.reduce((sum, text) => sum + (text?.length || 0), 0);
    const delimiterLength = TRANSLATION_CONSTANTS.TEXT_DELIMITER?.length || 0;
    const delimitersCount = Math.max(0, texts.length - 1);
    return rawChars + (delimitersCount * delimiterLength);
  }
};
