/**
 * Translation Segment Mapper Utility
 * Provides common functionality for mapping translated text back to original segments
 * Used by translation providers to handle segment reconstruction when delimiters fail
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { DEFAULT_TEXT_DELIMITER, ALTERNATIVE_DELIMITERS } from '@/features/translation/core/ProviderConfigurations.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'SegmentMapper');

/**
 * Delimiters that unambiguously mark structured segment output (bracket/dash
 * markers). Only these may trigger hard INCOMPLETE_CARDINALITY rejection.
 * Generic formatting separators (plain '\n', '\n\n') are deliberately excluded
 * so ordinary multiline translations never hard-fail on line-break formatting.
 */
const STRUCTURAL_SEGMENT_DELIMITERS = new Set([
  DEFAULT_TEXT_DELIMITER,   // '\n[[---]]\n'
  '[[---]]',
  '\n\n---\n\n',            // Lingva subgroup delimiter
  '\n---\n',
]);

/**
 * Generic formatting delimiters. Used for splitting/mapping only; they can
 * never trigger INCOMPLETE_CARDINALITY.
 */
const GENERIC_FORMATTING_DELIMITERS = ALTERNATIVE_DELIMITERS.filter(
  (delimiter) => !STRUCTURAL_SEGMENT_DELIMITERS.has(delimiter)
);

export class TranslationSegmentMapper {
  /**
   * Standard delimiter for separating text segments.
   * Using a more resilient pattern that traditional providers are less likely to merge.
   */
  static STANDARD_DELIMITER = DEFAULT_TEXT_DELIMITER;

  /**
   * Error type for incomplete cardinality: delimiter present but split count wrong.
   */
  static INCOMPLETE_CARDINALITY = 'INCOMPLETE_CARDINALITY';

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

    // 2. Try alternative common delimiters.
    // Structural delimiters prove segmented output; only they may trigger hard
    // cardinality rejection. Generic formatting separators ('\n', '\n\n') are
    // consulted only when no structural delimiter is present, so ordinary
    // multiline translations never hard-fail.
    const structuralDelims = [...STRUCTURAL_SEGMENT_DELIMITERS];
    const genericDelims = GENERIC_FORMATTING_DELIMITERS;
    let delimiterFound = false;

    for (const altDelim of structuralDelims) {
      const testSegments = translatedText.split(altDelim);
      if (testSegments.length === originalSegments.length) {
        logger.info(`[${providerName}] Found working alternative delimiter: "${altDelim}"`);
        return testSegments.map(s => scrub(s).trim());
      }
      if (testSegments.length > 1) {
        delimiterFound = true;
      }
    }

    if (!delimiterFound) {
      for (const altDelim of genericDelims) {
        const testSegments = translatedText.split(altDelim);
        if (testSegments.length === originalSegments.length) {
          logger.info(`[${providerName}] Found working alternative delimiter: "${altDelim}"`);
          return testSegments.map(s => scrub(s).trim());
        }
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

    // 3.5. Source-aware blank reconstruction: translated parts match nonblank count.
    // Structural delimiters take precedence; generic newlines are only consulted
    // when no structural delimiter was found in the text.
    if (nonEmptyOriginals.length > 1 && typeof translatedText === 'string') {
      const reconstruct = (delims) => {
        for (const altDelim of delims) {
          const translatedParts = translatedText.split(altDelim);
          if (translatedParts.length === nonEmptyOriginals.length) {
            const result = new Array(originalSegments.length).fill('');
            nonEmptyOriginals.forEach((entry, i) => {
              result[entry.id] = scrub(translatedParts[i]).trim();
            });
            logger.info(`[${providerName}] Used source-aware blank reconstruction (${translatedParts.length} translated, ${nonEmptyOriginals.length} nonblank)`);
            return result;
          }
        }
        return null;
      };

      const structuralResult = reconstruct(structuralDelims);
      if (structuralResult) return structuralResult;

      if (!delimiterFound) {
        const genericResult = reconstruct(genericDelims);
        if (genericResult) return genericResult;
      }
    }

    // 3.6. Incomplete cardinality: delimiter present but no split matched total or nonblank
    if (delimiterFound) {
      const error = new Error(
        `[${providerName}] Incomplete translation: delimiter found but split produced wrong segment count ` +
        `(expected ${originalSegments.length} total / ${nonEmptyOriginals.length} nonblank)`
      );
      error.type = TranslationSegmentMapper.INCOMPLETE_CARDINALITY;
      throw error;
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

    // 5. Normalize horizontal whitespace only (preserve newlines)
    return cleaned.replace(/[^\S\n\r]+/g, ' ').trim();
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
