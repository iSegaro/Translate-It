// src/providers/implementations/YandexTranslateProvider.js
import Browser from "webextension-polyfill";
import { BaseTranslationProvider } from "./BaseTranslationProvider.js";
import { logME } from "../../utils/helpers.js";
import { isPersianText } from "../../utils/textDetection.js";
// import { AUTO_DETECT_VALUE, getLanguageCode } from "tts-utils";
const AUTO_DETECT_VALUE = 'auto';
const getLanguageCode = (lang) => lang;
import { ErrorTypes } from "../../services/ErrorTypes.js";
import { TranslationMode } from "../../config.js";

const TEXT_DELIMITER = "\n\n---\n\n";

// Yandex language code mapping (based on the provided example)
const yandexLangCode = {
  af: "af",
  sq: "sq",
  am: "am",
  ar: "ar",
  hy: "hy",
  az: "az",
  eu: "eu",
  be: "be",
  bn: "bn",
  bs: "bs",
  bg: "bg",
  ca: "ca",
  hr: "hr",
  cs: "cs",
  da: "da",
  nl: "nl",
  en: "en",
  eo: "eo",
  et: "et",
  fi: "fi",
  fr: "fr",
  gl: "gl",
  ka: "ka",
  de: "de",
  el: "el",
  gu: "gu",
  ht: "ht",
  hi: "hi",
  hu: "hu",
  is: "is",
  id: "id",
  ga: "ga",
  it: "it",
  ja: "ja",
  kn: "kn",
  kk: "kk",
  km: "km",
  ko: "ko",
  ky: "ky",
  lo: "lo",
  la: "la",
  lv: "lv",
  lt: "lt",
  lb: "lb",
  mk: "mk",
  mg: "mg",
  ms: "ms",
  ml: "ml",
  mt: "mt",
  mi: "mi",
  mr: "mr",
  mn: "mn",
  my: "my",
  ne: "ne",
  no: "no",
  fa: "fa",
  pl: "pl",
  pt: "pt",
  pa: "pa",
  ro: "ro",
  ru: "ru",
  gd: "gd",
  sr: "sr",
  si: "si",
  sk: "sk",
  sl: "sl",
  es: "es",
  su: "su",
  sw: "sw",
  sv: "sv",
  tg: "tg",
  ta: "ta",
  te: "te",
  th: "th",
  tr: "tr",
  uk: "uk",
  ur: "ur",
  uz: "uz",
  vi: "vi",
  cy: "cy",
  xh: "xh",
  yi: "yi",
  tl: "tl",
  iw: "he",
  jw: "jv",
  "zh-CN": "zh",
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

export class YandexTranslateProvider extends BaseTranslationProvider {
  static mainUrl = "https://translate.yandex.net/api/v1/tr.json/translate";

  constructor() {
    super("YandexTranslate");
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
   * Convert language name/code to Yandex language code
   * @param {string} lang - Language name or code
   * @returns {string} - Yandex language code
   */
  _getLangCode(lang) {
    if (!lang || typeof lang !== "string") return "auto";
    if (lang === AUTO_DETECT_VALUE) return "auto";
    
    const lowerCaseLang = lang.toLowerCase();
    // First try direct mapping
    const mappedCode = langNameToCodeMap[lowerCaseLang] || lowerCaseLang;
    // Then convert to Yandex format
    return yandexLangCode[mappedCode] || mappedCode;
  }

  /**
   * Generate a UUID-like identifier (based on the example implementation)
   * @returns {string} - UUID without dashes
   */
  _generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }).replace(/-/g, '');
  }

  /**
   * Apply language swapping logic similar to Google Translate and Browser Translate
   * @param {string} text - Text for detection
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @returns {Promise<[string, string]>} - [finalSourceLang, finalTargetLang]
   */
  async _applyLanguageSwapping(text, sourceLang, targetLang) {
    try {
      // Use Browser.i18n.detectLanguage for detection (similar to other providers)
      const detectionResult = await Browser.i18n.detectLanguage(text);
      if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
        const mainDetection = detectionResult.languages[0];
        const detectedLangCode = mainDetection.language.split("-")[0];
        const targetLangCode = getLanguageCode(targetLang).split("-")[0];

        if (detectedLangCode === targetLangCode) {
          // Swap languages
          logME(`[${this.providerName}] Languages swapped: ${detectedLangCode} → ${targetLangCode}`);
          return [targetLang, sourceLang];
        }
      } else {
        // Regex fallback for Persian text
        const targetLangCode = getLanguageCode(targetLang).split("-")[0];
        if (
          isPersianText(text) &&
          (targetLangCode === "fa" || targetLangCode === "ar")
        ) {
          logME(`[${this.providerName}] Languages swapped using regex fallback`);
          return [targetLang, sourceLang];
        }
      }
    } catch (error) {
      logME(`[${this.providerName}] Language detection failed:`, error);
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

    // Language Detection and Swapping (similar to Google Translate and Browser Translate)
    [sourceLang, targetLang] = await this._applyLanguageSwapping(text, sourceLang, targetLang);

    // Set auto-detect for Field and Subtitle modes after language detection
    if (translateMode === TranslationMode.Field) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    if (translateMode === TranslationMode.Subtitle) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    // Convert to Yandex language codes
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
      // Generate UUID for request
      const uuid = this._generateUuid();
      const textToTranslate = textsToTranslate.join(TEXT_DELIMITER);
      
      // Build language parameter
      const lang = sl === "auto" ? tl : `${sl}-${tl}`;

      // Prepare request body
      const formData = new URLSearchParams({
        lang: lang,
        text: textToTranslate,
      });

      // Build URL with query parameters
      const url = new URL(YandexTranslateProvider.mainUrl);
      url.searchParams.set("id", `${uuid}-0-0`);
      url.searchParams.set("srv", "android");

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
          // Check for valid Yandex response structure
          if (!data || data.code !== 200) {
            return undefined;
          }

          // Extract translation data
          if (!data.text || !Array.isArray(data.text) || data.text.length === 0) {
            return undefined;
          }

          const targetText = data.text[0];
          if (!targetText) {
            return undefined;
          }

          // Extract detected language if available
          let detectedLang = "";
          if (data.lang && typeof data.lang === "string") {
            detectedLang = data.lang.split("-")[0];
          }

          return {
            targetText,
            detectedLang,
            transliteration: "", // Yandex doesn't provide transliteration in this API
          };
        },
        context: context,
      });

      // Response Processing
      if (isJsonMode) {
        const translatedParts = result.targetText.split(TEXT_DELIMITER);
        if (translatedParts.length !== originalJsonStruct.length) {
          logME(
            `[${this.providerName}] JSON reconstruction failed due to segment mismatch.`
          );
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
        // Error already has type from _executeApiCall
        throw error;
      }

      // Handle Yandex-specific errors
      if (error.message?.includes("rate limit") || error.message?.includes("quota")) {
        error.type = ErrorTypes.API_QUOTA_EXCEEDED;
        error.context = `${this.providerName.toLowerCase()}-quota-exceeded`;
      } else if (error.message?.includes("403") || error.message?.includes("401")) {
        error.type = ErrorTypes.API_KEY_MISSING;
        error.context = `${this.providerName.toLowerCase()}-auth-error`;
      } else {
        error.type = ErrorTypes.API;
        error.context = `${this.providerName.toLowerCase()}-translation-error`;
      }

      logME(`[${this.providerName}] Translation error:`, error);
      throw error;
    }
  }
}