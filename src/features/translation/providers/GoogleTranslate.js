// src/core/providers/GoogleTranslateProvider.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import {
  getGoogleTranslateUrlAsync,
  getEnableDictionaryAsync
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode } from "@/shared/config/config.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { LANGUAGE_NAME_TO_CODE_MAP } from "@/shared/config/languageConstants.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleTranslate');

export class GoogleTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static description = "Free Google Translate service";
  static displayName = "Google Translate (Classic)";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  static CHAR_LIMIT = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.GOOGLE;

  // BaseTranslateProvider capabilities
  static supportsStreaming = TRANSLATION_CONSTANTS.SUPPORTS_STREAMING.GOOGLE;
  static chunkingStrategy = TRANSLATION_CONSTANTS.CHUNKING_STRATEGIES.GOOGLE;
  static characterLimit = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.GOOGLE;
  static maxChunksPerBatch = TRANSLATION_CONSTANTS.MAX_CHUNKS_PER_BATCH.GOOGLE;

  constructor() {
    super(ProviderNames.GOOGLE_TRANSLATE);
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
    // Dictionary should only be enabled for single-segment translations and NOT in Field, Select Element or Page mode.
    const isExcludedMode = translateMode === TranslationMode.Field || 
                          translateMode === TranslationMode.Page || 
                          translateMode === TranslationMode.Select_Element;

    const shouldIncludeDictionary = isDictionaryEnabled && 
                                    chunkTexts.length === 1 && 
                                    !isExcludedMode;

    const apiUrl = await getGoogleTranslateUrlAsync();
    
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    const queryParams = new URLSearchParams({
      client: 'gtx',
      sl: sl,
      tl: tl,
      dt: 't',
    });

    if (shouldIncludeDictionary && chunkTexts.length === 1) {
      queryParams.append('dt', 'bd');
    }

    const textToTranslate = chunkTexts.join(TRANSLATION_CONSTANTS.TEXT_DELIMITER);
    const requestBody = `q=${encodeURIComponent(textToTranslate)}`;

    const result = await this._executeRequest({
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
          return { translatedText: "", candidateText: "" };
        }

        const translatedText = data[0].map(segment => segment[0]).join('');
        
        let candidateText = "";
        if (shouldIncludeDictionary && data[1]) {
          candidateText = data[1].map((dict) => {
            const pos = dict[0] || "";
            const terms = dict[1] || [];
            return `${pos}${pos !== "" ? ": " : ""}${terms.join(", ")}\n`;
          }).join("");
        }

        return {
          translatedText,
          candidateText: candidateText.trim(),
        };
      },
      context,
      abortController,
    });

    // Use robust split logic from base class OUTSIDE extractResponse
    const translatedSegments = await this._robustSplit(result?.translatedText || "", chunkTexts);

    // Handle dictionary formatting for single segment
    if (chunkTexts.length === 1 && result?.candidateText) {
      const formattedDictionary = this._formatDictionaryAsMarkdown(result.candidateText);
      return [`${translatedSegments[0]}\n\n${formattedDictionary}`];
    }

    const finalResult = translatedSegments || chunkTexts;

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