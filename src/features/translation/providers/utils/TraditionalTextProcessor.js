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
export const getTextInfo = (item) => {
  if (typeof item === 'string') return { text: item, length: item.length };
  if (item && typeof item === 'object') {
    const text = item.t || item.text || '';
    return { text: String(text), length: String(text).length };
  }
  const str = String(item || '');
  return { text: str, length: str.length };
};

// Selective Regex: Matches [[ only when it contains delimiter-like characters (dashes, dots, etc.)
// This version is less aggressive with surrounding whitespace to prevent word-clumping
const BIDI_ARTIFACT_REGEX = /\[\[[\s.——–…·・-]+\]\]/g;

export const TraditionalTextProcessor = {
  /**
   * Universal scrubbing for technical artifacts (brackets, BIDI marks)
   * This is a "Last Resort" safety layer to ensure no technical leak reaches the UI.
   * 
   * CRITICAL: Must preserve newlines (\\n) while cleaning up technical artifacts.
   */
  scrubBidiArtifacts(text) {
    if (!text || typeof text !== 'string') return text;
    
    // 1. Remove intact brackets (technical delimiters)
    let scrubbed = text.replace(BIDI_ARTIFACT_REGEX, '');
    
    // 2. Clean up specific BIDI marks and invisible characters
    // CRITICAL: We MUST preserve \u200C (ZWNJ) for Persian support and \u200D (ZWJ) for Emojis.
    // We only remove \u200B (ZWSP) and BiDi marks (LRM/RLM).
    scrubbed = scrubbed.replace(/[\u200B\u200E\u200F\uFEFF]/g, '');

    // 3. COLLAPSE HORIZONTAL WHITESPACE ONLY
    // We use [^\\S\\n\\r] to match all whitespace EXCEPT newlines.
    // This prevents \n\n from being collapsed into a single space.
    scrubbed = scrubbed.replace(/[^\S\n\r]{2,}/g, ' ');
    
    // 4. Remove isolated remnants (Safety layer for malformed delimiters)
    // We only strip dashes and dots if they are clearly part of a broken [[ or ]] marker.
    // 4. Remove isolated remnants (Safety layer for malformed delimiters)
    // We only strip dashes and dots if they are clearly part of a broken [[ or ]] marker.
    scrubbed = scrubbed.replace(/\[\[[\s.-]+/, '');
    scrubbed = scrubbed.replace(/[\s.-]+\]\]/, '');
    
    return scrubbed.trim();
  },

  /**
   * Create chunks based on provider strategy.
   * Enhanced to split single long strings that exceed the character limit.
   */
  createChunks(texts, providerName, strategy, charLimit, maxChunksPerBatch) {
    const chunks = [];
    const delimiterLength = TRANSLATION_CONSTANTS.TEXT_DELIMITER?.length || 0;
    const safeMaxChunks = maxChunksPerBatch || 50; // Defensive default

    if (strategy === 'character_limit') {
      let currentChunkItems = [];
      let currentCharCount = 0;

      for (const item of texts) {
        const { text, length } = getTextInfo(item);
        
        // If a single item is already too long, split it into smaller parts
        if (length > charLimit) {
          // Flush current chunk if any
          if (currentChunkItems.length > 0) {
            chunks.push({ texts: currentChunkItems, charCount: currentCharCount });
            currentChunkItems = [];
            currentCharCount = 0;
          }

          const parts = this.splitSingleLongString(text, charLimit);
          logger.debug(`[${providerName}] Single long item split into ${parts.length} parts`);
          
          for (const part of parts) {
            chunks.push({ texts: [part], charCount: part.length });
          }
          continue;
        }

        const effectiveLength = length + (currentChunkItems.length > 0 ? delimiterLength : 0);
        const wouldExceedCharLimit = currentChunkItems.length > 0 && currentCharCount + effectiveLength > charLimit;
        const wouldExceedSegmentLimit = currentChunkItems.length >= safeMaxChunks;

        if (wouldExceedCharLimit || wouldExceedSegmentLimit) {
          chunks.push({ texts: currentChunkItems, charCount: currentCharCount });
          currentChunkItems = [];
          currentCharCount = 0;
        }
        
        const addedLength = length + (currentChunkItems.length > 0 ? delimiterLength : 0);
        currentChunkItems.push(item);
        currentCharCount += addedLength;
      }

      if (currentChunkItems.length > 0) {
        chunks.push({ texts: currentChunkItems, charCount: currentCharCount });
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
   * Split a single long string into multiple parts that don't exceed limit
   * Uses sentence markers for clean semantic splits where possible.
   */
  splitSingleLongString(text, limit) {
    if (!text || text.length <= limit) return [text];
    
    const parts = [];
    let remaining = text;
    
    while (remaining.length > limit) {
      // Try to split by sentence markers first (ordered by semantic strength)
      const sentenceMarkers = ['\n', '. ', '! ', '? ', '。', '！', '？', '، ', '؛ ', '、', '; '];
      let splitIdx = -1;
      
      for (const marker of sentenceMarkers) {
        const idx = remaining.lastIndexOf(marker, limit);
        if (idx > splitIdx) {
          splitIdx = idx + marker.length;
        }
      }
      
      // Fallback to space
      if (splitIdx <= 0) {
        splitIdx = remaining.lastIndexOf(' ', limit);
      }
      
      // Fallback to hard cut
      if (splitIdx <= 0) {
        splitIdx = limit;
      }
      
      parts.push(remaining.substring(0, splitIdx).trim());
      remaining = remaining.substring(splitIdx).trim();
    }
    
    if (remaining.length > 0) {
      parts.push(remaining);
    }
    
    return parts;
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
