/**
 * Translation Batcher - Logic for splitting and grouping translation segments
 * Ensures that large texts are broken at safe boundaries and logically grouped by block.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ComplexityAnalyzer } from './ComplexityAnalyzer.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'TranslationBatcher');

export const TranslationBatcher = {
  /**
   * Split a very long text into smaller chunks at sentence boundaries.
   * Prevents provider errors caused by oversized input.
   * 
   * @param {string|object} segment - The segment to split (can be text or object with 't' property)
   * @param {number} maxChars - Maximum characters allowed per part
   * @returns {Array} Array of text parts or objects
   */
  splitOversizedSegment(segment, maxChars) {
    const isObject = typeof segment === 'object';
    const text = isObject ? (segment.t || segment.text || '') : (segment || '');
    
    if (!text || text.length <= maxChars) return [segment];
    
    const chunks = [];
    let remaining = text;
    let partIndex = 0;
    
    while (remaining.length > maxChars) {
      let breakPoint = -1;
      const lookback = Math.floor(maxChars * 0.2); // Look back 20% to find boundary
      const searchRegion = remaining.substring(maxChars - lookback, maxChars);
      
      // Look for sentence-ending punctuations
      const sentenceEnd = searchRegion.search(/[.!?]\s/);
      if (sentenceEnd !== -1) {
        breakPoint = maxChars - lookback + sentenceEnd + 1;
      } else {
        // Fallback: Break at last space within limit
        const space = searchRegion.lastIndexOf(' ');
        breakPoint = space !== -1 ? maxChars - lookback + space : maxChars;
      }
      
      const partText = remaining.substring(0, breakPoint).trim();
      if (isObject) {
        chunks.push({ ...segment, t: partText, text: partText, isSplit: true, partIndex: partIndex++ });
      } else {
        chunks.push(partText);
        partIndex++;
      }
      
      remaining = remaining.substring(breakPoint).trim();
    }
    
    if (remaining.length > 0) {
      if (isObject) {
        chunks.push({ ...segment, t: remaining, text: remaining, isSplit: true, partIndex: partIndex });
      } else {
        chunks.push(remaining);
      }
    }
    
    return chunks;
  },

  /**
   * Create intelligent batches based on text complexity and structural characteristics.
   * Uses block-level boundaries to group segments for better AI context.
   * 
   * @param {Array} segments - Original segments extracted from DOM
   * @param {number} baseBatchSize - Target number of segments per batch
   * @param {number} maxCharsPerBatch - Maximum characters allowed per batch
   * @returns {Array<Array>} Array of batches
   */
  createIntelligentBatches(segments, baseBatchSize, maxCharsPerBatch = 5000) {
    // 1. Flatten segments by splitting any that are too long
    const flattenedSegments = [];
    for (const seg of segments) {
      flattenedSegments.push(...this.splitOversizedSegment(seg, maxCharsPerBatch));
    }

    const batches = [];
    let currentBatch = [];
    let currentBatchComplexity = 0;
    let currentBatchChars = 0;
    let lastBlockId = null;
    
    for (let i = 0; i < flattenedSegments.length; i++) {
      const segment = flattenedSegments[i];
      const isObject = typeof segment === 'object';
      const text = isObject ? (segment.t || segment.text || '') : (segment || '');
      
      const segmentComplexity = ComplexityAnalyzer.calculateTextComplexity(text);
      const segmentChars = text.length;
      const blockId = isObject ? segment.blockId : null;
      
      // Calculate dynamic batch size limit based on segment complexity
      const adjustedBatchSize = ComplexityAnalyzer.getAdjustedBatchSize(segmentComplexity, baseBatchSize);
      
      // Logical Grouping: Try to keep items from the same block together
      const isBlockBoundary = lastBlockId && blockId && lastBlockId !== blockId;
      
      // Capacity checks
      const wouldExceedSize = currentBatch.length >= adjustedBatchSize;
      const wouldExceedComplexity = currentBatchComplexity + segmentComplexity > 1000; 
      const wouldExceedChars = currentBatchChars + segmentChars > maxCharsPerBatch;
      
      // Strategy: Flush if limits reached OR if we're at a logical block boundary and batch is > 70% full
      const shouldFlushBoundary = isBlockBoundary && currentBatch.length > (adjustedBatchSize * 0.7);

      if (wouldExceedSize || wouldExceedComplexity || wouldExceedChars || shouldFlushBoundary) {
        if (currentBatch.length > 0) {
          batches.push([...currentBatch]);
          currentBatch = [];
          currentBatchComplexity = 0;
          currentBatchChars = 0;
        }
      }
      
      currentBatch.push(segment);
      currentBatchComplexity += segmentComplexity;
      currentBatchChars += segmentChars;
      lastBlockId = blockId;
    }
    
    // Push the final batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
    
    logger.debug(`[TranslationBatcher] Created ${batches.length} intelligent batches (total input: ${segments.length} segments)`);
    return batches;
  },

  /**
   * Basic batching logic (fallback or simple use cases).
   * 
   * @param {Array} segments - Array of segments
   * @param {number} maxBatchSize - Items per batch
   * @returns {Array<Array>}
   */
  createOptimalBatches(segments, maxBatchSize) {
    const batches = [];
    for (let i = 0; i < segments.length; i += maxBatchSize) {
      batches.push(segments.slice(i, i + maxBatchSize));
    }
    return batches;
  }
};
