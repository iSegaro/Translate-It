// src/providers/implementations/BingTranslateProvider.js
import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/constants.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'BingTranslate');
const TEXT_DELIMITER = "\n\n---\n\n";

const bingLangCode = {
  auto: "auto-detect", af: "af", am: "am", ar: "ar", az: "az", bg: "bg", bs: "bs", ca: "ca", cs: "cs", cy: "cy", da: "da", de: "de", el: "el", en: "en", es: "es", et: "et", fa: "fa", fi: "fi", fr: "fr", ga: "ga", gu: "gu", hi: "hi", hmn: "mww", hr: "hr", ht: "ht", hu: "hu", hy: "hy", id: "id", is: "is", it: "it", ja: "ja", kk: "kk", km: "km", kn: "kn", ko: "ko", ku: "ku", lo: "lo", lt: "lt", lv: "lv", mg: "mg", mi: "mi", ml: "ml", mr: "mr", ms: "ms", mt: "mt", my: "my", ne: "ne", nl: "nl", no: "nb", pa: "pa", pl: "pl", ps: "ps", ro: "ro", ru: "ru", sk: "sk", sl: "sl", sm: "sm", sq: "sq", sr: "sr-Cyrl", sv: "sv", sw: "sw", ta: "ta", te: "te", th: "th", tr: "tr", uk: "uk", ur: "ur", vi: "vi", iw: "he", tl: "fil", pt: "pt", "zh-CN": "zh-Hans", "zh-TW": "zh-Hant",
};

const langNameToCodeMap = {
  afrikaans: "af", albanian: "sq", arabic: "ar", azerbaijani: "az", belarusian: "be", bengali: "bn", bulgarian: "bg", catalan: "ca", cebuano: "ceb", "chinese (simplified)": "zh-CN", chinese: "zh-CN", croatian: "hr", czech: "cs", danish: "da", dutch: "nl", english: "en", estonian: "et", farsi: "fa", persian: "fa", filipino: "fil", finnish: "fi", french: "fr", german: "de", greek: "el", hebrew: "he", hindi: "hi", hungarian: "hu", indonesian: "id", italian: "it", japanese: "ja", kannada: "kn", kazakh: "kk", korean: "ko", latvian: "lv", lithuanian: "lt", malay: "ms", malayalam: "ml", marathi: "mr", nepali: "ne", norwegian: "no", odia: "or", pashto: "ps", polish: "pl", portuguese: "pt", punjabi: "pa", romanian: "ro", russian: "ru", serbian: "sr", sinhala: "si", slovak: "sk", slovenian: "sl", spanish: "es", swahili: "sw", swedish: "sv", tagalog: "tl", tamil: "ta", telugu: "te", thai: "th", turkish: "tr", ukrainian: "uk", urdu: "ur", uzbek: "uz", vietnamese: "vi",
};

export class BingTranslateProvider extends BaseProvider {
  static type = "translate";
  static description = "Bing Translator";
  static displayName = "Microsoft Bing";
  static reliableJsonMode = true;
  static supportsDictionary = false;
  static bingBaseUrl = "https://www.bing.com/ttranslatev3";
  static bingTokenUrl = "https://www.bing.com/translator";
  static bingAccessToken = null;
  static CHAR_LIMIT = 1000;
  static CHUNK_SIZE = 25; // Bing's segment limit per request

  constructor() {
    super("BingTranslate");
  }

  _getLangCode(lang) {
    const normalized = LanguageSwappingService._normalizeLangValue(lang);
    if (normalized === AUTO_DETECT_VALUE) return "auto-detect";
    if (bingLangCode[normalized]) return bingLangCode[normalized];
    const lower = normalized.toLowerCase();
    if (langNameToCodeMap[lower] && bingLangCode[langNameToCodeMap[lower]]) {
      return bingLangCode[langNameToCodeMap[lower]];
    }
    return normalized;
  }

