// src/providers/implementations/YandexTranslateProvider.js
import browser from 'webextension-polyfill';
import { BaseProvider } from "@/providers/core/BaseProvider.js";

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'YandexTranslate');

import { isPersianText } from "@/utils/text/textDetection.js";
import { getLanguageCode } from "@/utils/i18n/languages.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";
import { ErrorTypes } from "@/error-management/ErrorTypes.js";
import { TranslationMode, getSourceLanguageAsync } from "@/config.js";



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

export class YandexTranslateProvider extends BaseProvider {
  static type = "free";
  static description = "Yandex translation service";
  static displayName = "Yandex Translate";
  static mainUrl = "https://translate.yandex.net/api/v1/tr.json/translate";
  static detectUrl = "https://translate.yandex.net/api/v1/tr.json/detect";

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
   * Apply language swapping logic similar to Google Translate and browser Translate
   * Fixed: Only swap when detected language matches target AND source is different
   * IMPORTANT: For Yandex, when swapping, target should NOT be 'auto' (causes HTTP 400)
   * @param {string} text - Text for detection
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} originalSourceLang - Original source language before any modifications
   * @returns {Promise<[string, string]>} - [finalSourceLang, finalTargetLang]
   */
  async _applyLanguageSwapping(text, sourceLang, targetLang, originalSourceLang = 'English') {
    try {
      // Use browser.i18n.detectLanguage for detection (similar to other providers)
      const detectionResult = await browser.i18n.detectLanguage(text);
      if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
        const mainDetection = detectionResult.languages[0];
        const detectedLangCode = mainDetection.language.split("-")[0];
        const targetLangCode = getLanguageCode(targetLang).split("-")[0];
        const sourceLangCode = getLanguageCode(sourceLang).split("-")[0];

        // Only swap if detected language matches target AND source is different from detected
        if (detectedLangCode === targetLangCode && sourceLangCode !== detectedLangCode) {
          // For Yandex: when swapping, target becomes the original source language (not 'auto')
          const newTargetLang = sourceLang === AUTO_DETECT_VALUE ? originalSourceLang : sourceLang;
          console.log(`🚨 LANGUAGE SWAPPING: detected=${detectedLangCode} matches target=${targetLangCode}, swapping source=${sourceLang} ↔ target=${newTargetLang}`);
          logger.debug(`Languages swapped: detected=${detectedLangCode}, source=${sourceLangCode} → target=${targetLangCode}, swapping to source=${targetLangCode} target=${newTargetLang}`);
          return [targetLang, newTargetLang];
        }
        
        // Log when no swapping occurs for debugging
        logger.debug(`No language swapping: detected=${detectedLangCode}, source=${sourceLangCode}, target=${targetLangCode}`);
      } else {
        // Enhanced regex fallback for Persian text with better logic
        const targetLangCode = getLanguageCode(targetLang).split("-")[0];
        const sourceLangCode = getLanguageCode(sourceLang).split("-")[0];
        
        // Only swap Persian text if source is not already Persian/Arabic and target is Persian/Arabic
        if (
          isPersianText(text) &&
          (targetLangCode === "fa" || targetLangCode === "ar") &&
          sourceLangCode !== "fa" && sourceLangCode !== "ar"
        ) {
          // For Yandex: when swapping, target becomes the original source language (not 'auto')
          const newTargetLang = sourceLang === AUTO_DETECT_VALUE ? originalSourceLang : sourceLang;
          console.log(`🚨 REGEX FALLBACK SWAPPING: Persian text detected, swapping source=${sourceLang} ↔ target=${newTargetLang}`);
          logger.debug(`Languages swapped using regex fallback: Persian text detected, source=${sourceLangCode} → target=${newTargetLang}`);
          return [targetLang, newTargetLang];
        }
      }
    } catch (error) {
      logger.error('Language detection failed:', error);
      // Enhanced regex fallback with same logic as above
      const targetLangCode = getLanguageCode(targetLang).split("-")[0];
      const sourceLangCode = getLanguageCode(sourceLang).split("-")[0];
      
      if (
        isPersianText(text) &&
        (targetLangCode === "fa" || targetLangCode === "ar") &&
        sourceLangCode !== "fa" && sourceLangCode !== "ar"
      ) {
        // For Yandex: when swapping, target becomes the original source language (not 'auto')
        const newTargetLang = sourceLang === AUTO_DETECT_VALUE ? originalSourceLang : sourceLang;
        console.log(`🚨 ERROR FALLBACK SWAPPING: Persian text detected, swapping source=${sourceLang} ↔ target=${newTargetLang}`);
        logger.debug(`Languages swapped in error fallback: Persian text, source=${sourceLangCode} → target=${newTargetLang}`);
        return [targetLang, newTargetLang];
      }
    }

    // No swapping needed
    logger.debug(`No language swapping applied: source=${sourceLang}, target=${targetLang}`);
    return [sourceLang, targetLang];
  }

  /**
   * Detects the language of a given text using Yandex API.
   * This implementation mirrors the `translate` method's API usage style.
   * @param {string} text - The text to detect the language of.
   * @param {string[]} [hintLangs=[]] - A list of language codes to hint to the detector.
   * @returns {Promise<string|undefined>} - The detected language code (e.g., 'en') or undefined if detection fails.
   */
  async detect(text, hintLangs = []) {
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

  async translate(text, sourceLang, targetLang, translateMode = null) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    console.log(`🚨 YANDEX TRANSLATE ENTRY: source=${sourceLang}, target=${targetLang}, mode=${translateMode}, textPreview=${text.substring(0, 50)}`);
    logger.debug(`🚨 YANDEX TRANSLATE ENTRY: source=${sourceLang}, target=${targetLang}, mode=${translateMode}, textPreview=${text.substring(0, 50)}`);

    // Language Detection and Swapping (similar to Google Translate and browser Translate)
    // Apply for all modes to ensure proper language detection
    console.log(`🚨 APPLYING LANGUAGE SWAPPING FOR ALL MODES`);
    // Fetch the default source language from settings
    let defaultSourceLang = await getSourceLanguageAsync();
    if (!defaultSourceLang || defaultSourceLang.toLowerCase() === 'auto') {
      defaultSourceLang = 'English'; // Default to English if setting is 'auto' or not set
    }

    // Store original source language before any modifications for proper swapping
    // If sourceLang is 'auto', we need a fallback language for swapping
    const originalSourceLang = sourceLang === AUTO_DETECT_VALUE ? defaultSourceLang : sourceLang;
    console.log(`🚨 ORIGINAL SOURCE LANG: ${originalSourceLang} (from sourceLang=${sourceLang}, config=${defaultSourceLang})`);
    [sourceLang, targetLang] = await this._applyLanguageSwapping(text, sourceLang, targetLang, originalSourceLang);
    
    console.log(`🚨 YANDEX AFTER SWAPPING: source=${sourceLang}, target=${targetLang}`);
    logger.debug(`🚨 YANDEX AFTER SWAPPING: source=${sourceLang}, target=${targetLang}`);

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
      // Build language parameter
      const lang = sl === "auto" ? tl : `${sl}-${tl}`;
      logger.debug(`Yandex: Built lang parameter: '${lang}' from source='${sl}' target='${tl}'`);

      // Handle JSON mode with individual requests for better reliability
      if (isJsonMode) {
        logger.debug(`Processing JSON mode with individual translation requests: ${textsToTranslate.length} segments`);
        
        const translatedTexts = [];
        for (let i = 0; i < textsToTranslate.length; i++) {
          const textToTranslate = textsToTranslate[i];
          if (!textToTranslate.trim()) {
            translatedTexts.push('');
            continue;
          }

          logger.debug(`Processing segment ${i+1}/${textsToTranslate.length}: "${textToTranslate.substring(0, 50)}"... with lang=${lang}`);

          const uuid = this._generateUuid();
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
              if (!data || data.code !== 200) {
                logger.error(`Yandex API returned invalid response for segment ${i}:`, data);
                return undefined;
              }

              if (!data.text || !Array.isArray(data.text) || data.text.length === 0) {
                logger.error(`Yandex API returned no translation text for segment ${i}:`, data);
                return undefined;
              }

              const targetText = data.text[0];
              if (!targetText) {
                logger.error(`Yandex API returned empty translation for segment ${i}:`, data.text);
                return undefined;
              }

              return { targetText };
            },
            context: `${context}-segment-${i}`,
          });

          translatedTexts.push(result.targetText);
        }

        // Reconstruct JSON with translated texts
        const translatedJson = originalJsonStruct.map((item, index) => ({
          ...item,
          text: translatedTexts[index] || "",
        }));

        logger.debug('JSON mode translation completed successfully');
        return JSON.stringify(translatedJson, null, 2);
      } else {
        // Handle single text translation
        const uuid = this._generateUuid();
        const textToTranslate = textsToTranslate[0];
        
        const formData = new URLSearchParams({
          lang: lang,
          text: textToTranslate,
        });

        const url = new URL(YandexTranslateProvider.mainUrl);
        url.searchParams.set("id", `${uuid}-0-0`);
        url.searchParams.set("srv", "android");

        logger.debug('Yandex API request:', {
          url: url.toString(),
          lang: lang,
          textLength: textToTranslate.length,
          isJsonMode: false
        });

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
              logger.error('Yandex API returned invalid response:', data);
              return undefined;
            }

            // Extract translation data
            if (!data.text || !Array.isArray(data.text) || data.text.length === 0) {
              logger.error('Yandex API returned no translation text:', data);
              return undefined;
            }

            const targetText = data.text[0];
            if (!targetText) {
              logger.error('Yandex API returned empty translation:', data.text);
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

      logger.error('Translation error:', error);
      throw error;
    }
  }
}