import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { TraditionalTextProcessor, getTextInfo } from "./utils/TraditionalTextProcessor.js";
import { isolateNewlineChunks } from "./utils/NewlineChunkIsolation.js";
import { normalizeGoogleSlashDashArtifact } from "./utils/GoogleSlashDashNormalization.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import {
  getProviderLanguageCode
} from "@/shared/config/languageConstants.js";
import { AUTO_DETECT_VALUE } from "@/shared/constants/core.js";
import { getBrowserInfoSync } from "@/utils/browser/compatibility.js";
import {
  TranslationMode,
  getGoogleTranslateV2UrlAsync,
} from "@/shared/config/config.js";
import { formatGoogleDictionaryMarkdown } from "./utils/GoogleDictionaryMarkdownFormatter.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'GoogleTranslateV2');

function countExactDelimiters(value, delimiter) {
  if (typeof value !== 'string' || !delimiter) return 0;
  return value.split(delimiter).length - 1;
}

function isCollapsedResponseCandidate(translated, original, delimiter) {
  if (typeof translated !== 'string' || typeof original !== 'string') return false;
  if (original.trim() === delimiter.trim()) return false;
  return countExactDelimiters(original, delimiter) > 0
    && countExactDelimiters(translated, delimiter) > 0;
}

function normalizeCollapsedSourceText(value) {
  return String(value ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

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

  async _createChunks(texts) {
    const chunks = await super._createChunks(texts);
    return isolateNewlineChunks(chunks);
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
    
    const combinedText = chunkTexts
      .map(item => getTextInfo(item).text)
      .join(TRANSLATION_CONSTANTS.TEXT_DELIMITER);
    const tk = isStableClient ? null : this._generateToken(combinedText, tkk);

    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

        // Dictionary mode is explicitly requested by the translation engine
    const shouldIncludeDictionary = translateMode === TranslationMode.Dictionary_Translation;

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

    if (shouldIncludeDictionary) {
      params.dj = '1';
    }

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

    const chunkResponse = await this._executeApiCall({
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
          if (!data || (!data[0] && !data.sentences)) {
            const error = new Error('Google V2 response has invalid format');
            error.type = ErrorTypes.API_RESPONSE_INVALID;
            throw error;
          }

          // dj=1 uses data.src, legacy uses index 2 or index 8
          const detectedLanguage = data.src || data[2] || (data[8] && data[8][0] && data[8][0][0]);

          // For single segments, keep existing stable behavior but add JSON support
          if (chunkTexts.length === 1) {
            const sourceText = getTextInfo(chunkTexts[0]).text;

            // If dj=1 was used, data.sentences will exist
            if (data.sentences) {
              const translatedText = normalizeGoogleSlashDashArtifact(
                data.sentences
                .filter(s => s.trans)
                .map(s => s.trans)
                .join(''),
                sourceText
              );

              if (translatedText.trim()) this._setExecutionDetectedLanguage(options, detectedLanguage);

              // Pass the whole data object for rich markdown formatting
              const response = { translatedText, candidateText: shouldIncludeDictionary ? data : "" };
              return response;
            }

            // Fallback to legacy array format
            if (!Array.isArray(data[0])) {
              const error = new Error('Google V2 response has invalid segment data');
              error.type = ErrorTypes.API_RESPONSE_INVALID;
              throw error;
            }
            const translatedText = normalizeGoogleSlashDashArtifact(
              data[0].map(segment => segment[0] || "").join(''),
              sourceText
            );

            if (translatedText.trim()) this._setExecutionDetectedLanguage(options, detectedLanguage);

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
          // Multiple segments NEVER use dj=1 in our implementation, so we keep the legacy logic.
          const segments = data[0];
          if (!Array.isArray(segments)) {
            const error = new Error('Google V2 response has invalid segment data');
            error.type = ErrorTypes.API_RESPONSE_INVALID;
            throw error;
          }
          const results = new Array(chunkTexts.length).fill("");
          let currentIdx = 0;
          let inDelimiterZone = false;
          const collapsedCandidates = [];
          let malformedResponseRow = false;

          const delimiterToken = TRANSLATION_CONSTANTS.TEXT_DELIMITER.trim();
          for (const segment of segments) {
            if (segment == null) continue;
            if (!Array.isArray(segment)) {
              malformedResponseRow = true;
              continue;
            }

            const trans = segment[0] || "";
            const orig = segment[1] || "";

            if (isCollapsedResponseCandidate(trans, orig, TRANSLATION_CONSTANTS.TEXT_DELIMITER)) {
              collapsedCandidates.push({
                startIndex: currentIdx,
                original: orig,
                translated: trans,
              });
              continue;
            }

            const isStructuralDelimiter = orig.trim() === delimiterToken;

            if (isStructuralDelimiter) {
              if (!inDelimiterZone) {
                currentIdx++;
                inDelimiterZone = true;
              }
              continue;
            }

            // Delimiter-like orig WITH meaningful translated text is real content.
            // Also: any non-delimiter orig is real content. In both cases, write
            // the translation to the current logical slot.
            inDelimiterZone = false;
            if (currentIdx < results.length) {
              const cleanTrans = TraditionalTextProcessor.scrubBidiArtifacts(trans);
              results[currentIdx] += cleanTrans;
            }
          }

          let hasEmpty = results.some((r, i) => !r.trim() && chunkTexts[i] && getTextInfo(chunkTexts[i]).text.trim());
          if (hasEmpty && collapsedCandidates.length === 1 && !malformedResponseRow) {
            const candidate = collapsedCandidates[0];
            const originalParts = candidate.original.split(TRANSLATION_CONSTANTS.TEXT_DELIMITER);
            const translatedParts = candidate.translated.split(TRANSLATION_CONSTANTS.TEXT_DELIMITER);
            const spanLength = originalParts.length;
            const spanEnd = candidate.startIndex + spanLength;
            const sourceCollision = chunkTexts
              .slice(candidate.startIndex, spanEnd)
              .some((item) => getTextInfo(item).text.includes(TRANSLATION_CONSTANTS.TEXT_DELIMITER));
            const sourceSpan = chunkTexts.slice(candidate.startIndex, spanEnd);
            const originalMatchesSource = sourceSpan.length === originalParts.length
              && originalParts.every((part, index) => normalizeCollapsedSourceText(part)
                === normalizeCollapsedSourceText(getTextInfo(sourceSpan[index]).text));
            const overlapsOwnedOutput = results
              .slice(candidate.startIndex, spanEnd)
              .some((result) => result.trim().length > 0);
            const validCounts = spanLength > 1
              && translatedParts.length === spanLength
              && originalParts.length - 1 === countExactDelimiters(candidate.original, TRANSLATION_CONSTANTS.TEXT_DELIMITER)
              && translatedParts.length - 1 === countExactDelimiters(candidate.translated, TRANSLATION_CONSTANTS.TEXT_DELIMITER)
              && spanEnd <= chunkTexts.length
              && originalMatchesSource;

            if (validCounts && !sourceCollision && !overlapsOwnedOutput) {
              translatedParts.forEach((part, index) => {
                results[candidate.startIndex + index] = TraditionalTextProcessor.scrubBidiArtifacts(part);
              });
              hasEmpty = results.some((r, i) => !r.trim() && chunkTexts[i] && getTextInfo(chunkTexts[i]).text.trim());
            }
          }

          if (hasEmpty || malformedResponseRow) {
            const error = new Error('Google V2 response omitted a translated segment');
            error.type = ErrorTypes.API_RESPONSE_INVALID;
            throw error;
          }

          this._setExecutionDetectedLanguage(options, detectedLanguage);

          return { translatedText: results, candidateText: "" };
        },
        context: 'googlev2-translate-chunk',
        abortController,
        sessionId: options.sessionId,
        charCount: this._calculateTraditionalCharCount(chunkTexts),
        originalCharCount: options.originalCharCount || TraditionalTextProcessor.calculateTraditionalCharCount(chunkTexts),
        callPurpose: options.callPurpose
      });

      // Handle dictionary formatting for single segment
      if (chunkTexts.length === 1 && chunkResponse?.candidateText) {
        const formattedDictionary = await this._formatDictionaryAsMarkdown(chunkResponse.candidateText);
        const translatedWithDict = `${chunkResponse.translatedText}\n\n${formattedDictionary}`;

        logger.info(`[GoogleV2] Translation with dictionary completed successfully`);
        return translatedWithDict;
      }

      // Return translated text. Coordinator will handle robust splitting for multiple segments.
      const finalResult = chunkResponse?.translatedText;
      const hasInvalidArrayResult = Array.isArray(finalResult)
        && finalResult.some((item, index) => {
          if (typeof item !== 'string') return true;
          return !item.trim() && getTextInfo(chunkTexts[index]).text.trim();
        });
      if ((typeof finalResult !== 'string' && !Array.isArray(finalResult)) ||
          (typeof finalResult === 'string' && !finalResult.trim()) ||
          (Array.isArray(finalResult) && (finalResult.length === 0 || hasInvalidArrayResult))) {
        const error = new Error('Google V2 response has no translation text');
        error.type = ErrorTypes.API_RESPONSE_INVALID;
        throw error;
      }

      if (finalResult) {
        logger.info(`[GoogleV2] Translation completed successfully`);
      }

      return finalResult;
  }

  async _formatDictionaryAsMarkdown(candidateData) {
    return formatGoogleDictionaryMarkdown(candidateData);
  }
}
