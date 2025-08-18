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
   * Normalize various language input forms into canonical values.
   * - Maps many display names (e.g. "English", "Farsi") to codes where possible
   * - Maps common auto-detect aliases ("Auto-Detect", "autodetect", "detect") to `AUTO_DETECT_VALUE`
   * @param {string} lang
   * @returns {string} normalized language string (e.g. 'auto', 'en', 'fa' or other code/name)
   */
  _normalizeLangValue(lang) {
    if (!lang || typeof lang !== 'string') return AUTO_DETECT_VALUE;
    const raw = lang.trim();
    if (!raw) return AUTO_DETECT_VALUE;

    const lower = raw.toLowerCase();

    // Common aliases for automatic detection
    const autoAliases = new Set(['auto', 'auto-detect', 'autodetect', 'auto detect', 'detect']);
    if (autoAliases.has(lower)) return AUTO_DETECT_VALUE;

    // If caller passed a display name that exists in our name->code map, return that code
    if (langNameToCodeMap[lower]) return langNameToCodeMap[lower];

    // Otherwise return the lowercased form (may already be a code like 'en' or 'fa')
    return lower;
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
    const normalized = this._normalizeLangValue(lang);
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
   * Apply language swapping logic similar to Google Translate and browser Translate
   * Fixed: Only swap when detected language matches target AND source is different
   * IMPORTANT: For Yandex, when swapping, target should NOT be 'auto' (causes HTTP 400)
   * @param {string} text - Text for detection
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} originalSourceLang - Original source language before any modifications
   * @returns {Promise<[string, string]>} - [finalSourceLang, finalTargetLang]
   */
  async _applyLanguageSwapping(text, sourceLang, targetLang, originalSourceLang = 'English', originalTargetLang = 'Farsi') {
    try {
      // Use browser.i18n.detectLanguage for detection (similar to other providers)
      const detectionResult = await browser.i18n.detectLanguage(text);
      if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
        const mainDetection = detectionResult.languages[0];
        const detectedLangCode = mainDetection.language.split("-")[0];
        // Normalize incoming params to avoid display labels like 'Auto-Detect'
        const targetNorm = this._normalizeLangValue(targetLang);
        const sourceNorm = this._normalizeLangValue(sourceLang);
        const targetLangCode = getLanguageCode(targetNorm).split("-")[0];
        const sourceLangCode = getLanguageCode(sourceNorm).split("-")[0];

        // Only swap if detected language matches target
        if (detectedLangCode === targetLangCode) {
          // Apply same priority logic as other providers
          let newTargetLang;
          
          if (sourceNorm !== AUTO_DETECT_VALUE) {
            // sourceLang is specific, use it
            newTargetLang = sourceNorm;
          } else if (this._normalizeLangValue(originalSourceLang) !== AUTO_DETECT_VALUE) {
            // sourceLang is auto, but originalSourceLang is specific
            newTargetLang = originalSourceLang;
          } else {
            // Both sourceLang and originalSourceLang are auto
            // Check if detected language is different from originalTargetLang
            const originalTargetLangCode = getLanguageCode(originalTargetLang).split("-")[0];
            if (detectedLangCode !== originalTargetLangCode) {
              // Detected lang != config target lang -> translate to config target lang
              newTargetLang = originalTargetLang;
            } else {
              // Detected lang == config target lang -> fallback to English
              newTargetLang = 'English';
            }
          }
          
          logger.debug(`Yandex: Languages swapped from ${targetLang} to ${newTargetLang} (detected: ${detectedLangCode}, originalSource: ${originalSourceLang}, originalTarget: ${originalTargetLang})`);
          return [targetNorm, newTargetLang];
        }
        
        // Log when no swapping occurs for debugging
        logger.debug(`No language swapping: detected=${detectedLangCode}, source=${sourceLangCode}, target=${targetLangCode}`);
      } else {
        // Enhanced regex fallback for Persian text with better logic
        const targetNorm = this._normalizeLangValue(targetLang);
        const sourceNorm = this._normalizeLangValue(sourceLang);
        const targetLangCode = getLanguageCode(targetNorm).split("-")[0];
        const sourceLangCode = getLanguageCode(sourceNorm).split("-")[0];

        // Only swap Persian text if target is Persian/Arabic
        if (
          isPersianText(text) &&
          (targetLangCode === "fa" || targetLangCode === "ar")
        ) {
          // Same priority logic as detection-based swapping
          let newTargetLang;
          
          if (sourceNorm !== AUTO_DETECT_VALUE) {
            // sourceLang is specific, use it
            newTargetLang = sourceNorm;
          } else if (this._normalizeLangValue(originalSourceLang) !== AUTO_DETECT_VALUE) {
            // sourceLang is auto, but originalSourceLang is specific
            newTargetLang = originalSourceLang;
          } else {
            // Both sourceLang and originalSourceLang are auto
            // Check if Persian text and target language is different from originalTargetLang
            const originalTargetLangCode = getLanguageCode(originalTargetLang).split("-")[0];
            if ("fa" !== originalTargetLangCode) {
              // Persian text but config target is not Persian -> translate to config target lang
              newTargetLang = originalTargetLang;
            } else {
              // Persian text and config target is also Persian -> fallback to English
              newTargetLang = 'English';
            }
          }
          
          logger.debug(`Yandex: Languages swapped using regex fallback from ${targetLang} to ${newTargetLang} (originalSource: ${originalSourceLang}, originalTarget: ${originalTargetLang})`);
          return [targetNorm, newTargetLang];
        }
      }
    } catch (error) {
      logger.error('Language detection failed:', error);
      // Enhanced regex fallback with same logic as above
      const targetNorm = this._normalizeLangValue(targetLang);
      const sourceNorm = this._normalizeLangValue(sourceLang);
      const targetLangCode = getLanguageCode(targetNorm).split("-")[0];
      const sourceLangCode = getLanguageCode(sourceNorm).split("-")[0];
      
      if (
        isPersianText(text) &&
        (targetLangCode === "fa" || targetLangCode === "ar")
      ) {
        // Same priority logic as other error fallbacks
        let newTargetLang;
        
        if (sourceNorm !== AUTO_DETECT_VALUE) {
          newTargetLang = sourceNorm;
        } else if (this._normalizeLangValue(originalSourceLang) !== AUTO_DETECT_VALUE) {
          newTargetLang = originalSourceLang;
        } else {
          const originalTargetLangCode = getLanguageCode(originalTargetLang).split("-")[0];
          if ("fa" !== originalTargetLangCode) {
            newTargetLang = originalTargetLang;
          } else {
            newTargetLang = 'English';
          }
        }
        
        logger.debug(`Yandex: Languages swapped in error fallback from ${targetLang} to ${newTargetLang}`);
        return [targetNorm, newTargetLang];
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

    // Language Detection and Swapping (similar to Google Translate and browser Translate)
    [sourceLang, targetLang] = await this._applyLanguageSwapping(text, sourceLang, targetLang, originalSourceLang, originalTargetLang);

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