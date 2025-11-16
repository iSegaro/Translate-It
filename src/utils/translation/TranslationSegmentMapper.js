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
   * Standard delimiter for separating text segments
   */
  static STANDARD_DELIMITER = '\n\n---\n\n';

  /**
   * Enhanced mapping: attempt to reconstruct original segments from translated text
   * @param {string} translatedText - The complete translated text
   * @param {string[]} originalSegments - Original segments that were sent for translation
   * @param {string} delimiter - The delimiter that should separate segments
   * @param {string} providerName - Name of the provider for logging
   * @returns {string[]} - Mapped segments matching original count
   */
  static mapTranslationToOriginalSegments(translatedText, originalSegments, delimiter, providerName = 'Unknown') {
    if (!translatedText || !Array.isArray(originalSegments)) {
      return [translatedText];
    }

    // First, try standard splitting
    let segments = translatedText.split(delimiter);

    // If standard splitting works, return it
    if (segments.length === originalSegments.length) {
      return segments;
    }

    // Enhanced fallback: try to split by alternative delimiters and patterns
    const alternatives = [
      delimiter.trim(),
      '\n\n---\n',                    // Missing newline
      '\n---\n\n',                    // Missing newline on other side
      '---',                         // Just the separator
      '\n\n',                         // Double newlines
      '\n',                          // Single newlines (last resort)
    ];

    for (const altDelim of alternatives) {
      const testSegments = translatedText.split(altDelim);
      if (testSegments.length === originalSegments.length) {
        logger.info(`[${providerName}] Found working alternative delimiter: "${altDelim}"`);
        return testSegments;
      }
    }

    // Advanced fallback: map based on whitespace and empty segments
    const emptySegmentIndices = originalSegments
      .map((seg, idx) => seg.trim() === '' ? idx : -1)
      .filter(idx => idx !== -1);

    if (emptySegmentIndices.length > 0) {
      // If we have empty segments in original, try to map them
      const nonEmptyOriginals = originalSegments.filter(seg => seg.trim() !== '');
      const nonEmptyTranslated = segments.filter(seg => seg.trim() !== '');

      if (nonEmptyTranslated.length === nonEmptyOriginals.length) {
        // Reconstruct full array with empty segments
        const result = new Array(originalSegments.length);
        let translatedIdx = 0;

        for (let i = 0; i < originalSegments.length; i++) {
          if (originalSegments[i].trim() === '') {
            result[i] = originalSegments[i]; // Keep original empty/whitespace
          } else {
            result[i] = nonEmptyTranslated[translatedIdx++];
          }
        }

        logger.info(`[${providerName}] Successfully reconstructed segments with empty segment mapping`);
        return result;
      }
    }

    // Last resort: split by pattern matching original structure
    try {
      const result = this.splitByPattern(translatedText, originalSegments, providerName);
      if (result.length === originalSegments.length) {
        logger.info(`[${providerName}] Successfully split by pattern matching`);
        return result;
      }
    } catch (error) {
      logger.warn(`[${providerName}] Pattern splitting failed:`, error);
    }

    // If all else fails, return as single segment
    return [translatedText];
  }

  /**
   * Split translation text by matching patterns from original segments
   * @param {string} translatedText - Complete translated text
   * @param {string[]} originalSegments - Original segments for pattern reference
   * @param {string} providerName - Name of the provider for logging
   * @returns {string[]} - Split segments
   */
  static splitByPattern(translatedText, originalSegments, providerName = 'Unknown') {
    const result = [];
    let delimiterPattern = new RegExp(`(\n\n---\n\n|\\n\\n---\\n|\\n---\\n\n|---|\\n\\n|\\n)`, 'g');

    logger.debug(`[${providerName}] Splitting translated text by pattern matching`);

    // Try to find delimiters in translated text
    const matches = [...translatedText.matchAll(delimiterPattern)];

    if (matches.length === originalSegments.length - 1) {
      // Extract segments between delimiters
      let lastIndex = 0;
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const segment = translatedText.substring(lastIndex, match.index);
        result.push(segment);
        lastIndex = match.index + match[0].length;
      }
      result.push(translatedText.substring(lastIndex)); // Last segment
      return result;
    }

    // Fallback: try to estimate segment boundaries based on length ratios
    const totalLength = translatedText.length;
    const originalLengths = originalSegments.map(seg => seg.length);
    const totalOriginalLength = originalLengths.reduce((a, b) => a + b, 0);

    let currentIndex = 0;
    for (let i = 0; i < originalSegments.length - 1; i++) {
      const expectedLength = Math.round((originalLengths[i] / totalOriginalLength) * totalLength);
      const segment = translatedText.substring(currentIndex, currentIndex + expectedLength);
      result.push(segment);
      currentIndex += expectedLength;
    }
    result.push(translatedText.substring(currentIndex)); // Last segment

    return result;
  }

  /**
   * Create a simple alternative fallback for segment mapping
   * @param {string} translatedText - The complete translated text
   * @param {string[]} originalSegments - Original segments that were sent for translation
   * @param {string} providerName - Name of the provider for logging
   * @returns {string[]} - Mapped segments
   */
  static createAlternativeFallback(translatedText, originalSegments, providerName = 'Unknown') {
    // Try splitting by "---" (delimiter might have been translated)
    const altSplit1 = translatedText.split(/\n*---\n*/);
    if (altSplit1.length === originalSegments.length) {
      logger.debug(`[${providerName}] Successfully recovered segments using alternative splitting`);
      return altSplit1.map(t => t.trim());
    }

    // Try splitting by double newlines
    const altSplit2 = translatedText.split(/\n\n+/);
    if (altSplit2.length === originalSegments.length) {
      logger.debug(`[${providerName}] Successfully recovered segments using newline splitting`);
      return altSplit2.map(t => t.trim());
    }

    // Last resort: distribute text evenly
    logger.debug(`[${providerName}] Using fallback: returning original text count with empty strings`);
    return originalSegments.map((_, index) => index === 0 ? translatedText : "");
  }
}