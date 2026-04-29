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
    const scrub = (text) => this.removeAllDelimiters(text, delimiter);

    if (!translatedText || !Array.isArray(originalSegments)) {
      return [typeof translatedText === 'string' ? scrub(translatedText) : translatedText];
    }

    // 0. Handle unified response object from ProviderCoordinator
    if (typeof translatedText === 'object' && !Array.isArray(translatedText) && translatedText.translatedText !== undefined) {
      translatedText = translatedText.translatedText;
    }

    if (originalSegments.length <= 1) {
      const result = Array.isArray(translatedText) ? translatedText : [translatedText];
      return result.map(s => typeof s === 'string' ? scrub(s) : s);
    }

    // 0.5. Normalize common delimiter mangling (e.g. "[[ --- ]]" or "[[ ... ]]")
    if (typeof translatedText === 'string') {
      // Selective Regex: Matches [[ only when it contains delimiter-like characters (dashes, dots, etc.)
      // This preserves user content like [[Reference]] while allowing normalization of mangled delimiters.
      const bracketPattern = /[\s\u200B-\u200D\u200E\u200F\uFEFF]*\[\[[\s.——–…ـ·・-]+\]\][\s\u200B-\u200D\u200E\u200F\uFEFF]*/g;
      if (bracketPattern.test(translatedText)) {
        translatedText = translatedText.replace(bracketPattern, delimiter);
      }
    }

    // 0.6. Handle cases where translatedText is already an array
    if (Array.isArray(translatedText)) {
      if (translatedText.length === originalSegments.length) {
        return translatedText.map(s => typeof s === 'string' ? scrub(s) : s);
      }
      translatedText = translatedText.join('\n');
    }

    // 1. Try standard splitting
    let segments = translatedText.split(delimiter);
    if (segments.length === originalSegments.length) {
      return segments.map(s => scrub(s).trim());
    }

    // 2. Try alternative common delimiters
    for (const altDelim of ALTERNATIVE_DELIMITERS) {
      const testSegments = translatedText.split(altDelim);
      if (testSegments.length === originalSegments.length) {
        logger.info(`[${providerName}] Found working alternative delimiter: "${altDelim}"`);
        return testSegments.map(s => scrub(s).trim());
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

    // 1. Aggressive Regex: Matches [[ with anything inside ]] and ALL surrounding hidden Unicode marks/spaces
    // Selective Regex: Matches [[ only when it contains delimiter-like characters (dashes, dots, etc.)
    // This preserves user content like [[Reference]] while scrubbing [[ --- ]]
    const BIDI_ARTIFACT_REGEX = /[\s\u200B-\u200D\u200E\u200F\uFEFF]*\[\[[\s.——–…ـ·・-]+\]\][\s\u200B-\u200D\u200E\u200F\uFEFF]*/g;
    let cleaned = text.replace(BIDI_ARTIFACT_REGEX, ' ');

    // 2. Remove standard, primary, and common alternative delimiters
    const delimitersToRemove = new Set([
      primaryDelimiter,
      DEFAULT_TEXT_DELIMITER,
      ...ALTERNATIVE_DELIMITERS
    ]);

    for (const delim of delimitersToRemove) {
      if (!delim || delim.trim() === '') continue;
      const escaped = delim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleaned = cleaned.split(new RegExp(escaped, 'g')).join(' ');
    }

    // 3. Clean up isolated bracket remnants and delimiter fragments at word boundaries
    // Includes artifacts from all major providers: Bing (—–…ـ), Google (·・), and common dashes/dots
    cleaned = cleaned.replace(/\[\[[\s.——–…ـ·・-]+/, ' ');
    cleaned = cleaned.replace(/[\s.——–…ـ·・-]+\]\]/, ' ');
    cleaned = cleaned.replace(/\s[\]——–…ـ·・-]+\s/g, ' ');
    cleaned = cleaned.replace(/\s[[——–…ـ·・-]+\s/g, ' ');

    // 4. Final safety scrub using the BIDI regex again (handles cases where delimiters merged)
    cleaned = cleaned.replace(BIDI_ARTIFACT_REGEX, ' ');

    // 5. Normalize whitespace
    return cleaned.replace(/\s+/g, ' ').trim();
  }

/**
* Split translated text based on word boundaries and length ratios.
...
   * Prevents "half-word" splitting like "س ا ۸ عت" by respecting word boundaries.
   * @private
   */
  static splitByWordRatio(translatedText, originalSegments, providerName) {
    // Ensure we are working with text lengths even if segments are objects (Page Translation mode)
    const getLength = (s) => (typeof s === 'object' ? (s.t || s.text || "") : String(s || "")).length;
    const totalOriginalChars = originalSegments.reduce((sum, s) => sum + getLength(s), 0);
    
    const words = translatedText.trim().split(/\s+/);
    
    if (words.length === 0) return originalSegments.map(() => "");

    const result = new Array(originalSegments.length).fill("");
    let currentWordIdx = 0;

    for (let i = 0; i < originalSegments.length; i++) {
      const segText = typeof originalSegments[i] === 'object' ? (originalSegments[i].t || originalSegments[i].text || "") : String(originalSegments[i] || "");
      
      if (segText.trim() === "") {
        result[i] = "";
        continue;
      }

      const ratio = getLength(originalSegments[i]) / totalOriginalChars;
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
