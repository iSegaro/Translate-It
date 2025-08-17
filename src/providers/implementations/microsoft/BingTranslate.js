// src/providers/implementations/BingTranslateProvider.js
import browser from 'webextension-polyfill';
import { BaseProvider } from "@/providers/core/BaseProvider.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'BingTranslate');

import { isPersianText } from "@/utils/text/textDetection.js";
import { getLanguageCode } from "@/utils/i18n/languages.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";
import { ErrorTypes } from "@/error-management/ErrorTypes.js";
import { TranslationMode } from "@/config.js";

// (logger already defined)


const TEXT_DELIMITER = "\n\n---\n\n";

// Bing language code mapping (based on the example.js.txt file)
const bingLangCode = {
  auto: "auto-detect",
  af: "af",
  am: "am",
  ar: "ar",
  az: "az",
  bg: "bg",
  bs: "bs",
  ca: "ca",
  cs: "cs",
  cy: "cy",
  da: "da",
  de: "de",
  el: "el",
  en: "en",
  es: "es",
  et: "et",
  fa: "fa",
  fi: "fi",
  fr: "fr",
  ga: "ga",
  gu: "gu",
  hi: "hi",
  hmn: "mww",
  hr: "hr",
  ht: "ht",
  hu: "hu",
  hy: "hy",
  id: "id",
  is: "is",
  it: "it",
  ja: "ja",
  kk: "kk",
  km: "km",
  kn: "kn",
  ko: "ko",
  ku: "ku",
  lo: "lo",
  lt: "lt",
  lv: "lv",
  mg: "mg",
  mi: "mi",
  ml: "ml",
  mr: "mr",
  ms: "ms",
  mt: "mt",
  my: "my",
  ne: "ne",
  nl: "nl",
  no: "nb",
  pa: "pa",
  pl: "pl",
  ps: "ps",
  ro: "ro",
  ru: "ru",
  sk: "sk",
  sl: "sl",
  sm: "sm",
  sq: "sq",
  sr: "sr-Cyrl",
  sv: "sv",
  sw: "sw",
  ta: "ta",
  te: "te",
  th: "th",
  tr: "tr",
  uk: "uk",
  ur: "ur",
  vi: "vi",
  iw: "he",
  tl: "fil",
  pt: "pt",
  "zh-CN": "zh-Hans",
  "zh-TW": "zh-Hant",
};

// Language name to code mapping for consistent behavior with other providers
const langNameToCodeMap = {
  afrikaans: "af",
  albanian: "sq",
  arabic: "ar",
  azerbaijani: "az",
  belarusian: "be",
  bengali: "bn",
  bulgarian: "bg",
  catalan: "ca",
  cebuano: "ceb",
  "chinese (simplified)": "zh-CN",
  chinese: "zh-CN",
  croatian: "hr",
  czech: "cs",
  danish: "da",
  dutch: "nl",
  english: "en",
  estonian: "et",
  farsi: "fa",
  persian: "fa",
  filipino: "fil",
  finnish: "fi",
  french: "fr",
  german: "de",
  greek: "el",
  hebrew: "he",
  hindi: "hi",
  hungarian: "hu",
  indonesian: "id",
  italian: "it",
  japanese: "ja",
  kannada: "kn",
  kazakh: "kk",
  korean: "ko",
  latvian: "lv",
  lithuanian: "lt",
  malay: "ms",
  malayalam: "ml",
  marathi: "mr",
  nepali: "ne",
  norwegian: "no",
  odia: "or",
  pashto: "ps",
  polish: "pl",
  portuguese: "pt",
  punjabi: "pa",
  romanian: "ro",
  russian: "ru",
  serbian: "sr",
  sinhala: "si",
  slovak: "sk",
  slovenian: "sl",
  spanish: "es",
  swahili: "sw",
  swedish: "sv",
  tagalog: "tl",
  tamil: "ta",
  telugu: "te",
  thai: "th",
  turkish: "tr",
  ukrainian: "uk",
  urdu: "ur",
  uzbek: "uz",
  vietnamese: "vi",
};

export class BingTranslateProvider extends BaseProvider {
  static type = "free";
  static description = "Bing Translator";
  static displayName = "Microsoft Bing";
  // Mark that Bing's JSON-mode output may be unreliable/variable
  static reliableJsonMode = false;
  static bingBaseUrl = "https://www.bing.com/ttranslatev3";
  static bingTokenUrl = "https://www.bing.com/translator";
  static bingAccessToken = null;

