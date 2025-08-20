// src/core/providers/GoogleTranslateProvider.js
import { BaseProvider } from "@/providers/core/BaseProvider.js";
import {
  getGoogleTranslateUrlAsync,
  getEnableDictionaryAsync,
  TranslationMode
} from "@/config.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { LanguageSwappingService } from "@/providers/core/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleTranslate');

// A simple map for converting full language names to Google Translate's codes.
const langNameToCodeMap = {
  afrikaans: "af", albanian: "sq", arabic: "ar", azerbaijani: "az", belarusian: "be", bengali: "bn", bulgarian: "bg", catalan: "ca", cebuano: "ceb", "chinese (simplified)": "zh", chinese: "zh", croatian: "hr", czech: "cs", danish: "da", dutch: "nl", english: "en", estonian: "et", farsi: "fa", persian: "fa", filipino: "fil", finnish: "fi", french: "fr", german: "de", greek: "el", hebrew: "he", hindi: "hi", hungarian: "hu", indonesian: "id", italian: "it", japanese: "ja", kannada: "kn", kazakh: "kk", korean: "ko", latvian: "lv", lithuanian: "lt", malay: "ms", malayalam: "ml", marathi: "mr", nepali: "ne", norwegian: "no", odia: "or", pashto: "ps", polish: "pl", portuguese: "pt", punjabi: "pa", romanian: "ro", russian: "ru", serbian: "sr", sinhala: "si", slovak: "sk", slovenian: "sl", spanish: "es", swahili: "sw", swedish: "sv", tagalog: "tl", tamil: "ta", telugu: "te", thai: "th", turkish: "tr", ukrainian: "uk", urdu: "ur", uzbek: "uz", vietnamese: "vi",
};

export class GoogleTranslateProvider extends BaseProvider {
  static type = "free";
  static description = "Free Google Translate service";
  static displayName = "Google Translate";
  static reliableJsonMode = true;
  static CHAR_LIMIT = 3900;
  static CHUNK_SIZE = 20;

  constructor() {
    super("GoogleTranslate");
  }

  _getLangCode(lang) {
    if (!lang || typeof lang !== "string") return "auto";
    const lowerCaseLang = lang.toLowerCase();
    return langNameToCodeMap[lowerCaseLang] || lowerCaseLang;
  }

  async _batchTranslate(texts, sl, tl, abortController = null) {
    const context = `${this.providerName.toLowerCase()}-translate`;
    const isDictionaryEnabled = await getEnableDictionaryAsync();
    // Note: translateMode is not available here, so we make a conservative guess.
    // Dictionary is less useful for batch/JSON mode, so we can disable it.
    const shouldIncludeDictionary = isDictionaryEnabled && texts.length === 1;

    const translateChunk = async (chunk) => {
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
            logger.warn("[Google] Translated segment count mismatch.", { expected: chunk.length, got: translatedSegments.length });
            // Fallback: return empty strings to avoid crashing the reconstruction.
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
        context: `${context}-chunk`,
        abortController,
      });
      return result || { translatedSegments: chunk.map(() => ''), candidateText: '' };
    };

    // Since Google Translate can take a single large query, we can process all texts in one go if under limit.
    // However, for simplicity and consistency, we use the batching logic.
    const allTranslated = await this._processInBatches(
      texts,
      async (chunk) => {
        const { translatedSegments } = await translateChunk(chunk);
        return translatedSegments;
      },
      {
        CHUNK_SIZE: GoogleTranslateProvider.CHUNK_SIZE,
        CHAR_LIMIT: GoogleTranslateProvider.CHAR_LIMIT,
      }
    );

    // Handle dictionary for single, non-JSON translations
    if (texts.length === 1) {
      const { candidateText } = await translateChunk(texts);
      if (candidateText) {
        const formattedDictionary = this._formatDictionaryAsMarkdown(candidateText);
        return [`${allTranslated[0]}\n\n${formattedDictionary}`];
      }
    }

    return allTranslated;
  }

  _formatDictionaryAsMarkdown(candidateText) {
    if (!candidateText || candidateText.trim() === "") {
      return "";
    }
    const lines = candidateText.trim().split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) return "";

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
        markdownOutput += `**${line.trim()}**\n\n`;
      }
    });
    return markdownOutput.trim();
  }
}