  async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController) {
    logger.debug(`[Bing] _batchTranslate: engine is ${engine === this ? 'this' : engine}`);
    try {
      if (engine.isCancelled(messageId)) throw new Error("Translation cancelled");
      const tokenData = await this._getBingAccessToken(engine, messageId, abortController);
      if (engine.isCancelled(messageId)) throw new Error("Translation cancelled");

      const indexedTexts = texts.map((text, index) => ({ index, text }));
      const finalResults = new Array(texts.length);

      const initialBatches = [];
      let currentBatch = [];
      let currentBatchLen = 0;

      for (const item of indexedTexts) {
        if (!item.text?.trim()) {
          finalResults[item.index] = "";
          continue;
        }
        if (item.text.length > BingTranslateProvider.CHAR_LIMIT) {
          if (currentBatch.length > 0) initialBatches.push(currentBatch);
          initialBatches.push([item]);
          currentBatch = [];
          currentBatchLen = 0;
          continue;
        }
        const prospectiveLen = currentBatchLen + item.text.length + (currentBatch.length > 0 ? TEXT_DELIMITER.length : 0);
        if (currentBatch.length > 0 && (currentBatch.length >= BingTranslateProvider.CHUNK_SIZE || prospectiveLen > BingTranslateProvider.CHAR_LIMIT)) {
          initialBatches.push(currentBatch);
          currentBatch = [];
          currentBatchLen = 0;
        }
        currentBatch.push(item);
        currentBatchLen += item.text.length + (currentBatch.length > 1 ? TEXT_DELIMITER.length : 0);
      }
      if (currentBatch.length > 0) initialBatches.push(currentBatch);

      const processingQueue = [...initialBatches];
      while (processingQueue.length > 0) {
        logger.debug(`[Bing] Loop start. Aborted: ${engine.isCancelled(messageId)}`);
        if (engine.isCancelled(messageId)) throw new Error("Translation cancelled");

        const batch = processingQueue.shift();
        const textsOnly = batch.map(item => item.text);
        const translatedSegments = await this._translateChunk(textsOnly, sl, tl, tokenData, abortController);

        if (translatedSegments !== null) {
          if (translatedSegments.length === batch.length) {
            batch.forEach((item, i) => { finalResults[item.index] = translatedSegments[i]; });
          } else {
            batch.forEach(item => finalResults[item.index] = item.text);
          }
        } else {
          if (batch.length > 1) {
            const mid = Math.ceil(batch.length / 2);
            processingQueue.unshift(batch.slice(mid), batch.slice(0, mid));
          } else {
            const failedItem = batch[0];
            logger.error(`[Bing] Segment could not be translated: "${failedItem.text.substring(0, 100)}"...`);
            finalResults[failedItem.index] = failedItem.text;
          }
        }
      }
      return finalResults;
    } catch (error) {
      if (error.type) throw error;
      if (error.message?.includes("token")) {
        error.type = ErrorTypes.API_KEY_MISSING;
      } else if (error.message?.includes("rate limit") || error.message?.includes("quota")) {
        error.type = ErrorTypes.API_QUOTA_EXCEEDED;
      } else {
        error.type = ErrorTypes.API;
      }
      error.context = `${this.providerName.toLowerCase()}-translation-error`;
      logger.error('[Bing] Translation error:', error);
      throw error;
    }
  }

  async _translateChunk(chunk, sl, tl, tokenData, abortController) {
    if (abortController?.signal.aborted) {
      throw new Error('Translation cancelled by user');
    }
    try {
      const textToTranslate = chunk.join(TEXT_DELIMITER);
      const formData = new URLSearchParams({
        text: textToTranslate, fromLang: sl, to: tl, token: tokenData.token, key: tokenData.key,
      });
      const url = new URL(BingTranslateProvider.bingBaseUrl);
      url.searchParams.set("IG", tokenData.IG);
      url.searchParams.set("IID", tokenData.IID?.length ? `${tokenData.IID}.${BingTranslateProvider.bingAccessToken.count++}` : "");
      url.searchParams.set("isVertical", "1");

      logger.debug(`[Bing] _translateChunk execute. Aborted: ${abortController?.signal.aborted}`);
      const result = await this._executeApiCall({
        url: url.toString(),
        fetchOptions: {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": navigator.userAgent },
          body: formData,
          signal: abortController?.signal,
        },
        extractResponse: (data) => {
          if (data?.statusCode === 400) {
            const err = new Error('Bing API returned status 400');
            err.name = 'BingApiError';
            throw err;
          }
          const targetText = data?.[0]?.translations?.[0]?.text;
          if (typeof targetText !== 'string') return chunk.map(() => "");
          return targetText.split(TEXT_DELIMITER).map(t => t.trim());
        },
        context: `${this.providerName.toLowerCase()}-chunk-translate`,
        abortController,
      });
      return result || chunk.map(() => "");
    } catch (error) {
      if (error.name === 'BingApiError' || error instanceof SyntaxError) {
        logger.warn(`[Bing] A batch failed, likely due to content/size. Will attempt to split. Batch size: ${chunk.length}`);
        return null; // Signal failure to _batchTranslate
      }
      throw error;
    }
  }

  async _getBingAccessToken(engine, messageId, abortController) {
    try {
      if (engine.isCancelled(messageId)) {
        throw new Error('Translation cancelled');
      }
      if (!BingTranslateProvider.bingAccessToken || Date.now() - BingTranslateProvider.bingAccessToken.tokenTs > BingTranslateProvider.bingAccessToken.tokenExpiryInterval) {
        logger.debug('[Bing] Fetching new access token...');
        const response = await fetch(BingTranslateProvider.bingTokenUrl, { signal: abortController?.signal });
        if (!response.ok) {
          const err = new Error(`Failed to fetch token page: ${response.status}`);
          err.type = ErrorTypes.API_KEY_MISSING;
          throw err;
        }
        const data = await response.text();

        const igMatch = data.match(/IG:"([^"]+)"/);
        const iidMatch = data.match(/EventID:"([^"]+)"/);
        const paramsMatch = data.match(/var params_AbusePreventionHelper\s?=\s?(\[.*?\]);/);

        if (!igMatch || !iidMatch || !paramsMatch) {
          logger.error('[Bing] Failed to extract token parameters. HTML might have changed.');
          logger.debug('[Bing] Fetched HTML for token:', data);
          throw new Error("Failed to extract token parameters from Bing translator page");
        }

        const IG = igMatch[1];
        const IID = iidMatch[1];
        const params = JSON.parse(paramsMatch[1]);
        const [_key, _token, interval] = params;

        BingTranslateProvider.bingAccessToken = {
          IG: IG,
          IID: IID,
          key: _key,
          token: _token,
          tokenTs: Date.now(),
          tokenExpiryInterval: interval,
          count: 0,
        };
        logger.debug('[Bing] New access token obtained successfully.');
      }
      return BingTranslateProvider.bingAccessToken;
    } catch (error) {
      logger.error(`[Bing] Failed to get access token:`, error);
      if (!error.type) error.type = ErrorTypes.API;
      error.context = `${this.providerName.toLowerCase()}-token-fetch`;
      throw error;
    }
  }

  static cleanup() {
    BingTranslateProvider.bingAccessToken = null;
  }

  resetSessionContext() {
    super.resetSessionContext();
    BingTranslateProvider.cleanup();
  }
}