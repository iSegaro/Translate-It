// src/providers/implementations/BingTranslateProvider.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'BingTranslate');
const TEXT_DELIMITER = "\n\n---\n\n";

const bingLangCode = {
  auto: "auto-detect", af: "af", am: "am", ar: "ar", az: "az", bg: "bg", bs: "bs", ca: "ca", cs: "cs", cy: "cy", da: "da", de: "de", el: "el", en: "en", es: "es", et: "et", fa: "fa", fi: "fi", fr: "fr", ga: "ga", gu: "gu", hi: "hi", hmn: "mww", hr: "hr", ht: "ht", hu: "hu", hy: "hy", id: "id", is: "is", it: "it", ja: "ja", kk: "kk", km: "km", kn: "kn", ko: "ko", ku: "ku", lo: "lo", lt: "lt", lv: "lv", mg: "mg", mi: "mi", ml: "ml", mr: "mr", ms: "ms", mt: "mt", my: "my", ne: "ne", nl: "nl", no: "nb", pa: "pa", pl: "pl", ps: "ps", ro: "ro", ru: "ru", sk: "sk", sl: "sl", sm: "sm", sq: "sq", sr: "sr-Cyrl", sv: "sv", sw: "sw", ta: "ta", te: "te", th: "th", tr: "tr", uk: "uk", ur: "ur", vi: "vi", iw: "he", tl: "fil", pt: "pt", "zh-CN": "zh-Hans", "zh-TW": "zh-Hant",
};

const langNameToCodeMap = {
  afrikaans: "af", albanian: "sq", arabic: "ar", azerbaijani: "az", belarusian: "be", bengali: "bn", bulgarian: "bg", catalan: "ca", cebuano: "ceb", "chinese (simplified)": "zh-CN", chinese: "zh-CN", croatian: "hr", czech: "cs", danish: "da", dutch: "nl", english: "en", estonian: "et", farsi: "fa", persian: "fa", filipino: "fil", finnish: "fi", french: "fr", german: "de", greek: "el", hebrew: "he", hindi: "hi", hungarian: "hu", indonesian: "id", italian: "it", japanese: "ja", kannada: "kn", kazakh: "kk", korean: "ko", latvian: "lv", lithuanian: "lt", malay: "ms", malayalam: "ml", marathi: "mr", nepali: "ne", norwegian: "no", odia: "or", pashto: "ps", polish: "pl", portuguese: "pt", punjabi: "pa", romanian: "ro", russian: "ru", serbian: "sr", sinhala: "si", slovak: "sk", slovenian: "sl", spanish: "es", swahili: "sw", swedish: "sv", tagalog: "tl", tamil: "ta", telugu: "te", thai: "th", turkish: "tr", ukrainian: "uk", urdu: "ur", uzbek: "uz", vietnamese: "vi",
};

