import { BaseTranslateProvider } from "./BaseTranslateProvider.js";
import { ProviderNames } from "./ProviderConstants.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { getLingvaApiUrlAsync } from "@/shared/config/config.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'LingvaProvider');

/**
 * Lingva Translate Provider
 * A free and open-source alternative front-end for Google Translate.
 * Homepage: https://github.com/thedaviddelta/lingva-translate
 */
export class LingvaProvider extends BaseTranslateProvider {
  static type = "translate";
  static displayName = "Lingva";
  static reliableJsonMode = true;
  
  constructor() {
    super(ProviderNames.LINGVA);
  }

  /**
   * Get the current API path
   * This is where we can later inject a custom instance from settings
   */
  async _getApiPath() {
    return await getLingvaApiUrlAsync();
  }

  _getLangCode(lang) {
    if (lang === AUTO_DETECT_VALUE) return "auto";
    // Lingva mostly uses ISO-639-1 codes, which match our internal codes
    return lang;
  }

  /**
   * Implement translation for a single chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController) {
    const apiPath = await this._getApiPath();
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    const results = [];
    
    for (const text of chunkTexts) {
      if (abortController?.signal?.aborted) break;

      try {
        // Use GET method as per original script for better compatibility with public instances
        // URL encode the text to handle special characters
        const url = `${apiPath}/api/v1/${sl}/${tl}/${encodeURIComponent(text)}`;
        
        const result = await this._executeApiCall({
          url,
          fetchOptions: {
            method: "GET",
            mode: 'cors',
            credentials: 'omit',
            headers: {
              "Accept": "*/*",
              "Accept-Language": "en-US,en;q=0.5",
              "Sec-Fetch-Dest": "empty",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Site": "same-origin"
            }
          },
          extractResponse: (data) => {
            if (data && data.translation) {
              return data.translation;
            }
            throw new Error("Invalid response from Lingva API");
          },
          context: 'lingva-translate-segment',
          abortController
        });
        
        results.push(result || "");
      } catch (error) {
        logger.error(`[Lingva] Segment failed:`, error);
        results.push(""); // Fallback
      }
    }

    return results;
  }
}
