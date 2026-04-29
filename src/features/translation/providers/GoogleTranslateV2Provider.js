import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { TraditionalTextProcessor } from "./utils/TraditionalTextProcessor.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import {
  getProviderLanguageCode
} from "@/shared/config/languageConstants.js";
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

  // BaseTranslateProvider capabilities (Default values)
  // NOTE: Character limits and chunk sizes are now dynamically managed 
  // by ProviderConfigurations.js based on the active Optimization Level.
  static supportsStreaming = TRANSLATION_CONSTANTS.SUPPORTS_STREAMING.GOOGLE;
  static chunkingStrategy = TRANSLATION_CONSTANTS.CHUNKING_STRATEGIES.GOOGLE;
  static characterLimit = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.GOOGLE;
  static maxChunksPerBatch = TRANSLATION_CONSTANTS.MAX_CHUNKS_PER_BATCH.GOOGLE;

  constructor() {
    super(ProviderNames.GOOGLE_TRANSLATE_V2);
  }

  _getLangCode(lang) {
    if (!lang || lang === AUTO_DETECT_VALUE) return "auto";
    return getProviderLanguageCode(lang, 'GOOGLE');
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
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt, segmentCount, chunkIndex, totalChunks, options = {}) {
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

        // Capture detected source language if available (usually at index 2 or index 8)
        this._setDetectedLanguage(data[2] || (data[8] && data[8][0] && data[8][0][0]));

        // For single segments, keep existing stable behavior
        if (chunkTexts.length === 1) {
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
        }

        // For multiple segments, reconstruct the array to prevent delimiter leakage.
        // Google often splits our delimiters ([[---]]) and attaches brackets to adjacent text.
        const segments = data[0];
        const results = new Array(chunkTexts.length).fill("");
        let currentIdx = 0;
        let inDelimiterZone = false;

        for (const segment of segments) {
          const trans = segment[0] || "";
          const orig = segment[1] || "";
          
          // Identify if this segment is part of the delimiter pattern
          // Includes artifacts from all major providers: Bing (—–…ـ), Google (·・), and common dashes/dots
          const isDelimiterPart = /^[[\]\s\n\r.——–…ـ·・-]+$/.test(orig) && 
                                  (orig.includes('-') || orig.includes('.') || orig.includes('[') || orig.includes(']') || 
                                   orig.includes('—') || orig.includes('–') || orig.includes('…') || orig.includes('ـ') || 
                                   orig.includes('·') || orig.includes('・'));
          
          if (isDelimiterPart) {
            if (!inDelimiterZone) {
              currentIdx++;
              inDelimiterZone = true;
            }
            continue;
          }

          inDelimiterZone = false;
          if (currentIdx < results.length) {
            // Clean any delimiter remnants using centralized BIDI scrubbing
            const cleanTrans = TraditionalTextProcessor.scrubBidiArtifacts(trans);
            results[currentIdx] += cleanTrans;
          }
        }

        // Fallback: If reconstruction resulted in empty segments for non-empty originals
        // (which means Google merged segments unpredictably), fallback to joined string 
        // and let the robust SegmentMapper handle it.
        const hasEmpty = results.some((r, i) => !r.trim() && chunkTexts[i] && chunkTexts[i].trim());
        if (hasEmpty) {
          const joinedResult = data[0].map(segment => segment[0] || "").join('');
          return { translatedText: joinedResult, candidateText: "" };
        }

        return { translatedText: results, candidateText: "" };
      },
      context: 'googlev2-translate-chunk',
      abortController,
      sessionId: options.sessionId,
      charCount: this._calculateTraditionalCharCount(chunkTexts),
      originalCharCount: options.originalCharCount || TraditionalTextProcessor.calculateTraditionalCharCount(chunkTexts)
    });

    // Handle dictionary formatting for single segment
    if (chunkTexts.length === 1 && responseObj?.candidateText) {
      const formattedDictionary = this._formatDictionaryAsMarkdown(responseObj.candidateText);
      const translatedWithDict = `${responseObj.translatedText}\n\n${formattedDictionary}`;
      
      logger.info(`[GoogleV2] Translation with dictionary completed successfully`);
      return translatedWithDict;
    }

    // Return translated text. Coordinator will handle robust splitting for multiple segments.
    const finalResult = responseObj?.translatedText || chunkTexts.join(TRANSLATION_CONSTANTS.TEXT_DELIMITER);

    if (finalResult) {
      logger.info(`[GoogleV2] Translation completed successfully`);
    }

    return finalResult;
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
