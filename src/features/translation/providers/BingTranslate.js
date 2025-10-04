// src/providers/implementations/BingTranslateProvider.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'BingTranslate');
const TEXT_DELIMITER = "\n\n---\n\n";

const bingLangCode = {
  auto: "auto-detect", af: "af", am: "am", ar: "ar", az: "az", bg: "bg", bs: "bs", ca: "ca", cs: "cs", cy: "cy", da: "da", de: "de", el: "el", en: "en", es: "es", et: "et", fa: "fa", fi: "fi", fr: "fr", ga: "ga", gu: "gu", hi: "hi", hmn: "mww", hr: "hr", ht: "ht", hu: "hu", hy: "hy", id: "id", is: "is", it: "it", ja: "ja", kk: "kk", km: "km", kn: "kn", ko: "ko", ku: "ku", lo: "lo", lt: "lt", lv: "lv", mg: "mg", mi: "mi", ml: "ml", mr: "mr", ms: "ms", mt: "mt", my: "my", ne: "ne", nl: "nl", no: "nb", pa: "pa", pl: "pl", ps: "ps", ro: "ro", ru: "ru", sk: "sk", sl: "sl", sm: "sm", sq: "sq", sr: "sr-Cyrl", sv: "sv", sw: "sw", ta: "ta", te: "te", th: "th", tr: "tr", uk: "uk", ur: "ur", vi: "vi", iw: "he", tl: "fil", pt: "pt", "zh-CN": "zh-Hans", "zh-TW": "zh-Hant",
};

const langNameToCodeMap = {
  afrikaans: "af", albanian: "sq", arabic: "ar", azerbaijani: "az", belarusian: "be", bengali: "bn", bulgarian: "bg", catalan: "ca", cebuano: "ceb", "chinese (simplified)": "zh-CN", chinese: "zh-CN", croatian: "hr", czech: "cs", danish: "da", dutch: "nl", english: "en", estonian: "et", farsi: "fa", persian: "fa", filipino: "fil", finnish: "fi", french: "fr", german: "de", greek: "el", hebrew: "he", hindi: "hi", hungarian: "hu", indonesian: "id", italian: "it", japanese: "ja", kannada: "kn", kazakh: "kk", korean: "ko", latvian: "lv", lithuanian: "lt", malay: "ms", malayalam: "ml", marathi: "mr", nepali: "ne", norwegian: "no", odia: "or", pashto: "ps", polish: "pl", portuguese: "pt", punjabi: "pa", romanian: "ro", russian: "ru", serbian: "sr", sinhala: "si", slovak: "sk", slovenian: "sl", spanish: "es", swahili: "sw", swedish: "sv", tagalog: "tl", tamil: "ta", telugu: "te", thai: "th", turkish: "tr", ukrainian: "uk", urdu: "ur", uzbek: "uz", vietnamese: "vi",
};

