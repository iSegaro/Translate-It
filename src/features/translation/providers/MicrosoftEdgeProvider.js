import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { TraditionalTextProcessor } from "./utils/TraditionalTextProcessor.js";
import { getProviderLanguageCode } from "@/shared/config/languageConstants.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { 
  getMicrosoftEdgeAuthUrlAsync,
  getMicrosoftEdgeTranslateUrlAsync
} from "@/shared/config/config.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'MicrosoftEdge');

/**
 * Microsoft Edge Translation Provider
 * Uses the internal Edge translation API endpoints
 * 
 * Source Reference:
 * https://github.com/translate-tools/core/blob/master/src/translators/MicrosoftTranslator/index.ts
 */
export class MicrosoftEdgeProvider extends BaseTranslateProvider {
  static type = "translate";
  static displayName = "Microsoft Edge";
  static reliableJsonMode = true;
  
  static accessToken = null;
  static tokenExpiry = 0;

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
    
    // Normalize to base code (e.g., 'en-US' -> 'en') unless it's a special Microsoft code
    const baseCode = typeof lang === 'string' ? lang.split('-')[0].toLowerCase() : lang;
    
    const mappedCode = getProviderLanguageCode(lang, 'BING') || 
                       getProviderLanguageCode(baseCode, 'BING');
                       
    return mappedCode || baseCode;
  }

  /**
   * Fetch Microsoft Edge auth token with caching and expiry management
   * @param {AbortController} abortController - Controller for cancellation
   * @returns {Promise<string>} - Auth token
   */
  async _getAuthToken(abortController) {
    // Return cached token if still valid (with 30s buffer)
    if (MicrosoftEdgeProvider.accessToken && MicrosoftEdgeProvider.tokenExpiry > Date.now() + 30000) {
      return MicrosoftEdgeProvider.accessToken;
    }

    logger.debug('[Edge] Fetching new auth token...');
    
    const authUrl = await getMicrosoftEdgeAuthUrlAsync();

    return this._executeRequest({
      url: authUrl,
      fetchOptions: {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': '*/*',
          'Accept-Language': 'zh-TW,zh;q=0.9,ja;q=0.8,zh-CN;q=0.7,en-US;q=0.6,en;q=0.5',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Priority': 'u=1, i',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-Storage-Access': 'active'
        }
      },
      extractResponse: async (response) => {
        const token = await response.text();
        if (!token) {
          const err = new Error("Received empty token from Edge auth");
          err.type = ErrorTypes.API_KEY_MISSING;
          throw err;
        }

        // Decode JWT to get expiry
        MicrosoftEdgeProvider.accessToken = token;
        
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          MicrosoftEdgeProvider.tokenExpiry = payload.exp * 1000;
        } catch {
          // Fallback to 30 second lifetime as seen in anylang
          MicrosoftEdgeProvider.tokenExpiry = Date.now() + (30 * 1000);
        }

        logger.debug('[Edge] Auth token obtained successfully');
        return token;
      },
      context: 'edge-auth',
      abortController,
      charCount: 0 // Explicitly set to 0 to avoid using carrier charCount
    });
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
    const token = await this._getAuthToken(abortController);
    
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang) || 'fa';

    const translateUrl = await getMicrosoftEdgeTranslateUrlAsync();
    
    /**
     * Internal helper to execute the request with a specific source language
     * @param {string|null} currentSource - Language code to use for 'from' param
     */
    const performRequest = async (currentSource) => {
      const url = new URL(translateUrl);
      url.searchParams.set("api-version", "3.0");
      
      // CRITICAL: Omit 'from' parameter completely for auto-detection or if rejected.
      if (currentSource && currentSource !== "auto-detect") {
        url.searchParams.set("from", currentSource);
      }
      
      url.searchParams.set("to", tl);
      url.searchParams.set("includeSentenceLength", "true");

      // Microsoft Edge expects array of objects: [{ "Text": "..." }, ...]
      const body = chunkTexts.map(text => ({ Text: text }));

      return await this._executeRequest({
        url: url.toString(),
        fetchOptions: {
          method: "POST",
          mode: 'cors',
          credentials: 'include',
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
            "Accept": "*/*",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Priority": "u=1, i"
          },
          body: JSON.stringify(body)
        },
        extractResponse: (data) => {
          if (!data?.[0]?.translations) {
            logger.error('[Edge] Unexpected API response format:', data);
            return chunkTexts.map(() => "");
          }
          
          // Capture detected language from metadata if available
          this._setDetectedLanguage(data[0].detectedLanguage?.language);
          
          // Match anylang logic: Join multiple translation segments if present
          return data.map(item => {
            if (!item.translations || !Array.isArray(item.translations)) return "";
            return item.translations.map(t => t.text).join(' ');
          });
        },
        context: 'edge-translate-chunk',
        abortController,
        charCount: this._calculateTraditionalCharCount(chunkTexts),
        sessionId: options.sessionId,
        originalCharCount: options.originalCharCount || TraditionalTextProcessor.calculateTraditionalCharCount(chunkTexts)
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
