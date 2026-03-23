import { BaseTranslateProvider } from "./BaseTranslateProvider.js";
import { ProviderNames } from "./ProviderConstants.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { getLingvaApiUrlAsync } from "@/shared/config/config.js";

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
    if (lang === AUTO_DETECT_VALUE) return "auto";
    return lang;
  }

  /**
   * Standard _translateChunk implementation.
   * Receives a chunk of texts, joins them, and executes a single request.
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController) {
    const apiPath = await this._getApiPath();
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    // Filter and join texts using the standard delimiter
    const validTexts = chunkTexts.map(t => (t || "").replace(/\//g, ' '));
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
      abortController
    });

    if (!result) return chunkTexts;

    // If we only translated the first one because of length
    if (textToTranslate === validTexts[0] && chunkTexts.length > 1) {
      return [result, ...chunkTexts.slice(1)];
    }

    // Standard splitting logic
    return await this._robustSplit(result, chunkTexts);
  }
}