export class BingTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static description = "Bing Translator";
  static displayName = "Microsoft Bing";
  static reliableJsonMode = false;
  static supportsDictionary = false;
  static bingBaseUrl = "https://www.bing.com/ttranslatev3";
  static bingTokenUrl = "https://www.bing.com/translator";
  static bingAccessToken = null;
  static CHAR_LIMIT = 800; // Reduced from 1000 to avoid API limits
  static CHUNK_SIZE = 15; // Reduced from 25 to avoid API limits
  
  // BaseTranslateProvider capabilities
  static supportsStreaming = true;
  static chunkingStrategy = 'character_limit';
  static characterLimit = 800; // Bing's character limit - reduced for reliability
  static maxChunksPerBatch = 15; // Bing's chunk size - reduced for reliability

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

  /**
   * Translate a single chunk of texts using Bing's API with enhanced error handling and retry
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {number} retryAttempt - Current retry attempt number (for recursive retries)
   * @param {number} originalChunkSize - Original chunk size before retry splitting
   * @param {number} chunkIndex - Index of this chunk in the batch
   * @param {number} totalChunks - Total number of chunks in the batch
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt = 0, originalChunkSize = chunkTexts.length) {
    const context = `${this.providerName.toLowerCase()}-translate-chunk${retryAttempt > 0 ? `-retry-${retryAttempt}` : ''}`;
    const { getProviderConfiguration } = await import('@/features/translation/core/ProviderConfigurations.js');
    const providerConfig = getProviderConfiguration(this.providerName);

    // Add key info log for translation start
    if (retryAttempt === 0) {
      logger.info(`[Bing] Starting translation: ${chunkTexts.join(' ').length} chars`);
    }

    try {
      // Validate chunk size before processing
      if (chunkTexts.length > this.constructor.maxChunksPerBatch) {
        logger.info(`[Bing] Chunk too large (${chunkTexts.length} > ${this.constructor.maxChunksPerBatch}), splitting`);
        // Split into smaller sub-chunks and preserve order
        const results = [];
        for (let i = 0; i < chunkTexts.length; i += this.constructor.maxChunksPerBatch) {
          const subChunk = chunkTexts.slice(i, i + this.constructor.maxChunksPerBatch);
          const subResults = await this._translateChunk(
            subChunk,
            sourceLang,
            targetLang,
            translateMode,
            abortController,
            retryAttempt,
            originalChunkSize,
            Math.floor(i / this.constructor.maxChunksPerBatch),
            Math.ceil(chunkTexts.length / this.constructor.maxChunksPerBatch)
          );
          results.push(...subResults);
        }
        return results;
      }
      
      // Get Bing access token
      const tokenData = await this._getBingAccessToken(abortController);
      
      if (abortController?.signal.aborted) {
        throw new Error('Translation cancelled by user');
      }

      const textToTranslate = chunkTexts.join(TEXT_DELIMITER);
      
      // Additional size validation
      if (textToTranslate.length > this.constructor.characterLimit * 2) {
        logger.info(`[Bing] Text too long (${textToTranslate.length} chars), may cause API error`);
        // Try to split by reducing chunk size
        if (chunkTexts.length > 1) {
          const midPoint = Math.ceil(chunkTexts.length / 2);
          const firstHalf = chunkTexts.slice(0, midPoint);
          const secondHalf = chunkTexts.slice(midPoint);
          
          const firstResults = await this._translateChunk(firstHalf, sourceLang, targetLang, translateMode, abortController);
          const secondResults = await this._translateChunk(secondHalf, sourceLang, targetLang, translateMode, abortController);
          
          return [...firstResults, ...secondResults];
        }
      }
      
      const formData = new URLSearchParams({
        text: textToTranslate, 
        fromLang: sourceLang, 
        to: targetLang, 
        token: tokenData.token, 
        key: tokenData.key,
      });

      const url = new URL(BingTranslateProvider.bingBaseUrl);
      url.searchParams.set("IG", tokenData.IG);
      url.searchParams.set("IID", tokenData.IID?.length ? `${tokenData.IID}.${BingTranslateProvider.bingAccessToken.count++}` : "");
      url.searchParams.set("isVertical", "1");

      // Enhanced API call with HTML response detection
      const result = await this._executeApiCall({
        url: url.toString(),
        fetchOptions: {
          method: "POST",
          headers: { 
            "Content-Type": "application/x-www-form-urlencoded", 
            "User-Agent": navigator.userAgent 
          },
          body: formData.toString(), // Convert URLSearchParams to string
        },
        extractResponse: async (response) => {
          // Check if response is HTML instead of JSON
          const contentType = response.headers.get('content-type');
          const responseText = await response.text();

          if (contentType && contentType.includes('text/html')) {
            logger.warn(`[Bing] Received HTML response instead of JSON. Chunk size: ${chunkTexts.length}`);
            const htmlError = new Error('Bing returned HTML response instead of JSON');
            htmlError.name = 'BingHtmlResponseError';
            htmlError.context = context;
            htmlError.chunkSize = chunkTexts.length;
            htmlError.retryAttempt = retryAttempt;
            throw htmlError;
          }

          // Try to parse as JSON
          let data;
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            logger.warn(`[Bing] JSON parsing failed: ${parseError.message}. Response length: ${responseText.length}`);

            // Check if response might be HTML despite content-type
            if (responseText.trim().startsWith('<')) {
              logger.warn(`[Bing] Response appears to be HTML despite content-type`);
              const htmlError = new Error('Bing returned HTML response (detected after parsing)');
              htmlError.name = 'BingHtmlResponseError';
              htmlError.context = context;
              htmlError.chunkSize = chunkTexts.length;
              htmlError.retryAttempt = retryAttempt;
              throw htmlError;
            }

            // Regular JSON parsing error
            const jsonError = new Error(`JSON parsing failed: ${parseError.message}`);
            jsonError.name = 'BingJsonParseError';
            jsonError.context = context;
            jsonError.chunkSize = chunkTexts.length;
            jsonError.retryAttempt = retryAttempt;
            jsonError.responseText = responseText.substring(0, 500); // Store first 500 chars for debugging
            throw jsonError;
          }

          if (data?.statusCode === 400) {
            const err = new Error('Bing API returned status 400');
            err.name = 'BingApiError';
            throw err;
          }
          
          const targetText = data?.[0]?.translations?.[0]?.text;
          if (typeof targetText !== 'string') {
            return chunkTexts.map(() => "");
          }
          
          let translatedSegments = targetText.split(TEXT_DELIMITER).map(t => t.trim());
          
          // Validate segment count match
          if (translatedSegments.length !== chunkTexts.length) {
            logger.debug("[Bing] Translated segment count mismatch after splitting.", { 
              expected: chunkTexts.length, 
              got: translatedSegments.length 
            });
            
            // Try alternative splitting strategies
            if (translatedSegments.length === 1 && chunkTexts.length > 1) {
              // If we got one big translation but expected multiple, try to split by common patterns
              const text = translatedSegments[0];
              
              // Try splitting by "---" (delimiter might have been translated)
              const altSplit1 = text.split(/\n*---\n*/);
              if (altSplit1.length === chunkTexts.length) {
                translatedSegments = altSplit1.map(t => t.trim());
                logger.debug("[Bing] Successfully recovered segments using alternative splitting");
              } else {
                // Try splitting by double newlines
                const altSplit2 = text.split(/\n\n+/);
                if (altSplit2.length === chunkTexts.length) {
                  translatedSegments = altSplit2.map(t => t.trim());
                  logger.debug("[Bing] Successfully recovered segments using newline splitting");
                } else {
                  // Last resort: distribute text evenly
                  logger.debug("[Bing] Using fallback: returning original text count with empty strings");
                  translatedSegments = chunkTexts.map((_, index) => index === 0 ? text : "");
                }
              }
            } else if (translatedSegments.length > chunkTexts.length) {
              // If we got too many segments, take only what we need
              translatedSegments = translatedSegments.slice(0, chunkTexts.length);
            } else {
              // If we got fewer segments than expected, pad with empty strings
              while (translatedSegments.length < chunkTexts.length) {
                translatedSegments.push("");
              }
            }
          }
          
          return translatedSegments;
        },
        context,
        abortController,
      });

      const finalResult = result || chunkTexts.map(() => "");

      // Add completion log for successful translation
      if (retryAttempt === 0 && finalResult.length > 0) {
        logger.info(`[Bing] Translation completed successfully`);
      }

      return finalResult;

    } catch (error) {
      // Handle HTML response and JSON parsing errors with retry
      if (error.name === 'BingHtmlResponseError' || error.name === 'BingJsonParseError') {
        const maxRetries = providerConfig?.batching?.maxRetries || 3;
        const minChunkSize = providerConfig?.batching?.minChunkSize || 100;
        const adaptiveChunking = providerConfig?.batching?.adaptiveChunking || true;

        logger.warn(`[Bing] ${error.name} on attempt ${retryAttempt + 1}/${maxRetries + 1}. Chunk size: ${error.chunkSize || chunkTexts.length}`);

        // Check if we should retry with smaller chunks
        if (adaptiveChunking && retryAttempt < maxRetries && chunkTexts.length > 1) {
          // Calculate new chunk size with exponential backoff
          const reductionFactor = Math.pow(2, retryAttempt + 1);
          const newChunkSize = Math.max(
            Math.ceil(chunkTexts.length / reductionFactor),
            minChunkSize
          );

          // Retrying with smaller chunks

          try {
            // Split into smaller chunks and retry while preserving order
            const results = [];
            const subChunkCount = Math.ceil(chunkTexts.length / newChunkSize);

            for (let i = 0; i < chunkTexts.length; i += newChunkSize) {
              const subChunk = chunkTexts.slice(i, i + newChunkSize);
              const subChunkIndex = Math.floor(i / newChunkSize);

              const subResults = await this._translateChunk(
                subChunk,
                sourceLang,
                targetLang,
                translateMode,
                abortController,
                retryAttempt + 1,
                originalChunkSize,
                subChunkIndex,
                subChunkCount
              );

              // Place results in correct position
              results.push(...subResults);

              // Add delay between retries to avoid rate limiting
              if (i + newChunkSize < chunkTexts.length) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryAttempt + 1)));
              }
            }

            // Retry successful
            return results;

          } catch (retryError) {
            logger.error(`[Bing] Retry attempt ${retryAttempt + 1} failed:`, retryError);
            // Continue to throw the original error
          }
        }

        // If we've exhausted retries or can't split further, throw a properly typed error
        const finalError = new Error(
          error.name === 'BingHtmlResponseError'
            ? 'Bing consistently returned HTML instead of JSON'
            : `Bing JSON parsing consistently failed after ${retryAttempt + 1} attempts`
        );
        finalError.name = error.name;
        finalError.type = error.name === 'BingHtmlResponseError'
          ? ErrorTypes.HTML_RESPONSE_ERROR
          : ErrorTypes.JSON_PARSING_ERROR;
        finalError.context = context;
        finalError.chunkSize = chunkTexts.length;
        finalError.retryAttempt = retryAttempt;
        finalError.originalChunkSize = originalChunkSize;

        throw finalError;
      }

      if (error.name === 'BingApiError' || error instanceof SyntaxError) {
        logger.warn(`[Bing] Chunk translation failed, will be handled by fallback. Chunk size: ${chunkTexts.length}`);
        // Let BaseTranslateProvider handle the error and fallback
        throw error;
      }

      // Handle token-related errors and other errors with proper typing
      if (!error.type) {
        if (error.message?.includes("token")) {
          error.type = ErrorTypes.API_KEY_MISSING;
        } else if (error.message?.includes("rate limit") || error.message?.includes("quota")) {
          error.type = ErrorTypes.API_QUOTA_EXCEEDED;
        } else {
          error.type = ErrorTypes.API;
        }
      }

      error.context = context;
      throw error;
    }
  }

  async _getBingAccessToken(abortController) {
    try {
      if (abortController?.signal.aborted) {
        throw new Error('Translation cancelled');
      }
      
      if (!BingTranslateProvider.bingAccessToken || 
          Date.now() - BingTranslateProvider.bingAccessToken.tokenTs > BingTranslateProvider.bingAccessToken.tokenExpiryInterval) {
        logger.debug('[Bing] Fetching new access token...');
        
        const response = await fetch(BingTranslateProvider.bingTokenUrl, { 
          signal: abortController?.signal 
        });
        
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
          logger.debug('[Bing] Fetched HTML for token:', data.substring(0, 1000));
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