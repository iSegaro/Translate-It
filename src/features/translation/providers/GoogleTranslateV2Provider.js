import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { LANGUAGE_NAME_TO_CODE_MAP } from "@/shared/config/languageConstants.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { getBrowserInfoSync } from "@/utils/browser/compatibility.js";
import {
  getEnableDictionaryAsync,
  TranslationMode,
  getGoogleTranslateV2UrlAsync
} from "@/shared/config/config.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleTranslateV2');

/**
 * Stable TKK value for Google Translate token generation.
 * This value is relatively stable and Google currently accepts it.
 * https://github.com/translate-tools/linguist-translators/blob/master/translators/generated/GoogleTokenFree.js
 */
const GOOGLE_TKK = '448487.932609646';

/**
 * Robust Google Translate Provider (V2)
 * Uses official-like client 't' with a stable TKK for TK token generation.
 * Similar architecture to MicrosoftEdgeProvider but optimized for stability.
 */
export class GoogleTranslateV2Provider extends BaseTranslateProvider {
  static type = "translate";
  static displayName = "Google Translate";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  static CHAR_LIMIT = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.GOOGLE;

  constructor() {
    super(ProviderNames.GOOGLE_TRANSLATE_V2);
  }

  _getLangCode(lang) {
    if (!lang || lang === AUTO_DETECT_VALUE) return "auto";
    const lowerCaseLang = lang.toLowerCase();
    return LANGUAGE_NAME_TO_CODE_MAP[lowerCaseLang] || lowerCaseLang;
  }

  /**
   * Ported logic for TK generation
   */
  _generateToken(text, tkk) {
    const b = (a, b) => {
      for (let d = 0; d < b.length - 2; d += 3) {
        let c = b.charAt(d + 2);
        c = "a" <= c ? c.charCodeAt(0) - 87 : Number(c);
        c = "+" == b.charAt(d + 1) ? a >>> c : a << c;
        a = "+" == b.charAt(d) ? a + c & 4294967295 : a ^ c;
      }
      return a;
    };

    let d = tkk.split(".");
    let e = Number(d[0]) || 0;
    let f = [];
    for (let g = 0, h = 0; h < text.length; h++) {
      let i = text.charCodeAt(h);
      128 > i ? f[g++] = i : (2048 > i ? f[g++] = i >> 6 | 192 : (55296 == (i & 64512) && h + 1 < text.length && 56320 == (text.charCodeAt(h + 1) & 64512) ? (i = 65536 + ((i & 1023) << 10) + (text.charCodeAt(++h) & 1023), f[g++] = i >> 18 | 240, f[g++] = i >> 12 & 63 | 128) : f[g++] = i >> 12 | 224, f[g++] = i >> 6 & 63 | 128), f[g++] = i & 63 | 128);
    }
    let a = e;
    for (let g = 0; g < f.length; g++) a += f[g], a = b(a, "+-a^+6");
    a = b(a, "+-3^+b+-f");
    a ^= Number(d[1]) || 0;
    0 > a && (a = (a & 2147483647) + 2147483648);
    a %= 1E6;
    return a.toString() + "." + (a ^ e);
  }

  /**
   * Implement translation for a single chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController) {
    const info = getBrowserInfoSync();
    const isStableClient = info.isFirefox || info.isMobile;
    
    // For Firefox/Mobile, we use client 'gtx' which is more stable and doesn't require complex tokens.
    // For Chrome, we use client 't' which provides richer dictionary data.
    const client = isStableClient ? 'gtx' : 't';
    const tkk = GOOGLE_TKK;
    
    const combinedText = chunkTexts.join(TRANSLATION_CONSTANTS.TEXT_DELIMITER);
    const tk = isStableClient ? null : this._generateToken(combinedText, tkk);

    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    const isDictionaryEnabled = await getEnableDictionaryAsync();
    // Dictionary should only be enabled for single-segment translations and NOT in Field, Select Element or Page mode.
    const isExcludedMode = translateMode === TranslationMode.Field || 
                          translateMode === TranslationMode.Page || 
                          translateMode === TranslationMode.Select_Element;

    const shouldIncludeDictionary = isDictionaryEnabled && 
                                    chunkTexts.length === 1 && 
                                    !isExcludedMode;

    const apiUrl = await getGoogleTranslateV2UrlAsync();
    const url = new URL(apiUrl);
    const params = {
      client: client,
      sl: sl,
      tl: tl,
      hl: tl,
      dt: ['at', 'bd', 'ex', 'ld', 'md', 'qca', 'rw', 'rm', 'ss', 't'],
      ie: 'UTF-8',
      oe: 'UTF-8',
      otf: '1',
      ssel: '0',
      tsel: '0',
      kc: '7'
    };

    if (tk) params.tk = tk;

    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => url.searchParams.append(key, v));
      } else {
        url.searchParams.set(key, value);
      }
    });

    const body = new URLSearchParams();
    body.append("q", combinedText);

    const responseObj = await this._executeApiCall({
      url: url.toString(),
      fetchOptions: {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "Accept": "*/*",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          "Referer": new URL(apiUrl).origin + "/",
          "Priority": "u=1, i"
        },
        body: body.toString()
      },
      extractResponse: (data) => {
        if (!data || !data[0]) {
          logger.warn('[GoogleV2] Empty or invalid response data');
          return { translatedText: "", candidateText: "" };
        }

        // Combine segments back
        const translatedText = data[0].map(segment => segment[0] || "").join('');
        
        let candidateText = "";
        if (shouldIncludeDictionary && data[1]) {
          candidateText = data[1].map((dict) => {
            const pos = dict[0] || "";
            const terms = dict[1] || [];
            return `${pos}${pos !== "" ? ": " : ""}${terms.join(", ")}\n`;
          }).join("");
        }

        return { translatedText, candidateText: candidateText.trim() };
      },
      context: 'googlev2-translate-chunk',
      abortController
    });

    // Use robust split logic from base class OUTSIDE extractResponse
    const translatedSegments = await this._robustSplit(responseObj.translatedText, chunkTexts);

    // Handle dictionary formatting for single segment
    if (chunkTexts.length === 1 && responseObj?.candidateText) {
      const formattedDictionary = this._formatDictionaryAsMarkdown(responseObj.candidateText);
      return [`${translatedSegments[0]}\n\n${formattedDictionary}`];
    }

    return translatedSegments || chunkTexts;
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

