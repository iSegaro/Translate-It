// src/core/providers/GoogleTranslateProvider.js
import { BaseProvider } from "@/providers/core/BaseProvider.js";
import { 
  getGoogleTranslateUrlAsync,
  getEnableDictionaryAsync,
  TranslationMode 
} from "@/config.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleTranslate');

import { LanguageSwappingService } from "@/providers/core/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";

// (logger already imported above)





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
  static type = "free";
  static description = "Free Google Translate service";
  static displayName = "Google Translate";
  static reliableJsonMode = true;
  static CHAR_LIMIT = 1500;
  static CHUNK_SIZE = 20;
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


  async translate(text, sourceLang, targetLang, translateMode = null, originalSourceLang = 'English', originalTargetLang = 'Farsi') {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    [sourceLang, targetLang] = await LanguageSwappingService.applyLanguageSwapping(
      text, sourceLang, targetLang, originalSourceLang, originalTargetLang,
      { providerName: 'GoogleTranslate', useRegexFallback: true }
    );

    if (translateMode === TranslationMode.Field || translateMode === TranslationMode.Subtitle) {
      sourceLang = AUTO_DETECT_VALUE;
    }

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

    const sl = sourceLang === AUTO_DETECT_VALUE ? "auto" : this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    if (sl === tl && !isJsonMode) return text;

    const isDictionaryEnabled = await getEnableDictionaryAsync();
    const shouldIncludeDictionary = isDictionaryEnabled && translateMode !== TranslationMode.Field && translateMode !== TranslationMode.Subtitle;

    const _translateJsonChunk = async (chunk) => {
      const apiUrl = await getGoogleTranslateUrlAsync();
      const url = new URL(apiUrl);
      const queryParams = [
        `client=gtx`,
        `sl=${sl}`,
        `tl=${tl}`,
        `dt=t`,
      ];
      if (shouldIncludeDictionary) {
        queryParams.push(`dt=bd`);
      }
      
      const textToTranslate = chunk.join('\n');
      queryParams.push(`q=${encodeURIComponent(textToTranslate)}`);

      url.search = queryParams.join("&");

      const result = await this._executeApiCall({
        url: url.toString(),
        fetchOptions: { method: "GET" },
        extractResponse: (data) => {
          if (!data?.[0]) {
            return { translatedSegments: chunk.map(() => ''), candidateText: '' };
          }
          const translatedText = data[0].map((segment) => segment[0] || "").join('');
          const translatedSegments = translatedText.split('\n');

          if (translatedSegments.length !== chunk.length) {
            return { translatedSegments: chunk.map(() => ''), candidateText: '' };
          }

          let candidateText = "";
          if (shouldIncludeDictionary && data[1]) {
            candidateText = data[1].map((dict) => {
              const pos = dict[0] || "";
              const terms = dict[1] || [];
              return `${pos}${pos !== "" ? ": " : ""}${terms.join(", ")}\n`;
            }).join("");
          }
          return {
            translatedSegments,
            candidateText: candidateText.trim(),
          };
        },
        context: `${context}-chunk`
      });
      return result || { translatedSegments: chunk.map(() => ''), candidateText: '' };
    };

    if (isJsonMode) {
      const translatedSegments = await this._processInBatches(
        textsToTranslate,
        async (chunk) => {
          const { translatedSegments } = await _translateJsonChunk(chunk);
          return translatedSegments;
        },
        {
          CHUNK_SIZE: GoogleTranslateProvider.CHUNK_SIZE,
          CHAR_LIMIT: GoogleTranslateProvider.CHAR_LIMIT,
        }
      );

      const flattenedSegments = translatedSegments.flat();

      const translatedJson = originalJsonStruct.map((item, index) => ({
        ...item,
        text: flattenedSegments[index] || "",
      }));
      return JSON.stringify(translatedJson, null, 2);
    } else {
      const { translatedSegments, candidateText } = await _translateJsonChunk(textsToTranslate);
      const resultText = translatedSegments.join('');
      if (candidateText) {
        const formattedDictionary = this._formatDictionaryAsMarkdown(candidateText);
        return `${resultText}\n\n${formattedDictionary}`;
      }
      return resultText;
    }
  }
}