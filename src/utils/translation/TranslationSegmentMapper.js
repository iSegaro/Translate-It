/**
 * Translation Segment Mapper Utility
 * Provides common functionality for mapping translated text back to original segments
 * Used by translation providers to handle segment reconstruction when delimiters fail
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { DEFAULT_TEXT_DELIMITER, ALTERNATIVE_DELIMITERS } from '@/features/translation/core/ProviderConfigurations.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SegmentMapper');

export class TranslationSegmentMapper {
  /**
   * Standard delimiter for separating text segments.
   * Using a more resilient pattern that traditional providers are less likely to merge.
   */
  static STANDARD_DELIMITER = DEFAULT_TEXT_DELIMITER;

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
    for (const altDelim of ALTERNATIVE_DELIMITERS) {
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
      // CRITICAL: Before word-ratio splitting, remove ALL possible delimiters from the text
      // to avoid them appearing as "words" in the output segments.
      const cleanedText = this.removeAllDelimiters(translatedText, delimiter);
      return this.splitByWordRatio(cleanedText, originalSegments, providerName);
    } catch (error) {
      logger.warn(`[${providerName}] Smart splitting failed:`, error);
      // Absolute fallback: first segment gets everything, others get original
      return originalSegments.map((s, i) => i === 0 ? translatedText : s);
    }
  }

  /**
   * Utility to remove all known delimiter patterns from text before fallback splitting
   * @param {string} text - The text to clean
   * @param {string} primaryDelimiter - The primary delimiter used in the current request
   * @returns {string} - Cleaned text
   */
  static removeAllDelimiters(text, primaryDelimiter) {
    if (!text) return "";

    let cleaned = text;

    // 1. Remove standard, primary, and common alternative delimiters
    // Use a Set to ensure unique patterns and filter out empty/null values
    const delimitersToRemove = new Set([
      primaryDelimiter,
      DEFAULT_TEXT_DELIMITER,
      ...ALTERNATIVE_DELIMITERS
    ]);

    for (const delim of delimitersToRemove) {
      if (!delim || delim.trim() === '') continue;
      // Escape for regex
      const escaped = delim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleaned = cleaned.split(new RegExp(escaped, 'g')).join(' ');
    }

    // 2. Remove any corrupted bracket patterns [[...]] which are the main source of artifacts
    const bracketPattern = /\[\[[\s\.\-\—\–\…ـ]+\]\]/g;
    cleaned = cleaned.replace(bracketPattern, ' ');

    // 3. Normalize whitespace (reduces multiple spaces/newlines to single space)
    return cleaned.replace(/\s+/g, ' ').trim();
  }

/**
* Split translated text based on word boundaries and length ratios.
...
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
