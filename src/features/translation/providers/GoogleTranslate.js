// src/core/providers/GoogleTranslateProvider.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import {
  getGoogleTranslateUrlAsync,
  getEnableDictionaryAsync
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode } from "@/shared/config/config.js";
import { TranslationSegmentMapper } from "@/utils/translation/TranslationSegmentMapper.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { LANGUAGE_NAME_TO_CODE_MAP } from "@/shared/config/languageConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleTranslate');

export class GoogleTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static description = "Free Google Translate service";
  static displayName = "Google Translate";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  static CHAR_LIMIT = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.GOOGLE;

  // BaseTranslateProvider capabilities
  static supportsStreaming = TRANSLATION_CONSTANTS.SUPPORTS_STREAMING.GOOGLE;
  static chunkingStrategy = TRANSLATION_CONSTANTS.CHUNKING_STRATEGIES.GOOGLE;
  static characterLimit = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.GOOGLE;
  static maxChunksPerBatch = TRANSLATION_CONSTANTS.MAX_CHUNKS_PER_BATCH.GOOGLE;

  constructor() {
    super("GoogleTranslate");
  }

  _getLangCode(lang) {
    if (!lang || typeof lang !== "string") return "auto";
    const lowerCaseLang = lang.toLowerCase();
    return LANGUAGE_NAME_TO_CODE_MAP[lowerCaseLang] || lowerCaseLang;
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
    logger.info(`[Google] Starting translation: ${chunkTexts.join(TRANSLATION_CONSTANTS.TEXT_DELIMITER).length} chars`);
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

    const textToTranslate = chunkTexts.join(TRANSLATION_CONSTANTS.TEXT_DELIMITER);
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
        const translatedSegments = translatedText.split(TRANSLATION_CONSTANTS.TEXT_DELIMITER);

        if (translatedSegments.length !== chunkTexts.length) {
          logger.debug("[Google] Translated segment count mismatch after splitting.", {
            expected: chunkTexts.length,
            got: translatedSegments.length
          });

          // Enhanced fallback: try to map back to original segments
          const fallbackSegments = TranslationSegmentMapper.mapTranslationToOriginalSegments(
            translatedText,
            chunkTexts,
            TRANSLATION_CONSTANTS.TEXT_DELIMITER,
            'GoogleTranslate'
          );

          if (fallbackSegments.length === chunkTexts.length) {
            logger.info("[Google] Successfully mapped translation to original segments using fallback logic");
            return { translatedSegments: fallbackSegments, candidateText: '' };
          } else {
            logger.debug("[Google] Fallback mapping also failed, using single segment");
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