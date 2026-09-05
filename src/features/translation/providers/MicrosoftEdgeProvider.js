import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { getTextInfo } from "./utils/TraditionalTextProcessor.js";
import { getProviderLanguageCode } from "@/shared/config/languageConstants.js";
import { AUTO_DETECT_VALUE } from "@/shared/constants/core.js";
import { CONFIG } from "@/shared/config/config.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'MicrosoftEdge');

/**
 * Microsoft Edge Translation Provider
 * Uses the current unauthenticated Edge translation API endpoint
 * 
 * Source Reference:
 * https://github.com/translate-tools/core/blob/master/src/translators/MicrosoftTranslator/index.ts
 */
export class MicrosoftEdgeProvider extends BaseTranslateProvider {
  static type = "translate";
  static displayName = "Microsoft Edge";
  static reliableJsonMode = true;
  
  constructor() {
    super(ProviderNames.MICROSOFT_EDGE);
  }

  /**
   * Normalize language code for Microsoft's API
   * @param {string} lang - Language code
   * @returns {string|null} - Normalized code or null for auto-detection
   */
  _getLangCode(lang) {
    if (!lang || lang === AUTO_DETECT_VALUE) return null; // Signal auto-detection
    
    // Normalize to lowercase for mapping lookup
    const normalized = typeof lang === 'string' ? lang.toLowerCase() : lang;
    
    // Try to get specific Microsoft mapping (e.g., 'zh-cn' -> 'zh-Hans')
    const mappedCode = getProviderLanguageCode(normalized, 'BING');
    if (mappedCode) return mappedCode;

    // If not in map, return original (Bing/Edge often support regional codes like 'en-AU' directly)
    return normalized;
  }

  /**
   * Implement translation for a single chunk
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {number} retryAttempt - Current retry attempt
   * @param {number} segmentCount - Number of segments in this chunk
   * @param {number} chunkIndex - Current chunk index
   * @param {number} totalChunks - Total number of chunks
   * @param {Object} options - Additional options (sessionId, originalCharCount)
   * @returns {Promise<string[]>} - Translated texts for this chunk
  */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt, segmentCount, chunkIndex, totalChunks, options = {}) {
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang) || 'fa';

    const translateUrl = CONFIG.MICROSOFT_EDGE_TRANSLATE_URL;
    
    /**
     * Internal helper to execute the request with a specific source language
     * @param {string|null} currentSource - Language code to use for 'from' param
     */
    const performRequest = async (currentSource) => {
      const url = new URL(translateUrl);
      url.searchParams.set("isEnterpriseClient", "false");
      
      // CRITICAL: Omit 'from' parameter completely for auto-detection or if rejected.
      if (currentSource && currentSource !== "auto-detect") {
        url.searchParams.set("from", currentSource);
      }
      
      url.searchParams.set("to", tl);

      // Microsoft Edge expects an array of text strings: ["...", "..."]
      // We use getTextInfo to extract text from objects (Subtitle cues, Select Element)
      const body = chunkTexts.map(item => getTextInfo(item).text);

      return await this._executeRequest({
        url: url.toString(),
        fetchOptions: {
          method: "POST",
          mode: 'cors',
          credentials: 'omit',
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        },
        extractResponse: (data, statusCode) => {
          let parsed = data;

          if (typeof data === 'string') {
            try {
              parsed = JSON.parse(data);
            } catch {
              const error = new Error('Provider response contains invalid JSON');
              error.type = ErrorTypes.JSON_PARSING_ERROR;
              error.statusCode = statusCode;
              error.context = 'edge-translate-chunk';
              error.providerName = this.providerName;
              throw error;
            }
          }

          // No silent empty-fill: a malformed response must fail loudly so the
          // caller never mistakes empty strings for a successful translation.
          if (!parsed?.[0]?.translations) {
            logger.error('[Edge] Unexpected API response format');
            const err = new Error(ErrorTypes.API_RESPONSE_INVALID);
            err.type = ErrorTypes.API_RESPONSE_INVALID;
            throw err;
          }
          
          // Match anylang logic: Join multiple translation segments if present
          const translatedTexts = parsed.map(item => {
            if (!item.translations || !Array.isArray(item.translations)) {
              const err = new Error(ErrorTypes.API_RESPONSE_INVALID);
              err.type = ErrorTypes.API_RESPONSE_INVALID;
              throw err;
            }
            // No silent empty-fill: an empty, whitespace-only, or non-string
            // joined result must fail loudly so the caller never mistakes it
            // for a successful translation. Identity output (text === source)
            // is legitimate and remains accepted.
            const joinedText = item.translations.map(t => t.text).join(' ');
            if (typeof joinedText !== 'string' || !joinedText.trim()) {
              const err = new Error(ErrorTypes.API_RESPONSE_INVALID);
              err.type = ErrorTypes.API_RESPONSE_INVALID;
              throw err;
            }
            return joinedText;
          });

          this._setExecutionDetectedLanguage(options, parsed[0].detectedLanguage?.language);
          return translatedTexts;
        },
        context: 'edge-translate-chunk',
        abortController,
        charCount: chunkTexts.reduce((s, t) => s + getTextInfo(t).length, 0),
        sessionId: options.sessionId,
        originalCharCount: options.originalCharCount || chunkTexts.reduce((s, t) => s + getTextInfo(t).length, 0),
        callPurpose: options.callPurpose
      });
    };

    try {
      return await performRequest(sl);
    } catch (error) {
      // IF EDGE REJECTS THE SOURCE LANGUAGE (HTTP 400), RETRY ONCE WITHOUT THE 'FROM' PARAMETER
      // This provides extreme stability when the detected language code is not accepted by the API.
      if (error.message?.includes('The source language is not valid') && sl) {
        logger.warn(`[Edge] Language '${sl}' rejected. Retrying with auto-detection...`);
        return await performRequest(null);
      }
      throw error;
    }
  }
}

export default MicrosoftEdgeProvider;
