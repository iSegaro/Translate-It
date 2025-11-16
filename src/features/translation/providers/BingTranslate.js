// src/providers/implementations/BingTranslateProvider.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { TranslationSegmentMapper } from "@/utils/translation/TranslationSegmentMapper.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { PROVIDER_LANGUAGE_MAPPINGS, getProviderLanguageCode } from "@/shared/config/languageConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'BingTranslate');

export class BingTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static description = "Bing Translator";
  static displayName = "Microsoft Bing";
  static reliableJsonMode = false;
  static supportsDictionary = false;
  static bingBaseUrl = "https://www.bing.com/ttranslatev3";
  static bingTokenUrl = "https://www.bing.com/translator";
  static bingAccessToken = null;
  static CHAR_LIMIT = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.BING;
  static CHUNK_SIZE = 15; // Reduced from 25 to avoid API limits

  // BaseTranslateProvider capabilities
  static supportsStreaming = TRANSLATION_CONSTANTS.SUPPORTS_STREAMING.BING;
  static chunkingStrategy = TRANSLATION_CONSTANTS.CHUNKING_STRATEGIES.BING;
  static characterLimit = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.BING; // Bing's character limit - reduced for reliability
  static maxChunksPerBatch = TRANSLATION_CONSTANTS.MAX_CHUNKS_PER_BATCH.BING; // Bing's chunk size - reduced for reliability

  constructor() {
    super("BingTranslate");
  }

  _getLangCode(lang) {
    const normalized = LanguageSwappingService._normalizeLangValue(lang);
    if (normalized === AUTO_DETECT_VALUE) return PROVIDER_LANGUAGE_MAPPINGS.BING.auto;

    // Use the utility function to get the provider-specific language code
    return getProviderLanguageCode(normalized, 'BING') || normalized;
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

      const textToTranslate = chunkTexts.join(TRANSLATION_CONSTANTS.TEXT_DELIMITER);
      
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
          
          let translatedSegments = targetText.split(TRANSLATION_CONSTANTS.TEXT_DELIMITER).map(t => t.trim());
          
          // Validate segment count match
          if (translatedSegments.length !== chunkTexts.length) {
            logger.debug("[Bing] Translated segment count mismatch after splitting.", { 
              expected: chunkTexts.length, 
              got: translatedSegments.length 
            });
            
            // Try alternative splitting strategies
            if (translatedSegments.length === 1 && chunkTexts.length > 1) {
              // If we got one big translation but expected multiple, try enhanced mapping
              const text = translatedSegments[0];

              // Use enhanced mapping similar to GoogleTranslate
              const mappedSegments = TranslationSegmentMapper.mapTranslationToOriginalSegments(
                text,
                chunkTexts,
                TRANSLATION_CONSTANTS.TEXT_DELIMITER,
                'BingTranslate'
              );

              if (mappedSegments.length === chunkTexts.length) {
                translatedSegments = mappedSegments;
                logger.info("[Bing] Successfully mapped translation to original segments");
              } else {
                // Use the utility's fallback method
                translatedSegments = TranslationSegmentMapper.createAlternativeFallback(
                  text,
                  chunkTexts,
                  'BingTranslate'
                );
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