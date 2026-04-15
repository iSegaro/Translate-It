/**
 * Translation Segment Mapper Utility
 * Provides common functionality for mapping translated text back to original segments
 * Used by translation providers to handle segment reconstruction when delimiters fail
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SegmentMapper');

export class TranslationSegmentMapper {
  /**
   * Standard delimiter for separating text segments.
   * Using a more resilient pattern that traditional providers are less likely to merge.
   */
  static STANDARD_DELIMITER = '\n[[---]]\n';

  /**
   * Enhanced mapping: attempt to reconstruct original segments from translated text
   */
  static mapTranslationToOriginalSegments(translatedText, originalSegments, delimiter, providerName = 'Unknown') {
    if (!translatedText || !Array.isArray(originalSegments)) {
      return [translatedText];
    }

    if (originalSegments.length <= 1) {
      return Array.isArray(translatedText) ? translatedText : [translatedText];
    }

    // 0. Handle cases where translatedText is already an array (e.g. from a provider that returns arrays)
    if (Array.isArray(translatedText)) {
      if (translatedText.length === originalSegments.length) {
        return translatedText;
      }
      // If it is an array but wrong length, join it to try splitting by delimiters below
      translatedText = translatedText.join('\n');
    }

    // 1. Try standard splitting
    let segments = translatedText.split(delimiter);
    if (segments.length === originalSegments.length) return segments;

    // 2. Try alternative common delimiters
    const alternatives = [
      '[[---]]',
      '\n---\n',
      '---',
      '\n\n',
      '\n'
    ];

    for (const altDelim of alternatives) {
      const testSegments = translatedText.split(altDelim);
      if (testSegments.length === originalSegments.length) {
        logger.info(`[${providerName}] Found working alternative delimiter: "${altDelim}"`);
        return testSegments.map(s => s.trim());
      }
    }

    // 3. Handle Empty/Whitespace segments preservation
    // This is critical for social media like Twitter where icons/dots are separate nodes
    const nonEmptyOriginals = originalSegments.map((s, i) => ({ text: s, id: i })).filter(s => s.text.trim() !== '');
    
    // If we only have 1 non-empty segment, map everything to it
    if (nonEmptyOriginals.length === 1) {
      const result = originalSegments.map(s => s.trim() === '' ? s : '');
      result[nonEmptyOriginals[0].id] = translatedText.trim();
      return result;
    }

    // 4. Last Resort: Smart Word-Based Distribution (Replacing the broken character-ratio split)
    try {
      return this.splitByWordRatio(translatedText, originalSegments, providerName);
    } catch (error) {
      logger.warn(`[${providerName}] Smart splitting failed:`, error);
      // Absolute fallback: first segment gets everything, others get original
      return originalSegments.map((s, i) => i === 0 ? translatedText : s);
    }
  }

  /**
   * Split translated text based on word boundaries and length ratios.
   * Prevents "half-word" splitting like "س ا ۸ عت" by respecting word boundaries.
   * @private
   */
  static splitByWordRatio(translatedText, originalSegments, providerName) {
    const totalOriginalChars = originalSegments.reduce((sum, s) => sum + s.length, 0);
    const words = translatedText.trim().split(/\s+/);
    
    if (words.length === 0) return originalSegments.map(() => "");

    const result = new Array(originalSegments.length).fill("");
    let currentWordIdx = 0;

    for (let i = 0; i < originalSegments.length; i++) {
      if (originalSegments[i].trim() === "") {
        result[i] = originalSegments[i];
        continue;
      }

      const ratio = originalSegments[i].length / totalOriginalChars;
      const targetWordCount = Math.max(1, Math.round(ratio * words.length));
      
      const segmentWords = words.slice(currentWordIdx, currentWordIdx + targetWordCount);
      
      // If it's the last segment, take all remaining words
      if (i === originalSegments.length - 1 || (currentWordIdx + targetWordCount >= words.length)) {
        result[i] = words.slice(currentWordIdx).join(" ");
        break;
      }

      result[i] = segmentWords.join(" ");
      currentWordIdx += targetWordCount;
    }

    logger.info(`[${providerName}] Used Word-Ratio splitting to preserve word integrity`);
    return result;
  }
}
