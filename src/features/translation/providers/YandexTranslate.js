// src/providers/implementations/YandexTranslateProvider.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
// import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'YandexTranslate');

// Yandex language code mapping
const yandexLangCode = {
  af: "af", sq: "sq", am: "am", ar: "ar", hy: "hy", az: "az", eu: "eu", be: "be", bn: "bn", bs: "bs", bg: "bg", ca: "ca", hr: "hr", cs: "cs", da: "da", nl: "nl", en: "en", eo: "eo", et: "et", fi: "fi", fr: "fr", gl: "gl", ka: "ka", de: "de", el: "el", gu: "gu", ht: "ht", hi: "hi", hu: "hu", is: "is", id: "id", ga: "ga", it: "it", ja: "ja", kn: "kn", kk: "kk", km: "km", ko: "ko", ky: "ky", lo: "lo", la: "la", lv: "lv", lt: "lt", lb: "lb", mk: "mk", mg: "mg", ms: "ms", ml: "ml", mt: "mt", mi: "mi", mr: "mr", mn: "mn", my: "my", ne: "ne", no: "no", fa: "fa", pl: "pl", pt: "pt", pa: "pa", ro: "ro", ru: "ru", gd: "gd", sr: "sr", si: "si", sk: "sk", sl: "sl", es: "es", su: "su", sw: "sw", sv: "sv", tg: "tg", ta: "ta", te: "te", th: "th", tr: "tr", uk: "uk", ur: "ur", uz: "uz", vi: "vi", cy: "cy", xh: "xh", yi: "yi", tl: "tl", iw: "he", jw: "jv", "zh-CN": "zh",
};

// Language name to code mapping
const langNameToCodeMap = {
  afrikaans: "af", albanian: "sq", arabic: "ar", azerbaijani: "az", belarusian: "be", bengali: "bn", bulgarian: "bg", catalan: "ca", cebuano: "ceb", "chinese (simplified)": "zh-CN", chinese: "zh-CN", croatian: "hr", czech: "cs", danish: "da", dutch: "nl", english: "en", estonian: "et", farsi: "fa", persian: "fa", filipino: "fil", finnish: "fi", french: "fr", german: "de", greek: "el", hebrew: "he", hindi: "hi", hungarian: "hu", indonesian: "id", italian: "it", japanese: "ja", kannada: "kn", kazakh: "kk", korean: "ko", latvian: "lv", lithuanian: "lt", malay: "ms", malayalam: "ml", marathi: "mr", nepal: "ne", norwegian: "no", odia: "or", pashto: "ps", polish: "pl", portuguese: "pt", punjabi: "pa", romanian: "ro", russian: "ru", serbian: "sr", sinhala: "si", slovak: "sk", slovenian: "sl", spanish: "es", swahili: "sw", swedish: "sv", tagalog: "tl", tamil: "ta", telugu: "te", thai: "th", turkish: "tr", ukrainian: "uk", urdu: "ur", uzbek: "uz", vietnamese: "vi",
};

export class YandexTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static description = "Yandex translation service";
  static displayName = "Yandex Translate";
  static reliableJsonMode = false;
  static supportsDictionary = false;
  static mainUrl = "https://translate.yandex.net/api/v1/tr.json/translate";
  static detectUrl = "https://translate.yandex.net/api/v1/tr.json/detect";
  static CHAR_LIMIT = 10000;
  
  // BaseTranslateProvider capabilities
  static supportsStreaming = true;
  static chunkingStrategy = 'character_limit';
  static characterLimit = 10000;
  static maxChunksPerBatch = 8;

  constructor() {
    super("YandexTranslate");
  }

  _getLangCode(lang) {
    const normalized = LanguageSwappingService._normalizeLangValue(lang);
    if (normalized === AUTO_DETECT_VALUE) return 'auto';
    if (yandexLangCode[normalized]) return yandexLangCode[normalized];
    const mapped = langNameToCodeMap[normalized] || normalized;
    return yandexLangCode[mapped] || mapped;
  }

  _generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }).replace(/-/g, '');
  }

  /**
   * Translate a single chunk of texts using Yandex's API
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController) {
    const context = `${this.providerName.toLowerCase()}-translate-chunk`;
    const lang = sourceLang === "auto" ? targetLang : `${sourceLang}-${targetLang}`;
    logger.debug(`Yandex: Built lang parameter: '${lang}' from source='${sourceLang}' target='${targetLang}'`);

    // Add key info log for translation start
    logger.info(`[Yandex] Starting translation: ${chunkTexts.join('').length} chars`);

    const uuid = this._generateUuid();
    const formData = new URLSearchParams();
    formData.append('lang', lang);
    chunkTexts.forEach(text => formData.append('text', text || ''));

    const url = new URL(YandexTranslateProvider.mainUrl);
    url.searchParams.set("id", `${uuid}-0-0`);
    url.searchParams.set("srv", "android");

    const result = await this._executeWithErrorHandling({
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
        if (!data || data.code !== 200 || !data.text || !Array.isArray(data.text) || data.text.length !== chunkTexts.length) {
          logger.error('Yandex API returned invalid or mismatched response for a chunk', data);
          return chunkTexts.map(() => '');
        }
        return data.text;
      },
      context,
      abortController,
    });

    const finalResult = result || chunkTexts.map(() => '');

    // Add completion log for successful translation
    if (finalResult.length > 0) {
      logger.info(`[Yandex] Translation completed successfully`);
    }

    return finalResult;
  }

  async detect_with_yandex(text, hintLangs = []) {
    logger.debug(`Yandex: Detecting language for text: "${text.substring(0, 50)}..."`);

    const uuid = this._generateUuid();
    const url = new URL(YandexTranslateProvider.detectUrl);
    url.searchParams.set("id", `${uuid}-0-0`);
    url.searchParams.set("srv", "android");

    const formData = new URLSearchParams({
      text: text,
      options: "1",
    });

    if (hintLangs.length > 0) {
      formData.append('hint', hintLangs.map(l => this._getLangCode(l)).join(','));
    }

    try {
      const result = await this._executeWithErrorHandling({
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
}