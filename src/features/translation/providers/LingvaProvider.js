import { BaseTranslateProvider } from "./BaseTranslateProvider.js";
import { ProviderNames } from "./ProviderConstants.js";
import { TraditionalTextProcessor } from "./utils/TraditionalTextProcessor.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { getLingvaApiUrlAsync } from "@/shared/config/config.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { getProviderLanguageCode } from "@/shared/config/languageConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'LingvaProvider');

/**
 * Lingva Translate Provider
 * A free and open-source alternative front-end for Google Translate.
 * Following the project's standard pattern for traditional providers.
 */
export class LingvaProvider extends BaseTranslateProvider {
  static type = "translate";
  static displayName = "Lingva";
  static reliableJsonMode = true;
  
  // Standard delimiter used by traditional providers in this project
  static TEXT_DELIMITER = '\n\n---\n\n';

  constructor() {
    super(ProviderNames.LINGVA);
  }

  async _getApiPath() {
    return await getLingvaApiUrlAsync();
  }

  _getLangCode(lang) {
    if (!lang || lang === AUTO_DETECT_VALUE) return "auto";
    return getProviderLanguageCode(lang, 'LINGVA');
  }

  /**
   * Standard _translateChunk implementation.
   * Receives a chunk of texts, joins them, and executes a single request.
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {number} retryAttempt - Current retry attempt
   * @param {number} segmentCount - Number of segments in this chunk
   * @param {number} chunkIndex - Current chunk index
   * @param {number} totalChunks - Total number of chunks
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt, segmentCount, chunkIndex, totalChunks) {
    const apiPath = await this._getApiPath();
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    logger.debug(`[Lingva] Translating chunk ${chunkIndex + 1}/${totalChunks} (${segmentCount} segments, attempt ${retryAttempt + 1})`);

    // Filter and join texts using the standard delimiter
    // Extract text from objects (Select Element) to prevent crashes
    const validTexts = chunkTexts.map(t => {
      const text = typeof t === 'object' ? (t.t || t.text || "") : (t || "");
      return String(text).replace(/\//g, ' ');
    });
    const joinedText = validTexts.join(LingvaProvider.TEXT_DELIMITER);

    // If joined text is too long for a GET request (Lingva limit),
    // we take as many as we can from the start. 
    // The central engine will handle the rest in subsequent chunks.
    let textToTranslate = joinedText;
    if (textToTranslate.length > 1200) {
      logger.debug(`[Lingva] Chunk too long (${textToTranslate.length}), limiting to first segment for safety.`);
      textToTranslate = validTexts[0];
    }

    const url = `${apiPath}/api/v1/${sl}/${tl}/${encodeURIComponent(textToTranslate)}`;
      
    const originalCharCount = TraditionalTextProcessor.calculateTraditionalCharCount(chunkTexts);

    const result = await this._executeRequest({
      url,
      fetchOptions: {
        method: "GET",
        mode: 'cors',
        credentials: 'omit',
        headers: { "Accept": "application/json" }
      },
      extractResponse: (data) => data?.translation,
      context: 'lingva-standard-chunk',
      abortController,
      charCount: textToTranslate.length, // Explicitly pass the actual count sent to the network
      originalCharCount
    });

    if (!result) return chunkTexts.join(TRANSLATION_CONSTANTS.TEXT_DELIMITER);

    // If we only translated the first one because of length
    if (textToTranslate === validTexts[0] && chunkTexts.length > 1) {
      // Return partial array, Coordinator handles this correctly
      return [result, ...chunkTexts.slice(1)];
    }

    // Return raw translated text. Coordinator will handle robust splitting for multiple segments.
    if (result) {
      logger.info(`[Lingva] Translation completed successfully`);
    }

    return result;
  }
}