export class BingTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static description = "Bing Translator";
  static displayName = "Microsoft Bing";
  static reliableJsonMode = false;
  static supportsDictionary = false;
  static bingBaseUrl = "https://www.bing.com/ttranslatev3";
  static bingTokenUrl = "https://www.bing.com/translator";
  static bingAccessToken = null;
  static CHAR_LIMIT = 1000;
  static CHUNK_SIZE = 25; // Bing's segment limit per request
  
  // BaseTranslateProvider capabilities
  static supportsStreaming = true;
  static chunkingStrategy = 'character_limit';
  static characterLimit = 1000; // Bing's character limit
  static maxChunksPerBatch = 25; // Bing's chunk size

  constructor() {
    super("BingTranslate");
  }

  _getLangCode(lang) {
    const normalized = LanguageSwappingService._normalizeLangValue(lang);
    if (normalized === AUTO_DETECT_VALUE) return "auto-detect";
    if (bingLangCode[normalized]) return bingLangCode[normalized];
    const lower = normalized.toLowerCase();
    if (langNameToCodeMap[lower] && bingLangCode[langNameToCodeMap[lower]]) {
      return bingLangCode[langNameToCodeMap[lower]];
    }
    return normalized;
  }

  /**
   * Translate a single chunk of texts using Bing's API
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController) {
    const context = `${this.providerName.toLowerCase()}-translate-chunk`;
    
    try {
      // Get Bing access token
      const tokenData = await this._getBingAccessToken(abortController);
      
      if (abortController?.signal.aborted) {
        throw new Error('Translation cancelled by user');
      }

      const textToTranslate = chunkTexts.join(TEXT_DELIMITER);
      const formData = new URLSearchParams({
        text: textToTranslate, 
        fromLang: sourceLang, 
        to: targetLang, 
        token: tokenData.token, 
        key: tokenData.key,
      });

      const url = new URL(BingTranslateProvider.bingBaseUrl);
      url.searchParams.set("IG", tokenData.IG);
      url.searchParams.set("IID", tokenData.IID?.length ? `${tokenData.IID}.${BingTranslateProvider.bingAccessToken.count++}` : "");
      url.searchParams.set("isVertical", "1");

      const result = await this._executeApiCall({
        url: url.toString(),
        fetchOptions: {
          method: "POST",
          headers: { 
            "Content-Type": "application/x-www-form-urlencoded", 
            "User-Agent": navigator.userAgent 
          },
          body: formData.toString(), // Convert URLSearchParams to string
        },
        extractResponse: (data) => {
          if (data?.statusCode === 400) {
            const err = new Error('Bing API returned status 400');
            err.name = 'BingApiError';
            throw err;
          }
          
          const targetText = data?.[0]?.translations?.[0]?.text;
          if (typeof targetText !== 'string') {
            return chunkTexts.map(() => "");
          }
          
          const translatedSegments = targetText.split(TEXT_DELIMITER).map(t => t.trim());
          
          // Validate segment count match
          if (translatedSegments.length !== chunkTexts.length) {
            logger.warn("[Bing] Translated segment count mismatch after splitting.", { 
              expected: chunkTexts.length, 
              got: translatedSegments.length 
            });
            // For Bing, return the full translation as single segment if mismatch
            return [targetText];
          }
          
          return translatedSegments;
        },
        context,
        abortController,
      });

      return result || chunkTexts.map(() => "");
      
    } catch (error) {
      if (error.name === 'BingApiError' || error instanceof SyntaxError) {
        logger.warn(`[Bing] Chunk translation failed, will be handled by fallback. Chunk size: ${chunkTexts.length}`);
        // Let BaseTranslateProvider handle the error and fallback
        throw error;
      }
      
      // Handle token-related errors and other errors with proper typing
      if (!error.type) {
        if (error.message?.includes("token")) {
          error.type = ErrorTypes.API_KEY_MISSING;
        } else if (error.message?.includes("rate limit") || error.message?.includes("quota")) {
          error.type = ErrorTypes.API_QUOTA_EXCEEDED;
        } else {
          error.type = ErrorTypes.API;
        }
      }
      
      error.context = context;
      throw error;
    }
  }

  async _getBingAccessToken(abortController) {
    try {
      if (abortController?.signal.aborted) {
        throw new Error('Translation cancelled');
      }
      
      if (!BingTranslateProvider.bingAccessToken || 
          Date.now() - BingTranslateProvider.bingAccessToken.tokenTs > BingTranslateProvider.bingAccessToken.tokenExpiryInterval) {
        logger.debug('[Bing] Fetching new access token...');
        
        const response = await fetch(BingTranslateProvider.bingTokenUrl, { 
          signal: abortController?.signal 
        });
        
        if (!response.ok) {
          const err = new Error(`Failed to fetch token page: ${response.status}`);
          err.type = ErrorTypes.API_KEY_MISSING;
          throw err;
        }
        
        const data = await response.text();

        const igMatch = data.match(/IG:"([^"]+)"/);
        const iidMatch = data.match(/EventID:"([^"]+)"/);
        const paramsMatch = data.match(/var params_AbusePreventionHelper\s?=\s?(\[.*?\]);/);

        if (!igMatch || !iidMatch || !paramsMatch) {
          logger.error('[Bing] Failed to extract token parameters. HTML might have changed.');
          logger.debug('[Bing] Fetched HTML for token:', data.substring(0, 1000));
          throw new Error("Failed to extract token parameters from Bing translator page");
        }

        const IG = igMatch[1];
        const IID = iidMatch[1];
        const params = JSON.parse(paramsMatch[1]);
        const [_key, _token, interval] = params;

        BingTranslateProvider.bingAccessToken = {
          IG: IG,
          IID: IID,
          key: _key,
          token: _token,
          tokenTs: Date.now(),
          tokenExpiryInterval: interval,
          count: 0,
        };
        
        logger.debug('[Bing] New access token obtained successfully.');
      }
      
      return BingTranslateProvider.bingAccessToken;
    } catch (error) {
      logger.error(`[Bing] Failed to get access token:`, error);
      if (!error.type) error.type = ErrorTypes.API;
      error.context = `${this.providerName.toLowerCase()}-token-fetch`;
      throw error;
    }
  }

  static cleanup() {
    BingTranslateProvider.bingAccessToken = null;
  }

  resetSessionContext() {
    super.resetSessionContext();
    BingTranslateProvider.cleanup();
  }
}