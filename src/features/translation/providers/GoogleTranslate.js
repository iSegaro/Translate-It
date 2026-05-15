// src/core/providers/GoogleTranslateProvider.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { 
  getGoogleTranslateUrlAsync,
  getDictionaryShowPronunciationAsync,
  getDictionaryShowPosAsync,
  getDictionaryShowDefinitionsAsync,
  getDictionaryShowExamplesAsync
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TranslationMode } from "@/shared/config/config.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { getProviderLanguageCode } from "@/shared/config/languageConstants.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { TraditionalTextProcessor } from "./utils/TraditionalTextProcessor.js";
import { AUTO_DETECT_VALUE } from "@/shared/constants/core.js";
import { getTranslationString } from "@/utils/i18n/i18n.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleTranslate');

export class GoogleTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static description = "Free Google Translate service";
  static displayName = "Google Translate (Classic)";
  static reliableJsonMode = false;
  static supportsDictionary = true;

  // BaseTranslateProvider capabilities (Default values)
  // NOTE: Character limits and chunk sizes are now dynamically managed 
  // by ProviderConfigurations.js based on the active Optimization Level.
  static supportsStreaming = TRANSLATION_CONSTANTS.SUPPORTS_STREAMING.GOOGLE;
  static chunkingStrategy = TRANSLATION_CONSTANTS.CHUNKING_STRATEGIES.GOOGLE;
  static characterLimit = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.GOOGLE;
  static maxChunksPerBatch = TRANSLATION_CONSTANTS.MAX_CHUNKS_PER_BATCH.GOOGLE;

  constructor() {
    super(ProviderNames.GOOGLE_TRANSLATE);
  }

  _getLangCode(lang) {
    if (!lang || lang === AUTO_DETECT_VALUE) return "auto";
    return getProviderLanguageCode(lang, 'GOOGLE');
  }

  /**
   * Translate a single chunk of texts using Google's API
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {number} retryAttempt - Current retry attempt
   * @param {number} segmentCount - Total number of segments in this chunk
   * @param {number} chunkIndex - Current chunk index
   * @param {number} totalChunks - Total number of chunks
   * @param {Object} options - Additional options (sessionId, originalCharCount)
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt, segmentCount, chunkIndex, totalChunks, options = {}) {
    const context = `${this.providerName.toLowerCase()}-translate-chunk`;
        // Dictionary mode is explicitly requested by the translation engine
    const shouldIncludeDictionary = translateMode === TranslationMode.Dictionary_Translation;

    const apiUrl = await getGoogleTranslateUrlAsync();
    
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    const queryParams = new URLSearchParams();
    const params = {
      client: 'gtx',
      sl: sl,
      tl: tl,
      hl: tl,
      dt: ['at', 'bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 't'],
      ie: 'UTF-8',
      oe: 'UTF-8',
      otf: '1',
      ssel: '0',
      tsel: '0',
      kc: '7'
    };

    if (shouldIncludeDictionary) {
      params.dj = '1';
    }

    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => queryParams.append(key, v));
      } else {
        queryParams.set(key, value);
      }
    });

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
        if (!data || (!data[0] && !data.sentences)) {
          logger.warn('[Google] Empty or invalid response data');
          return { translatedText: "", candidateText: "" };
        }

        // Capture detected source language from metadata
        this._setDetectedLanguage(data.src || data[2]);

        // For single segments, handle JSON and legacy formats
        if (chunkTexts.length === 1) {
          if (data.sentences) {
            const translatedText = data.sentences
              .filter(s => s.trans)
              .map(s => s.trans)
              .join('');
            
            return { translatedText, candidateText: shouldIncludeDictionary ? data : "" };
          }

          if (Array.isArray(data[0])) {
            const translatedText = data[0].map(segment => segment[0] || "").join('');
            
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
          }
        }

        // For multiple segments
        if (Array.isArray(data[0])) {
          const segments = data[0];
          const results = new Array(chunkTexts.length).fill("");
          let currentIdx = 0;
          let inDelimiterZone = false;

          for (const segment of segments) {
            const trans = segment[0] || "";
            const orig = segment[1] || "";
            
            const isDelimiterPart = /^[[\]\s\n\r.——–…ـ·・-]+$/.test(orig) && 
                                    (orig.includes('-') || orig.includes('.') || orig.includes('[') || orig.includes(']') || 
                                     orig.includes('—') || orig.includes('–') || orig.includes('…') || orig.includes('ـ') || 
                                     orig.includes('·') || orig.includes('・'));
            
            if (isDelimiterPart) {
              if (!inDelimiterZone) {
                currentIdx++;
                inDelimiterZone = true;
              }
              continue;
            }

            inDelimiterZone = false;
            if (currentIdx < results.length) {
              const cleanTrans = TraditionalTextProcessor.scrubBidiArtifacts(trans);
              results[currentIdx] += cleanTrans;
            }
          }

          const hasEmpty = results.some((r, i) => !r.trim() && chunkTexts[i] && chunkTexts[i].trim());
          if (hasEmpty) {
            const joinedResult = data[0].map(segment => segment[0]).join('');
            return { translatedText: joinedResult, candidateText: "" };
          }

          return { translatedText: results, candidateText: "" };
        }

        return { translatedText: "", candidateText: "" };
      },
      context,
      abortController,
      charCount: this._calculateTraditionalCharCount(chunkTexts),
      sessionId: options.sessionId,
      originalCharCount: options.originalCharCount || TraditionalTextProcessor.calculateTraditionalCharCount(chunkTexts)
    });

    // Handle dictionary formatting for single segment
    if (chunkTexts.length === 1 && result?.candidateText) {
      const formattedDictionary = await this._formatDictionaryAsMarkdown(result.candidateText);
      const translatedWithDict = `${result.translatedText}\n\n${formattedDictionary}`;
      
      // Add completion log for dictionary case
      logger.info(`[Google] Translation with dictionary completed successfully`);
      return translatedWithDict;
    }

    // Return translated text. Coordinator will handle robust splitting for multiple segments.
    const finalResult = result?.translatedText || chunkTexts.join(TRANSLATION_CONSTANTS.TEXT_DELIMITER);

    // Add completion log for successful translation
    if (finalResult) {
      logger.info(`[Google] Translation completed successfully`);
    }

    return finalResult;
  }

  
  async _formatDictionaryAsMarkdown(candidateData) {
    if (!candidateData) return "";

    // Load user display preferences
    const [showPronunciation, showPos, showDefinitions, showExamples] = await Promise.all([
      getDictionaryShowPronunciationAsync(),
      getDictionaryShowPosAsync(),
      getDictionaryShowDefinitionsAsync(),
      getDictionaryShowExamplesAsync()
    ]);

    // Load translated labels
    const labelPronunciation = await getTranslationString('dict_pronunciation') || 'Pronunciation';
    const labelDefinitions = await getTranslationString('dict_definitions') || 'Definitions';
    const labelExamples = await getTranslationString('dict_examples') || 'Examples';

    // Support legacy string format (from array response)
    if (typeof candidateData === "string") {
      const lines = candidateData.trim().split("\n").filter((line) => line.trim() !== "");
      if (lines.length === 0) return "";

      let markdownOutput = "";
      lines.forEach((line) => {
        const colonIndex = line.indexOf(":");
        if (colonIndex > 0) {
          const partOfSpeech = line.substring(0, colonIndex).trim();
          const terms = line.substring(colonIndex + 1).trim();
          
          // Check if POS should be shown
          if (showPos && partOfSpeech && terms) {
            markdownOutput += `${partOfSpeech}: ${terms}\n`;
          }
        } else if (line.trim()) {
          markdownOutput += `${line.trim()}\n`;
        }
      });
      return markdownOutput.trim();
    }

    // Support new JSON format (dj=1)
    const data = candidateData;
    let markdownOutput = "";

    // 1. Dictionary Meanings (Parts of Speech & Synonyms)
    if (showPos && data.dict && Array.isArray(data.dict)) {
      data.dict.forEach((d) => {
        const pos = d.pos || "";
        const terms = d.terms || [];
        if (pos && terms.length > 0) {
          markdownOutput += `${pos}: ${terms.join(", ")}\n`;
        }
      });
    }

    // 2. Pronunciation (Moved to before Definitions)
    if (showPronunciation) {
      const pronunciation = data.sentences?.find(s => s.src_translit)?.src_translit;
      if (pronunciation) {
        markdownOutput += `${labelPronunciation}: /${pronunciation}/\n`;
      }
    }

    // 3. Definitions
    if (showDefinitions && data.definitions && Array.isArray(data.definitions)) {
      if (markdownOutput) markdownOutput += "\n";
      markdownOutput += `${labelDefinitions}:\n`;
      data.definitions.forEach((d) => {
        const pos = d.pos || "";
        const entries = d.entry || [];
        entries.forEach((entry) => {
          if (entry.gloss) {
            markdownOutput += `- ${pos ? `(${pos}) ` : ""}${entry.gloss}\n`;
          }
        });
      });
    }

    // 4. Examples (with HTML stripping for safety)
    if (showExamples && data.examples?.example && Array.isArray(data.examples.example)) {
      if (markdownOutput) markdownOutput += "\n";
      markdownOutput += `${labelExamples}:\n`;
      data.examples.example.slice(0, 5).forEach((ex) => {
        if (ex.text) {
          const cleanText = ex.text.replace(/<[^>]*>?/gm, "");
          markdownOutput += `- ${cleanText}\n`;
        }
      });
    }

    return markdownOutput.trim();
  }
}