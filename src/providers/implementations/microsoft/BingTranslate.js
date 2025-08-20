// src/providers/implementations/BingTranslateProvider.js
import { BaseProvider } from "@/providers/core/BaseProvider.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'BingTranslate');

import { LanguageSwappingService } from "@/providers/core/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";
import { ErrorTypes } from "@/error-management/ErrorTypes.js";
import { TranslationMode } from "@/config.js";

const TEXT_DELIMITER = "\n\n---\n\n";

// Bing language code mapping (based on the example.js.txt file)
const bingLangCode = {
  auto: "auto-detect",
  af: "af",
  am: "am",
  ar: "ar",
  az: "az",
  bg: "bg",
  bs: "bs",
  ca: "ca",
  cs: "cs",
  cy: "cy",
  da: "da",
  de: "de",
  el: "el",
  en: "en",
  es: "es",
  et: "et",
  fa: "fa",
  fi: "fi",
  fr: "fr",
  ga: "ga",
  gu: "gu",
  hi: "hi",
  hmn: "mww",
  hr: "hr",
  ht: "ht",
  hu: "hu",
  hy: "hy",
  id: "id",
  is: "is",
  it: "it",
  ja: "ja",
  kk: "kk",
  km: "km",
  kn: "kn",
  ko: "ko",
  ku: "ku",
  lo: "lo",
  lt: "lt",
  lv: "lv",
  mg: "mg",
  mi: "mi",
  ml: "ml",
  mr: "mr",
  ms: "ms",
  mt: "mt",
  my: "my",
  ne: "ne",
  nl: "nl",
  no: "nb",
  pa: "pa",
  pl: "pl",
  ps: "ps",
  ro: "ro",
  ru: "ru",
  sk: "sk",
  sl: "sl",
  sm: "sm",
  sq: "sq",
  sr: "sr-Cyrl",
  sv: "sv",
  sw: "sw",
  ta: "ta",
  te: "te",
  th: "th",
  tr: "tr",
  uk: "uk",
  ur: "ur",
  vi: "vi",
  iw: "he",
  tl: "fil",
  pt: "pt",
  "zh-CN": "zh-Hans",
  "zh-TW": "zh-Hant",
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

export class BingTranslateProvider extends BaseProvider {
  static type = "free";
  static description = "Bing Translator";
  static displayName = "Microsoft Bing";
  static reliableJsonMode = true;
  static bingBaseUrl = "https://www.bing.com/ttranslatev3";
  static bingTokenUrl = "https://www.bing.com/translator";
  static bingAccessToken = null;

  constructor() {
    super("BingTranslate");
  }

  async _translateChunk(chunk, sl, tl, tokenData, abortController = null) {
    // بررسی لغو درخواست قبل از ارسال
    if (abortController && abortController.signal.aborted) {
      logger.debug('[Bing] Translation chunk cancelled before request');
      const err = new Error('Translation cancelled by user');
      err.type = ErrorTypes.USER_CANCELLED;
      err.context = `${this.providerName.toLowerCase()}-chunk-cancel`;
      throw err;
    }

    try {
      const textToTranslate = chunk.join(TEXT_DELIMITER);
      const formData = new URLSearchParams({
        text: textToTranslate,
        fromLang: sl,
        to: tl,
        token: tokenData.token,
        key: tokenData.key,
      });
      const url = new URL(BingTranslateProvider.bingBaseUrl);
      url.searchParams.set("IG", tokenData.IG);
      url.searchParams.set("IID", tokenData.IID && tokenData.IID.length ? `${tokenData.IID}.${BingTranslateProvider.bingAccessToken.count++}` : "");
      url.searchParams.set("isVertical", "1");

      const result = await this._executeApiCall({
        url: url.toString(),
        fetchOptions: {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": navigator.userAgent,
          },
          body: formData,
          signal: abortController ? abortController.signal : undefined,
        },
        extractResponse: (data) => {
          if (data && data.statusCode === 400) {
            const err = new Error('Bing API returned status 400');
            err.name = 'BingApiError';
            throw err;
          }
          if (!data || !Array.isArray(data) || !data[0]) {
            return chunk.map(() => "");
          }
          const translationData = data[0];
          if (!translationData.translations || !Array.isArray(translationData.translations)) {
            return chunk.map(() => "");
          }
          const targetText = translationData.translations[0]?.text;
          if (!targetText) {
            return chunk.map(() => "");
          }
          // تقسیم ترجمه به بخش‌های جداگانه
          return targetText.split(TEXT_DELIMITER).map(t => t.trim());
        },
        context: `${this.providerName.toLowerCase()}-chunk-translate`,
        abortController: abortController,
      });

      if (abortController && abortController.signal.aborted) {
        logger.debug('[Bing] Translation chunk cancelled after request');
        const err = new Error('Translation cancelled by user');
        err.type = ErrorTypes.USER_CANCELLED;
        err.context = `${this.providerName.toLowerCase()}-chunk-cancel`;
        throw err;
      }
      return result || chunk.map(() => "");
    } catch (error) {
      if (error.name === 'BingApiError' || error instanceof SyntaxError) {
        logger.warn(`[Bing] A batch failed, likely due to content/size. Will attempt to split. Batch size: ${chunk.length}`);
        return null; // Signal failure to _batchTranslate
      }
      throw error;
    }
  }

  /**
   * ترجمه به صورت batch و مدیریت JSON/Plain
   */
  async _batchTranslate(textsToTranslate, sl, tl, tokenData, abortController = null) {
    // Map original texts to objects with index to preserve order
    const indexedTexts = textsToTranslate.map((text, index) => ({ index, text }));
    const finalResults = new Array(textsToTranslate.length);

    // 1. Create initial batches
    const initialBatches = [];
    let currentBatch = [];
    let currentBatchLen = 0;
    const charLimit = 1000;
    const segmentLimit = 25;

    for (const item of indexedTexts) {
      if (!item.text || !item.text.trim()) {
        finalResults[item.index] = ""; // Handle empty strings
        continue;
      }
      if (item.text.length > charLimit) {
        if (currentBatch.length > 0) initialBatches.push(currentBatch);
        initialBatches.push([item]);
        currentBatch = [];
        currentBatchLen = 0;
        continue;
      }
      const prospectiveLen = currentBatchLen + item.text.length + (currentBatch.length > 0 ? TEXT_DELIMITER.length : 0);
      if (currentBatch.length > 0 && (currentBatch.length >= segmentLimit || prospectiveLen > charLimit)) {
        initialBatches.push(currentBatch);
        currentBatch = [];
        currentBatchLen = 0;
      }
      currentBatch.push(item);
      currentBatchLen += item.text.length + (currentBatch.length > 1 ? TEXT_DELIMITER.length : 0);
    }
    if (currentBatch.length > 0) initialBatches.push(currentBatch);

    // 2. Process batches with a retry queue
    const processingQueue = [...initialBatches];
    while (processingQueue.length > 0) {
      if (abortController && abortController.signal.aborted) throw new Error("Translation cancelled");

      const batch = processingQueue.shift();
      const textsOnly = batch.map(item => item.text);
      const translatedSegments = await this._translateChunk(textsOnly, sl, tl, tokenData, abortController);

      if (translatedSegments !== null) {
        // Success, place results in correct positions
        if (translatedSegments.length === batch.length) {
          batch.forEach((item, i) => {
            finalResults[item.index] = translatedSegments[i];
          });
        } else {
          // Mismatch, mark all as failed to be safe
          batch.forEach(item => finalResults[item.index] = item.text);
        }
      } else {
        // Failure, split and re-queue if possible
        if (batch.length > 1) {
          const mid = Math.ceil(batch.length / 2);
          const firstHalf = batch.slice(0, mid);
          const secondHalf = batch.slice(mid);
          processingQueue.unshift(secondHalf, firstHalf); // Add to front of queue
        } else {
          // A single item failed, cannot split further. Mark as untranslated.
          const failedItem = batch[0];
          logger.error(`[Bing] Segment could not be translated: "${failedItem.text.substring(0, 100)}"...`);
          finalResults[failedItem.index] = failedItem.text; // Return original text
        }
      }
    }
    return finalResults;
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
   * Convert language name/code to Bing language code
   * @param {string} lang - Language name or code
   * @returns {string} - Bing language code
   */
  _getLangCode(lang) {
    if (!lang || typeof lang !== "string") return "auto-detect";
    const normalized = LanguageSwappingService._normalizeLangValue(lang);
    // ابتدا بررسی مقدار auto-detect
    if (normalized === AUTO_DETECT_VALUE) return "auto-detect";
    // ابتدا بررسی کد مستقیم
    if (bingLangCode[normalized]) return bingLangCode[normalized];
    // سپس بررسی نام زبان
    const lower = normalized.toLowerCase();
    if (langNameToCodeMap[lower] && bingLangCode[langNameToCodeMap[lower]]) {
      return bingLangCode[langNameToCodeMap[lower]];
    }
    // در نهایت مقدار ورودی را بازگردان
    return normalized;
  }

  /**
   * Get Bing access token (based on the example implementation)
   * @returns {Promise<Object>} - Token object with IG, IID, key, token
   */
  async _getBingAccessToken() {
    try {
      // If no access token or token is expired, get new token
      if (
        !BingTranslateProvider.bingAccessToken ||
        Date.now() - BingTranslateProvider.bingAccessToken.tokenTs >
          BingTranslateProvider.bingAccessToken.tokenExpiryInterval
      ) {
        logger.debug('[Bing] Fetching new access token...');
        const response = await fetch(BingTranslateProvider.bingTokenUrl);
        if (!response.ok) {
          logger.error(`[Bing] Token page fetch failed: ${response.status}`);
          const err = new Error(`Failed to fetch token page: ${response.status}`);
          err.type = ErrorTypes.API_KEY_MISSING;
          err.context = `${this.providerName.toLowerCase()}-token-fetch`;
          throw err;
        }
        const data = await response.text();
        // Extract token data using regex patterns from the example
        const igMatch = data.match(/IG:"([^"]+)"/);
        const iidMatch = data.match(/data-iid="([^"]+)"/);
        const paramsMatch = data.match(/params_AbusePreventionHelper\s?=\s?([^\]]+\])/);
        if (!igMatch || !iidMatch || !paramsMatch) {
          logger.error('[Bing] Token extraction failed.');
          const err = new Error("Failed to extract token parameters from Bing translator page");
          err.type = ErrorTypes.API_KEY_MISSING;
          err.context = `${this.providerName.toLowerCase()}-token-extract`;
          throw err;
        }
        const IG = igMatch[1];
        const IID = iidMatch[1];
        const [_key, _token, interval] = JSON.parse(paramsMatch[1]);
        BingTranslateProvider.bingAccessToken = {
          IG,
          IID,
          key: _key,
          token: _token,
          tokenTs: Date.now(),
          tokenExpiryInterval: interval,
          count: 0,
        };
        logger.debug('[Bing] New access token obtained.');
      }
      return BingTranslateProvider.bingAccessToken;
    } catch (error) {
      logger.error(`[Bing] Failed to get access token:`, error);
      if (!error.type) {
        error.type = ErrorTypes.API;
        error.context = `${this.providerName.toLowerCase()}-token-fetch`;
      }
      throw error;
    }
  }


  async translate(text, sourceLang, targetLang, translateMode = null, originalSourceLang = 'English', originalTargetLang = 'Farsi', abortController = null) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    // Language detection and swapping using centralized service
    [sourceLang, targetLang] = await LanguageSwappingService.applyLanguageSwapping(
      text, sourceLang, targetLang, originalSourceLang, originalTargetLang,
      { providerName: 'BingTranslate', useRegexFallback: true }
    );

    // Set auto-detect for Field and Subtitle modes after language detection
    if (translateMode === TranslationMode.Field || translateMode === TranslationMode.Subtitle) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    // Convert to Bing language codes
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    // Skip if same language
    if (sl === tl) return text;

    // JSON Mode Detection
    let isJsonMode = false;
    let originalJsonStruct;
    let textsToTranslate = [text];
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

    const context = `${this.providerName.toLowerCase()}-translate`;

    try {
      // Check if translation was cancelled before starting
      if (abortController && abortController.signal.aborted) {
        logger.debug('[Bing] Translation cancelled before starting');
        const err = new Error('Translation cancelled by user');
        err.type = ErrorTypes.USER_CANCELLED;
        err.context = context;
        throw err;
      }
      // Get access token
      const tokenData = await this._getBingAccessToken();
      // Check again after getting token
      if (abortController && abortController.signal.aborted) {
        logger.debug('[Bing] Translation cancelled after getting token');
        const err = new Error('Translation cancelled by user');
        err.type = ErrorTypes.USER_CANCELLED;
        err.context = context;
        throw err;
      }
      // ترجمه batch
      let translatedSegments = await this._batchTranslate(textsToTranslate, sl, tl, tokenData, abortController);
      if (isJsonMode) {
        if (translatedSegments.length !== originalJsonStruct.length) {
          logger.error('[Bing] JSON reconstruction failed due to segment mismatch.');
          return translatedSegments.join(TEXT_DELIMITER); // Fallback to raw translated text
        }
        const translatedJson = originalJsonStruct.map((item, index) => ({
          ...item,
          text: translatedSegments[index] || "",
        }));
        return JSON.stringify(translatedJson, null, 2);
      } else {
        return translatedSegments.join(TEXT_DELIMITER);
      }
    } catch (error) {
      if (error.type) {
        throw error;
      }
      // مدیریت خطاهای رایج Bing
      if (error.message?.includes("token") || error.message?.includes("Token")) {
        error.type = ErrorTypes.API_KEY_MISSING;
        error.context = `${this.providerName.toLowerCase()}-token-error`;
        logger.error('[Bing] API_KEY_MISSING:', error);
      } else if (error.message?.includes("rate limit") || error.message?.includes("quota")) {
        error.type = ErrorTypes.API_QUOTA_EXCEEDED;
        error.context = `${this.providerName.toLowerCase()}-quota-exceeded`;
        logger.error('[Bing] API_QUOTA_EXCEEDED:', error);
      } else {
        error.type = ErrorTypes.API;
        error.context = `${this.providerName.toLowerCase()}-translation-error`;
        logger.error('[Bing] API error:', error);
      }
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  static cleanup() {
    BingTranslateProvider.bingAccessToken = null;
  }

  /**
   * Reset session context (override parent method)
   */
  resetSessionContext() {
    super.resetSessionContext();
    BingTranslateProvider.cleanup();
  }
}
