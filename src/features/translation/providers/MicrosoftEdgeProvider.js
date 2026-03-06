import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { getProviderLanguageCode } from "@/shared/config/languageConstants.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'MicrosoftEdge');

export class MicrosoftEdgeProvider extends BaseTranslateProvider {
  static type = "translate";
  static displayName = "Microsoft Edge";
  static reliableJsonMode = true;
  static authUrl = "https://edge.microsoft.com/translate/auth";
  static translateUrl = "https://api-edge.cognitive.microsofttranslator.com/translate";
  
  static accessToken = null;
  static tokenExpiry = 0;

  constructor() {
    super(ProviderNames.MICROSOFT_EDGE);
  }

  _getLangCode(lang) {
    if (lang === AUTO_DETECT_VALUE) return "";
    return getProviderLanguageCode(lang, 'BING') || lang;
  }

  /**
   * Fetch Microsoft Edge auth token
   */
  async _getAuthToken(abortController) {
    // Return cached token if still valid (with 30s buffer)
    if (MicrosoftEdgeProvider.accessToken && MicrosoftEdgeProvider.tokenExpiry > Date.now() + 30000) {
      return MicrosoftEdgeProvider.accessToken;
    }

    logger.debug('[Edge] Fetching new auth token...');
    
    try {
      const response = await fetch(MicrosoftEdgeProvider.authUrl, {
        method: 'GET',
        signal: abortController?.signal,
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': '*/*',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`Auth failed with status ${response.status}`);
      }

      const token = await response.text();
      if (!token) throw new Error("Received empty token from Edge auth");

      // Decode JWT to get expiry
      MicrosoftEdgeProvider.accessToken = token;
      
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        MicrosoftEdgeProvider.tokenExpiry = payload.exp * 1000;
      } catch (e) {
        MicrosoftEdgeProvider.tokenExpiry = Date.now() + (10 * 60 * 1000);
      }

      logger.debug('[Edge] Auth token obtained successfully');
      return token;
    } catch (error) {
      logger.error('[Edge] Failed to obtain auth token:', error);
      const authError = new Error(`Edge Auth failed: ${error.message}`);
      authError.type = ErrorTypes.API_KEY_INVALID;
      throw authError;
    }
  }

  /**
   * Implement translation for a single chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController) {
    const token = await this._getAuthToken(abortController);
    
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    const url = new URL(MicrosoftEdgeProvider.translateUrl);
    url.searchParams.set("api-version", "3.0");
    url.searchParams.set("from", sl || "");
    url.searchParams.set("to", tl);
    url.searchParams.set("includeSentenceLength", "true");

    // Microsoft Edge expects array of objects: [{ "Text": "..." }, ...]
    const body = chunkTexts.map(text => ({ Text: text }));

    return this._executeApiCall({
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
          "Pragma": "no-cache"
        },
        body: JSON.stringify(body)
      },
      extractResponse: (data) => {
        if (!Array.isArray(data)) {
          logger.error('[Edge] Unexpected API response format:', data);
          return chunkTexts.map(() => "");
        }
        return data.map(item => item.translations?.[0]?.text || "");
      },
      context: 'edge-translate-chunk',
      abortController
    });
  }
}
