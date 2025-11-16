// src/core/providers/GoogleTranslateProvider.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import {
  getGoogleTranslateUrlAsync,
  getEnableDictionaryAsync
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode } from "@/shared/config/config.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleTranslate');
const RELIABLE_DELIMITER = '\n\n---\n\n';

const langNameToCodeMap = {
  afrikaans: "af", albanian: "sq", arabic: "ar", azerbaijani: "az", belarusian: "be", bengali: "bn", bulgarian: "bg", catalan: "ca", cebuano: "ceb", "chinese (simplified)": "zh", chinese: "zh", croatian: "hr", czech: "cs", danish: "da", dutch: "nl", english: "en", estonian: "et", farsi: "fa", persian: "fa", filipino: "fil", finnish: "fi", french: "fr", german: "de", greek: "el", hebrew: "he", hindi: "hi", hungarian: "hu", indonesian: "id", italian: "it", japanese: "ja", kannada: "kn", kazakh: "kk", korean: "ko", latvian: "lv", lithuanian: "lt", malay: "ms", malayalam: "ml", marathi: "mr", nepali: "ne", norwegian: "no", odia: "or", pashto: "ps", polish: "pl", portuguese: "pt", punjabi: "pa", romanian: "ro", russian: "ru", serbian: "sr", sinhala: "si", slovak: "sk", slovenian: "sl", spanish: "es", swahili: "sw", swedish: "sv", tagalog: "tl", tamil: "ta", telugu: "te", thai: "th", turkish: "tr", ukrainian: "uk", urdu: "ur", uzbek: "uz", vietnamese: "vi",
};

export class GoogleTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static description = "Free Google Translate service";
  static displayName = "Google Translate";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  static CHAR_LIMIT = 3900;
  
  // BaseTranslateProvider capabilities
  static supportsStreaming = true;
  static chunkingStrategy = 'character_limit';
  static characterLimit = 3900;
  static maxChunksPerBatch = 10;

  constructor() {
    super("GoogleTranslate");
  }

  _getLangCode(lang) {
    if (!lang || typeof lang !== "string") return "auto";
    const lowerCaseLang = lang.toLowerCase();
    return langNameToCodeMap[lowerCaseLang] || lowerCaseLang;
  }

  /**
   * Translate a single chunk of texts using Google's API
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController) {
    const context = `${this.providerName.toLowerCase()}-translate-chunk`;
    const isDictionaryEnabled = await getEnableDictionaryAsync();

    // Add key info log for translation start
    logger.info(`[Google] Starting translation: ${chunkTexts.join(RELIABLE_DELIMITER).length} chars`);
    // Dictionary should only be enabled for single-segment translations and NOT in Field mode.
    const shouldIncludeDictionary = isDictionaryEnabled && chunkTexts.length === 1 && translateMode !== TranslationMode.Field;

    const apiUrl = await getGoogleTranslateUrlAsync();
    const queryParams = new URLSearchParams({
      client: 'gtx',
      sl: sourceLang,
      tl: targetLang,
      dt: 't',
    });

    if (shouldIncludeDictionary && chunkTexts.length === 1) {
      queryParams.append('dt', 'bd');
    }

    const textToTranslate = chunkTexts.join(RELIABLE_DELIMITER);
    const requestBody = `q=${encodeURIComponent(textToTranslate)}`;

    const result = await this._executeWithErrorHandling({
      url: `${apiUrl}?${queryParams.toString()}`,
      fetchOptions: {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: requestBody,
      },
      extractResponse: (data) => {
        if (!data?.[0]?.[0]?.[0]) {
          return { translatedSegments: chunkTexts.map(() => ''), candidateText: '' };
        }

        const translatedText = data[0].map(segment => segment[0]).join('');
        const translatedSegments = translatedText.split(RELIABLE_DELIMITER);

        if (translatedSegments.length !== chunkTexts.length) {
          logger.warn("[Google] Translated segment count mismatch after splitting.", {
            expected: chunkTexts.length,
            got: translatedSegments.length
          });

          // Enhanced fallback: try to map back to original segments
          const fallbackSegments = this._mapTranslationToOriginalSegments(
            translatedText,
            chunkTexts,
            RELIABLE_DELIMITER
          );

          if (fallbackSegments.length === chunkTexts.length) {
            logger.info("[Google] Successfully mapped translation to original segments using fallback logic");
            return { translatedSegments: fallbackSegments, candidateText: '' };
          } else {
            logger.warn("[Google] Fallback mapping also failed, using single segment");
            return { translatedSegments: [translatedText], candidateText: '' };
          }
        }

        let candidateText = "";
        if (shouldIncludeDictionary && data[1]) {
          candidateText = data[1].map((dict) => {
            const pos = dict[0] || "";
            const terms = dict[1] || [];
            return `${pos}${pos !== "" ? ": " : ""}${terms.join(", ")}\n`;
          }).join("");
        }

        return {
          translatedSegments,
          candidateText: candidateText.trim(),
        };
      },
      context,
      abortController,
    });

    // Handle dictionary formatting for single segment
    if (chunkTexts.length === 1 && result?.candidateText) {
      const formattedDictionary = this._formatDictionaryAsMarkdown(result.candidateText);
      return [`${result.translatedSegments[0]}\n\n${formattedDictionary}`];
    }

    const finalResult = result?.translatedSegments || chunkTexts;

    // Add completion log for successful translation
    if (finalResult.length > 0) {
      logger.info(`[Google] Translation completed successfully`);
    }

    return finalResult;
  }

  /**
   * Enhanced mapping: attempt to reconstruct original segments from translated text
   * @param {string} translatedText - The complete translated text
   * @param {string[]} originalSegments - Original segments that were sent for translation
   * @param {string} delimiter - The delimiter that should separate segments
   * @returns {string[]} - Mapped segments matching original count
   */
  _mapTranslationToOriginalSegments(translatedText, originalSegments, delimiter) {
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
        logger.info(`[Google] Found working alternative delimiter: "${altDelim}"`);
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

        logger.info(`[Google] Successfully reconstructed segments with empty segment mapping`);
        return result;
      }
    }

    // Last resort: split by pattern matching original structure
    try {
      const result = this._splitByPattern(translatedText, originalSegments);
      if (result.length === originalSegments.length) {
        logger.info(`[Google] Successfully split by pattern matching`);
        return result;
      }
    } catch (error) {
      logger.warn(`[Google] Pattern splitting failed:`, error);
    }

    // If all else fails, return as single segment
    return [translatedText];
  }

  /**
   * Split translation text by matching patterns from original segments
   * @param {string} translatedText - Complete translated text
   * @param {string[]} originalSegments - Original segments for pattern reference
   * @returns {string[]} - Split segments
   */
  _splitByPattern(translatedText, originalSegments) {
    const result = [];
    let remainingText = translatedText;
    let delimiterPattern = new RegExp(`(\n\n---\n\n|\\n\\n---\\n|\\n---\\n\n|---|\\n\\n|\\n)`, 'g');

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

  _formatDictionaryAsMarkdown(candidateText) {
    if (!candidateText || candidateText.trim() === "") {
      return "";
    }
    const lines = candidateText.trim().split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) return "";

    let markdownOutput = "";
    lines.forEach((line) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const partOfSpeech = line.substring(0, colonIndex).trim();
        const terms = line.substring(colonIndex + 1).trim();
        if (partOfSpeech && terms) {
          markdownOutput += `**${partOfSpeech}:** ${terms}\n\n`;
        }
      } else if (line.trim()) {
        markdownOutput += `**${line.trim()}**\n\n`;
      }
    });
    return markdownOutput.trim();
  }
}