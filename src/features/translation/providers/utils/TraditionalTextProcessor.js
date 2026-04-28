/**
 * Traditional Text Processor - Handles chunking and character counting for traditional providers
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TraditionalTextProcessor');

/**
 * Helper to safely get text content and length from various input types
 */
const getTextInfo = (item) => {
  if (typeof item === 'string') return { text: item, length: item.length };
  if (item && typeof item === 'object') {
    const text = item.t || item.text || '';
    return { text: String(text), length: String(text).length };
  }
  const str = String(item || '');
  return { text: str, length: str.length };
};

export const TraditionalTextProcessor = {
  /**
   * Create chunks based on provider strategy
   */
  createChunks(texts, providerName, strategy, charLimit, maxChunksPerBatch) {
    const chunks = [];
    const delimiterLength = TRANSLATION_CONSTANTS.TEXT_DELIMITER?.length || 0;
    const safeMaxChunks = maxChunksPerBatch || 50; // Defensive default

    if (strategy === 'character_limit') {
      let currentChunk = [];
      let currentCharCount = 0;

      for (const item of texts) {
        const { length } = getTextInfo(item);
        const effectiveLength = length + (currentChunk.length > 0 ? delimiterLength : 0);
        const wouldExceedCharLimit = currentChunk.length > 0 && currentCharCount + effectiveLength > charLimit;
        const wouldExceedSegmentLimit = currentChunk.length >= safeMaxChunks;

        if (wouldExceedCharLimit || wouldExceedSegmentLimit) {
          chunks.push({ texts: currentChunk, charCount: currentCharCount });
          currentChunk = [];
          currentCharCount = 0;
        }
        
        const addedLength = length + (currentChunk.length > 0 ? delimiterLength : 0);
        currentChunk.push(item);
        currentCharCount += addedLength;
      }

      if (currentChunk.length > 0) {
        chunks.push({ texts: currentChunk, charCount: currentCharCount });
      }
    } else {
      for (let i = 0; i < texts.length; i += safeMaxChunks) {
        const chunkTexts = texts.slice(i, i + safeMaxChunks);
        const rawChars = chunkTexts.reduce((sum, item) => sum + getTextInfo(item).length, 0);
        const delimitersCount = Math.max(0, chunkTexts.length - 1);
        chunks.push({ texts: chunkTexts, charCount: rawChars + (delimitersCount * delimiterLength) });
      }
    }

    logger.debug(`[${providerName}] Created ${chunks.length} chunks from ${texts.length} items`);
    return chunks;
  },

  /**
   * Check if texts need chunking
   */
  needsChunking(texts, strategy, charLimit, maxChunksPerBatch) {
    if (strategy === 'character_limit') {
      const totalChars = texts.reduce((sum, item) => sum + getTextInfo(item).length, 0);
      return totalChars > charLimit;
    }
    return texts.length > maxChunksPerBatch;
  },

  /**
   * Calculate network character count for traditional providers
   */
  calculateTraditionalCharCount(texts) {
    if (!texts || texts.length === 0) return 0;
    const rawChars = texts.reduce((sum, item) => sum + getTextInfo(item).length, 0);
    const delimiterLength = TRANSLATION_CONSTANTS.TEXT_DELIMITER?.length || 0;
    const delimitersCount = Math.max(0, texts.length - 1);
    return rawChars + (delimitersCount * delimiterLength);
  }
};
