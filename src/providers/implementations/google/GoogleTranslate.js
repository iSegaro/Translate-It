// src/core/providers/GoogleTranslateProvider.js
import { BaseProvider } from "@/providers/core/BaseProvider.js";
import {
  getGoogleTranslateUrlAsync,
  getEnableDictionaryAsync
} from "@/config.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

import { TranslationMode } from "@/config.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleTranslate');
const RELIABLE_DELIMITER = '\n\n---\n\n';

const langNameToCodeMap = {
  afrikaans: "af", albanian: "sq", arabic: "ar", azerbaijani: "az", belarusian: "be", bengali: "bn", bulgarian: "bg", catalan: "ca", cebuano: "ceb", "chinese (simplified)": "zh", chinese: "zh", croatian: "hr", czech: "cs", danish: "da", dutch: "nl", english: "en", estonian: "et", farsi: "fa", persian: "fa", filipino: "fil", finnish: "fi", french: "fr", german: "de", greek: "el", hebrew: "he", hindi: "hi", hungarian: "hu", indonesian: "id", italian: "it", japanese: "ja", kannada: "kn", kazakh: "kk", korean: "ko", latvian: "lv", lithuanian: "lt", malay: "ms", malayalam: "ml", marathi: "mr", nepali: "ne", norwegian: "no", odia: "or", pashto: "ps", polish: "pl", portuguese: "pt", punjabi: "pa", romanian: "ro", russian: "ru", serbian: "sr", sinhala: "si", slovak: "sk", slovenian: "sl", spanish: "es", swahili: "sw", swedish: "sv", tagalog: "tl", tamil: "ta", telugu: "te", thai: "th", turkish: "tr", ukrainian: "uk", urdu: "ur", uzbek: "uz", vietnamese: "vi",
};

export class GoogleTranslateProvider extends BaseProvider {
  static type = "translate";
  static description = "Free Google Translate service";
  static displayName = "Google Translate";
  static reliableJsonMode = true;
  static supportsDictionary = true;
  static CHAR_LIMIT = 3900;

  constructor() {
    super("GoogleTranslate");
  }

  _getLangCode(lang) {
    if (!lang || typeof lang !== "string") return "auto";
    const lowerCaseLang = lang.toLowerCase();
    return langNameToCodeMap[lowerCaseLang] || lowerCaseLang;
  }

  async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController = null) {
    const context = `${this.providerName.toLowerCase()}-translate`;
    const isDictionaryEnabled = await getEnableDictionaryAsync();
    // Dictionary should only be enabled for single-segment translations and NOT in Field mode.
    const shouldIncludeDictionary = isDictionaryEnabled && texts.length === 1 && translateMode !== TranslationMode.Field;

    const chunks = [];
    let currentChunk = [];
    let currentCharCount = 0;

    for (const text of texts) {
      const prospectiveCharCount = currentCharCount + text.length + RELIABLE_DELIMITER.length;
      if (currentChunk.length > 0 && prospectiveCharCount > GoogleTranslateProvider.CHAR_LIMIT) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentCharCount = 0;
      }
      currentChunk.push(text);
      currentCharCount += text.length + RELIABLE_DELIMITER.length;
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    const chunkPromises = chunks.map(async (chunk) => {
      const apiUrl = await getGoogleTranslateUrlAsync();
      const queryParams = new URLSearchParams({
        client: 'gtx',
        sl: sl,
        tl: tl,
        dt: 't',
      });

      if (shouldIncludeDictionary && chunk.length === 1) {
        queryParams.append('dt', 'bd');
      }

      const textToTranslate = chunk.join(RELIABLE_DELIMITER);
      const requestBody = `q=${encodeURIComponent(textToTranslate)}`;

      const result = await this._executeApiCall({
        url: `${apiUrl}?${queryParams.toString()}`,
        fetchOptions: {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: requestBody,
        },
        extractResponse: (data) => {
          if (!data?.[0]?.[0]?.[0]) {
            return { translatedSegments: chunk.map(() => ''), candidateText: '' };
          }

          const translatedText = data[0].map(segment => segment[0]).join('');
          const translatedSegments = translatedText.split(RELIABLE_DELIMITER);

          if (translatedSegments.length !== chunk.length) {
            logger.warn("[Google] Translated segment count mismatch after splitting.", { 
              expected: chunk.length, 
              got: translatedSegments.length 
            });
            return { translatedSegments: [translatedText], candidateText: '' };
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
    });

    const translatedChunks = await Promise.all(chunkPromises);
    const allTranslated = translatedChunks.flatMap(chunk => chunk.translatedSegments);

    if (texts.length !== allTranslated.length) {
        logger.error("[Google] Final translated text count does not match original count.",{
            original: texts.length,
            translated: allTranslated.length
        });
        return texts;
    }

    if (texts.length === 1 && translatedChunks[0]?.candidateText) {
        const formattedDictionary = this._formatDictionaryAsMarkdown(translatedChunks[0].candidateText);
        return [`${allTranslated[0]}\n\n${formattedDictionary}`];
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
