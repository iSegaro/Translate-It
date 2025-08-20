// src/providers/implementations/YandexTranslateProvider.js
import { BaseProvider } from "@/providers/core/BaseProvider.js";

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'YandexTranslate');

import { LanguageSwappingService } from "@/providers/core/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";
import { ErrorTypes } from "@/error-management/ErrorTypes.js";
import { TranslationMode } from "@/config.js";

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

export class YandexTranslateProvider extends BaseProvider {
  static type = "free";
  static description = "Yandex translation service";
  static displayName = "Yandex Translate";
  static reliableJsonMode = true;
  static mainUrl = "https://translate.yandex.net/api/v1/tr.json/translate";
  static detectUrl = "https://translate.yandex.net/api/v1/tr.json/detect";
  static CHAR_LIMIT = 1500;
  static CHUNK_SIZE = 20;

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
    // Normalize incoming language value first (handles 'Auto-Detect', display names, etc.)
    const normalized = LanguageSwappingService._normalizeLangValue(lang);
    if (normalized === AUTO_DETECT_VALUE) return 'auto';

    // If normalization produced a known Yandex key, prefer that
    if (yandexLangCode[normalized]) return yandexLangCode[normalized];

    // As a fallback, if normalization produced a value present in the name map, use that
    // (Note: _normalizeLangValue already maps display names to codes, but keep safe guard)
    const mapped = langNameToCodeMap[normalized] || normalized;
    return yandexLangCode[mapped] || mapped;
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
   * Detects the language of a given text using Yandex API.
   * This implementation mirrors the `translate` method's API usage style.
   * @param {string} text - The text to detect the language of.
   * @param {string[]} [hintLangs=[]] - A list of language codes to hint to the detector.
   * @returns {Promise<string|undefined>} - The detected language code (e.g., 'en') or undefined if detection fails.
   */
  async detect_with_yandex(text, hintLangs = []) {
    logger.debug(`Yandex: Detecting language for text: "${text.substring(0, 50)}"...`);

    const uuid = this._generateUuid();
    const url = new URL(YandexTranslateProvider.detectUrl);
    url.searchParams.set("id", `${uuid}-0-0`);
    url.searchParams.set("srv", "android"); // Using 'android' service like in translate method

    const formData = new URLSearchParams({
      text: text,
      options: "1", // from curl
    });

    if (hintLangs.length > 0) {
      formData.append('hint', hintLangs.map(l => this._getLangCode(l)).join(','));
    }

    try {
      const result = await this._executeApiCall({
        url: url.toString(),
        fetchOptions: {
          method: "POST", // Assuming POST works like for translate
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": navigator.userAgent,
          },
          body: formData,
        },
        extractResponse: (data) => {
          if (data && data.code === 200 && data.lang) {
            logger.debug(`Yandex: Detected language: ${data.lang}`);
            return { detectedLang: data.lang };
          }
          logger.error("Yandex detect API returned invalid response:", data);
          return undefined;
        },
        context: `${this.providerName.toLowerCase()}-detect`,
      });

      return result?.detectedLang;
    } catch (error) {
      logger.error("Yandex language detection failed:", error);
      throw error;
    }
  }

  async translate(text, sourceLang, targetLang, translateMode = null, originalSourceLang = 'English', originalTargetLang = 'Farsi') {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    // Language detection and swapping using centralized service
    [sourceLang, targetLang] = await LanguageSwappingService.applyLanguageSwapping(
      text, sourceLang, targetLang, originalSourceLang, originalTargetLang,
      { providerName: 'YandexTranslate', useRegexFallback: true }
    );

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

    // Skip if same language after conversion
    if (sl === tl) {
      logger.debug(`Yandex: Same language detected after conversion: ${sl} === ${tl}, returning original text`);
      return text;
    }

    // Additional check: if source and target are both Persian/Arabic, return original text
    if ((sl === "fa" || sl === "ar") && (tl === "fa" || tl === "ar")) {
      logger.debug(`Yandex: Both source and target are Persian/Arabic: ${sl} → ${tl}, returning original text`);
      return text;
    }

    logger.debug(`Yandex: Proceeding with translation: ${sl} → ${tl}`);

    // JSON Mode Detection - Fix for Yandex API compatibility
    let isJsonMode = false;
    let originalJsonStruct;
    let textsToTranslate = [text];

    try {
      const parsed = JSON.parse(text);
      if (this._isSpecificTextJsonFormat(parsed)) {
        isJsonMode = true;
        originalJsonStruct = parsed;
        textsToTranslate = originalJsonStruct.map((item) => item.text);
        logger.debug('JSON mode detected, extracting texts for translation:', textsToTranslate.length);
      }
    } catch {
      // Not a valid JSON, proceed in plain text mode.
    }

    const context = `${this.providerName.toLowerCase()}-translate`;

    try {
      const lang = sl === "auto" ? tl : `${sl}-${tl}`;
      logger.debug(`Yandex: Built lang parameter: '${lang}' from source='${sl}' target='${tl}'`);

      if (isJsonMode) {
        const translateChunk = async (chunk) => {
          const uuid = this._generateUuid();
          const formData = new URLSearchParams();
          formData.append('lang', lang);
          chunk.forEach(text => formData.append('text', text || ''));

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
              if (!data || data.code !== 200 || !data.text || !Array.isArray(data.text)) {
                logger.error('Yandex API returned invalid response for a chunk', data);
                return chunk.map(() => ''); // Return empty strings for the chunk on error
              }
              return data.text;
            },
            context: `${context}-chunk`,
          });
          return result || chunk.map(() => '');
        };

        const translatedSegments = await this._processInBatches(
          textsToTranslate,
          translateChunk,
          {
            CHUNK_SIZE: YandexTranslateProvider.CHUNK_SIZE,
            CHAR_LIMIT: YandexTranslateProvider.CHAR_LIMIT,
          }
        );

        const translatedJson = originalJsonStruct.map((item, index) => ({
          ...item,
          text: translatedSegments[index] || "",
        }));

        return JSON.stringify(translatedJson, null, 2);

      } else {
        // Handle single text translation (existing logic)
        const uuid = this._generateUuid();
        const textToTranslate = textsToTranslate[0];
        
        const formData = new URLSearchParams({
          lang: lang,
          text: textToTranslate,
        });

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
            if (!data || data.code !== 200 || !data.text || !Array.isArray(data.text) || data.text.length === 0) {
              return undefined;
            }
            const targetText = data.text[0];
            if (!targetText) {
              return undefined;
            }
            let detectedLang = "";
            if (data.lang && typeof data.lang === "string") {
              detectedLang = data.lang.split("-")[0];
            }
            return {
              targetText,
              detectedLang,
              transliteration: "",
            };
          },
          context: context,
        });
        return result.targetText;
      }
    } catch (error) {
      if (error.type) {
        throw error;
      }
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
      logger.error('Translation error:', error);
      throw error;
    }
  }
}