// src/core/providers/GoogleTranslateProvider.js
import browser from 'webextension-polyfill';
import { BaseProvider } from "@/providers/core/BaseProvider.js";
import { 
  getGoogleTranslateUrlAsync,
  getEnableDictionaryAsync,
  TranslationMode 
} from "@/config.js";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleTranslate');
  }
  return _logger;
};

import { isPersianText } from "@/utils/text/textDetection.js";
// import { AUTO_DETECT_VALUE, getLanguageCode } from "tts-utils";
import { AUTO_DETECT_VALUE } from "@/constants.js";
const getLanguageCode = (lang) => lang;

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


const TEXT_DELIMITER = "\n\n---\n\n";

// A simple map for converting full language names to Google Translate's codes.
const langNameToCodeMap = {
  afrikaans: "af",
  albanian: "sq",
  arabic: "ar",
  azerbaijani: "az",
  belarusian: "be",
  bengali: "bn",
  bulgarian: "bg",
  catalan: "ca",
  cebuano: "ceb", // Note: ISO 639-2 code
  "chinese (simplified)": "zh",
  chinese: "zh",
  croatian: "hr",
  czech: "cs",
  danish: "da",
  dutch: "nl",
  english: "en",
  estonian: "et",
  farsi: "fa",
  persian: "fa",
  filipino: "fil", // Note: ISO 639-2 code
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

export class GoogleTranslateProvider extends BaseProvider {
  constructor() {
    super("GoogleTranslate");
  }

  /**
   * تبدیل dictionary output Google Translate به فرمت markdown
   * @param {string} candidateText - متن dictionary خام
   * @returns {string} - متن فرماتبندی شده markdown
   */
  _formatDictionaryAsMarkdown(candidateText) {
    if (!candidateText || candidateText.trim() === "") {
      return "";
    }

    const lines = candidateText
      .trim()
      .split("\n")
      .filter((line) => line.trim() !== "");

    if (lines.length === 0) {
      return "";
    }

    // ساخت فرمت markdown
    let markdownOutput = "";

    lines.forEach((line) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const partOfSpeech = line.substring(0, colonIndex).trim();
        const terms = line.substring(colonIndex + 1).trim();

        if (partOfSpeech && terms) {
          markdownOutput += `**${partOfSpeech}:** ${terms}\n\n`;
        }
      } else if (line.trim()) {
        // اگر خط نقطه‌ای ندارد، به عنوان عنوان در نظر بگیریم
        markdownOutput += `**${line.trim()}**\n\n`;
      }
    });

    return markdownOutput.trim();
  }

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

  _getLangCode(lang) {
    if (!lang || typeof lang !== "string") return "auto";
    const lowerCaseLang = lang.toLowerCase();
    return langNameToCodeMap[lowerCaseLang] || lowerCaseLang;
  }

  async translate(text, sourceLang, targetLang, translateMode = null) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    // ▼▼▼ منطق اختصاصی Google Translate ▼▼▼
    // برای همه حالت‌ها، ابتدا language detection و swapping انجام می‌دهیم
    try {
      const detectionResult = await browser.i18n.detectLanguage(text);
      if (detectionResult?.isReliable && detectionResult.languages.length > 0) {
        const mainDetection = detectionResult.languages[0];
        const detectedLangCode = mainDetection.language.split("-")[0];
        const targetLangCode = getLanguageCode(targetLang).split("-")[0];

        if (detectedLangCode === targetLangCode) {
          // زبان‌ها را جابجا کن
          [sourceLang, targetLang] = [targetLang, sourceLang];
        }
      } else {
        // Regex fallback
        const targetLangCode = getLanguageCode(targetLang).split("-")[0];
        if (
          isPersianText(text) &&
          (targetLangCode === "fa" || targetLangCode === "ar")
        ) {
          [sourceLang, targetLang] = [targetLang, sourceLang];
        }
      }
    } catch (e) {
      getLogger().error('Language detection failed:', e);
    }

    // اگر در Field mode هستیم، پس از language detection، sourceLang را auto-detect قرار می‌دهیم
    if (translateMode === TranslationMode.Field) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    // اگر در Subtitle mode هستیم، پس از language detection، sourceLang را auto-detect قرار می‌دهیم
    if (translateMode === TranslationMode.Subtitle) {
      sourceLang = AUTO_DETECT_VALUE;
    }
    // ▲▲▲ پایان منطق اختصاصی Google Translate ▲▲▲

    // --- JSON Mode Detection ---
    let isJsonMode = false;
    let originalJsonStruct;
    let textsToTranslate = [text];
    const context = `${this.providerName.toLowerCase()}-translate`;

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

    // --- URL Construction ---
    const apiUrl = await getGoogleTranslateUrlAsync();
    const sl =
      sourceLang === AUTO_DETECT_VALUE ? "auto" : this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    if (sl === tl && !isJsonMode) return text;

    const url = new URL(apiUrl);

    // بررسی تنظیمات دیکشنری - در Field mode هرگز دیکشنری نباشد
    const isDictionaryEnabled = await getEnableDictionaryAsync();
    const shouldIncludeDictionary =
      isDictionaryEnabled &&
      translateMode !== TranslationMode.Field &&
      translateMode !== TranslationMode.Subtitle;

    // ساخت query string دستی برای پشتیبانی از چندین dt
    const queryParams = [
      `client=gtx`,
      `sl=${sl}`,
      `tl=${tl}`,
      `dt=t`, // Translation text
    ];

    // فقط در صورت فعال بودن دیکشنری و غیرفیلد بودن translateMode، پارامتر bd اضافه شود
    if (shouldIncludeDictionary) {
      queryParams.push(`dt=bd`); // Dictionary data
    }

    queryParams.push(
      `q=${encodeURIComponent(textsToTranslate.join(TEXT_DELIMITER))}`
    );
    url.search = queryParams.join("&");

    // --- API Call using the centralized handler ---
    const result = await this._executeApiCall({
      url: url.toString(),
      fetchOptions: { method: "GET" },
      extractResponse: (data) => {
        // Check for valid Google Translate response structure
        if (!data?.[0]) {
          // Returning undefined will trigger an API_RESPONSE_INVALID error in _executeApiCall
          return undefined;
        }

        // Extract main translation
        const translatedText = data[0]
          .map((segment) => segment[0] || "")
          .join("");

        // Extract dictionary data if available and enabled (but never in Field mode)
        let candidateText = "";
        if (shouldIncludeDictionary && data[1]) {
          // data[1] contains dictionary information
          candidateText = data[1]
            .map((dict) => {
              const pos = dict[0] || ""; // Part of speech
              const terms = dict[1] || []; // Alternative translations
              return `${pos}${pos !== "" ? ": " : ""}${terms.join(", ")}\n`;
            })
            .join("");
        }

        return {
          resultText: translatedText,
          candidateText: candidateText.trim(),
        };
      },
      context: context,
    });

    // --- Response Processing ---
    if (isJsonMode) {
      const translatedParts = result.resultText.split(TEXT_DELIMITER);
      if (translatedParts.length !== originalJsonStruct.length) {
        getLogger().error('Google Translate: JSON reconstruction failed due to segment mismatch.');
        return result.resultText; // Fallback to returning the raw translated text
      }
      const translatedJson = originalJsonStruct.map((item, index) => ({
        ...item,
        text: translatedParts[index]?.trim() || "",
      }));
      return JSON.stringify(translatedJson, null, 2);
    } else {
      // Return both translation and dictionary data
      if (result.candidateText) {
        const formattedDictionary = this._formatDictionaryAsMarkdown(
          result.candidateText
        );
        return `${result.resultText}\n\n${formattedDictionary}`;
      }
      return result.resultText;
    }
  }
}