  constructor() {
    super("BingTranslate");
  }

  /**
   * Check if JSON mode is being used
   * @param {Object} obj - Object to check
   * @returns {boolean} - True if specific JSON format
   */
  _isSpecificTextJsonFormat(obj) {
    return (
      Array.isArray(obj) &&
      obj.length > 0 &&
      obj.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof item.text === "string"
      )
    );
  }

  /**
   * Convert language name/code to Bing language code
   * @param {string} lang - Language name or code
   * @returns {string} - Bing language code
   */
  _getLangCode(lang) {
    if (!lang || typeof lang !== "string") return "auto-detect";
    if (lang === AUTO_DETECT_VALUE) return "auto-detect";
    
    const lowerCaseLang = lang.toLowerCase();
    // First try direct mapping
    const mappedCode = langNameToCodeMap[lowerCaseLang] || lowerCaseLang;
    // Then convert to Bing format
    return bingLangCode[mappedCode] || mappedCode;
  }

  /**
   * Get Bing access token (based on the example implementation)
   * @returns {Promise<Object>} - Token object with IG, IID, key, token
   */
  async _getBingAccessToken() {
    try {
      // If no access token or token is expired, get new token
      if (
        !BingTranslateProvider.bingAccessToken ||
        Date.now() - BingTranslateProvider.bingAccessToken.tokenTs >
          BingTranslateProvider.bingAccessToken.tokenExpiryInterval
      ) {
        logger.debug('Fetching new Bing access token');
        
        const response = await fetch(BingTranslateProvider.bingTokenUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch token page: ${response.status}`);
        }
        
        const data = await response.text();
        
        // Extract token data using regex patterns from the example
        const igMatch = data.match(/IG:"([^"]+)"/);
        const iidMatch = data.match(/data-iid="([^"]+)"/);
        const paramsMatch = data.match(/params_AbusePreventionHelper\s?=\s?([^\]]+\])/);
        
        if (!igMatch || !iidMatch || !paramsMatch) {
          throw new Error("Failed to extract token parameters from Bing translator page");
        }
        
        const IG = igMatch[1];
        const IID = iidMatch[1];
        const [_key, _token, interval] = JSON.parse(paramsMatch[1]);
        
        BingTranslateProvider.bingAccessToken = {
          IG,
          IID,
          key: _key,
          token: _token,
          tokenTs: Date.now(),
          tokenExpiryInterval: interval,
          count: 0,
        };
        
        logger.debug('New Bing access token obtained');
      }
      
      return BingTranslateProvider.bingAccessToken;
    } catch (error) {
      logger.error('Failed to get Bing access token:', error);
      const err = new Error(`Failed to get Bing access token: ${error.message}`);
      err.type = ErrorTypes.API;
      err.context = `${this.providerName.toLowerCase()}-token-fetch`;
      throw err;
    }
  }

  /**
   * Apply language swapping logic similar to Google Translate and browser Translate
   * @param {string} text - Text for detection
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @returns {Promise<[string, string]>} - [finalSourceLang, finalTargetLang]
   */
  async _applyLanguageSwapping(text, sourceLang, targetLang) {
    try {
      // Use browser.i18n.detectLanguage for detection (similar to other providers)
      const detectionResult = await browser.i18n.detectLanguage(text);
      if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
        const mainDetection = detectionResult.languages[0];
        const detectedLangCode = mainDetection.language.split("-")[0];
        const targetLangCode = getLanguageCode(targetLang).split("-")[0];

        if (detectedLangCode === targetLangCode) {
          // Swap languages
          logger.debug('Languages swapped: ${detectedLangCode} → ${targetLangCode}');
          return [targetLang, sourceLang];
        }
      } else {
        // Regex fallback for Persian text
        const targetLangCode = getLanguageCode(targetLang).split("-")[0];
        if (
          isPersianText(text) &&
          (targetLangCode === "fa" || targetLangCode === "ar")
        ) {
          logger.debug('Languages swapped using regex fallback');
          return [targetLang, sourceLang];
        }
      }
    } catch (error) {
      logger.error('Language detection failed:', error);
      // Regex fallback
      const targetLangCode = getLanguageCode(targetLang).split("-")[0];
      if (
        isPersianText(text) &&
        (targetLangCode === "fa" || targetLangCode === "ar")
      ) {
        return [targetLang, sourceLang];
      }
    }

    // No swapping needed
    return [sourceLang, targetLang];
  }

  async translate(text, sourceLang, targetLang, translateMode = null) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    // Language Detection and Swapping (similar to Google Translate and browser Translate)
    [sourceLang, targetLang] = await this._applyLanguageSwapping(text, sourceLang, targetLang);

    // Set auto-detect for Field and Subtitle modes after language detection
    if (translateMode === TranslationMode.Field) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    if (translateMode === TranslationMode.Subtitle) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    // Convert to Bing language codes
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    // Skip if same language
    if (sl === tl) return text;

    // JSON Mode Detection
    let isJsonMode = false;
    let originalJsonStruct;
    let textsToTranslate = [text];

    try {
      const parsed = JSON.parse(text);
      if (this._isSpecificTextJsonFormat(parsed)) {
        isJsonMode = true;
        originalJsonStruct = parsed;
        textsToTranslate = originalJsonStruct.map((item) => item.text);
      }
    } catch {
      // Not a valid JSON, proceed in plain text mode.
    }

    const context = `${this.providerName.toLowerCase()}-translate`;

    try {
      // Get access token
      const { token, key, IG, IID } = await this._getBingAccessToken();

      // Prepare request body
      const textToTranslate = textsToTranslate.join(TEXT_DELIMITER);
      const formData = new URLSearchParams({
        text: textToTranslate,
        fromLang: sl,
        to: tl,
        token,
        key,
      });

      // Make translation request
      const url = new URL(BingTranslateProvider.bingBaseUrl);
      url.searchParams.set("IG", IG);
      url.searchParams.set("IID", 
        IID && IID.length ? `${IID}.${BingTranslateProvider.bingAccessToken.count++}` : ""
      );
      url.searchParams.set("isVertical", "1");

      const result = await this._executeApiCall({
        url: url.toString(),
        fetchOptions: {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": navigator.userAgent,
          },
          body: formData,
        },
        extractResponse: (data) => {
          // Check for valid Bing response structure
          if (!data || !Array.isArray(data) || !data[0]) {
            return undefined;
          }

          // Extract translation data
          const translationData = data[0];
          if (!translationData.translations || !Array.isArray(translationData.translations)) {
            return undefined;
          }

          const targetText = translationData.translations[0]?.text;
          if (!targetText) {
            return undefined;
          }

          // Extract additional data if available
          let detectedLang = "";
          let transliteration = "";

          if (translationData.detectedLanguage?.language) {
            detectedLang = translationData.detectedLanguage.language;
          }

          if (data[1] && data[1].inputTransliteration) {
            transliteration = data[1].inputTransliteration;
          }

          return {
            targetText,
            detectedLang,
            transliteration,
          };
        },
        context: context,
      });

      // Response Processing
      if (isJsonMode) {
        const translatedParts = result.targetText.split(TEXT_DELIMITER);
        if (translatedParts.length !== originalJsonStruct.length) {
          logger.error('JSON reconstruction failed due to segment mismatch.');
          return result.targetText; // Fallback to raw translated text
        }
        const translatedJson = originalJsonStruct.map((item, index) => ({
          ...item,
          text: translatedParts[index]?.trim() || "",
        }));
        return JSON.stringify(translatedJson, null, 2);
      } else {
        return result.targetText;
      }
    } catch (error) {
      // Enhanced error handling
      if (error.type) {
        // Error already has type from _executeApiCall or _getBingAccessToken
        throw error;
      }

      // Handle Bing-specific errors
      if (error.message?.includes("token") || error.message?.includes("Token")) {
        error.type = ErrorTypes.API_KEY_MISSING;
        error.context = `${this.providerName.toLowerCase()}-token-error`;
      } else if (error.message?.includes("rate limit") || error.message?.includes("quota")) {
        error.type = ErrorTypes.API_QUOTA_EXCEEDED;
        error.context = `${this.providerName.toLowerCase()}-quota-exceeded`;
      } else {
        error.type = ErrorTypes.API;
        error.context = `${this.providerName.toLowerCase()}-translation-error`;
      }

      logger.error('Translation error:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  static cleanup() {
    BingTranslateProvider.bingAccessToken = null;
  }

  /**
   * Reset session context (override parent method)
   */
  resetSessionContext() {
    super.resetSessionContext();
    BingTranslateProvider.cleanup();
  }
}
