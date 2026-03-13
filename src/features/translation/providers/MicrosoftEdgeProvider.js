import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
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
    
    return this._executeRequest({
      url: MicrosoftEdgeProvider.authUrl,
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
      abortController
    });
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
    if (sl) url.searchParams.set("from", sl);
    url.searchParams.set("to", tl);
    url.searchParams.set("includeSentenceLength", "true");

    // Microsoft Edge expects array of objects: [{ "Text": "..." }, ...]
    const body = chunkTexts.map(text => ({ Text: text }));

    return this._executeRequest({
      url: url.toString(),
      fetchOptions: {
        method: "POST",
        mode: 'cors',
        credentials: 'include',
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Accept-Language": "zh-TW,zh;q=0.9,ja;q=0.8,zh-CN;q=0.7,en-US;q=0.6,en;q=0.5",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
          "Priority": "u=1, i",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-Storage-Access": "active"
        },
        body: JSON.stringify(body)
      },
      extractResponse: (data) => {
        if (!Array.isArray(data)) {
          logger.error('[Edge] Unexpected API response format:', data);
          return chunkTexts.map(() => "");
        }
        
        // Match anylang logic: Join multiple translation segments if present
        return data.map(item => {
          if (!item.translations || !Array.isArray(item.translations)) return "";
          return item.translations.map(t => t.text).join(' ');
        });
      },
      context: 'edge-translate-chunk',
      abortController
    });
  }
}
