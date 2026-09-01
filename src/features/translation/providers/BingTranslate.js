// src/providers/implementations/BingTranslateProvider.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { createOperationAbortError } from "@/features/translation/providers/BaseProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/shared/constants/core.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { matchErrorToType, isFatalError } from '@/shared/error-management/ErrorMatcher.js';
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { PROVIDER_LANGUAGE_MAPPINGS, getProviderLanguageCode } from "@/shared/config/languageConstants.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { TraditionalTextProcessor, getTextInfo } from "./utils/TraditionalTextProcessor.js";
import { getProviderConfiguration } from "@/features/translation/core/ProviderConfigurations.js";
import { getProviderOptimizationLevelAsync } from "@/shared/config/config.js";
import { proxyManager } from "@/shared/proxy/ProxyManager.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'BingTranslate');
const BING_TOKEN_CONTEXT = 'bingtranslate-token-fetch';

function createBingTokenError(message, type, statusCode) {
  const error = new Error(message);
  error.type = type;
  error.context = BING_TOKEN_CONTEXT;
  if (statusCode !== undefined) error.statusCode = statusCode;
  return error;
}

function classifyBingTokenStatus(status) {
  if (status === 429) return ErrorTypes.RATE_LIMIT_REACHED;
  if ([500, 502, 503, 504].includes(status)) return ErrorTypes.SERVER_ERROR;
  if (status === 403) return ErrorTypes.FORBIDDEN_ERROR;
  return ErrorTypes.HTTP_ERROR;
}

function createInvalidBingTokenResponseError(message) {
  return createBingTokenError(message, ErrorTypes.API_RESPONSE_INVALID);
}

function normalizeBingTokenFetchError(error, abortController) {
  if (error?.operationAborted || error?.type === ErrorTypes.USER_CANCELLED) return error;

  if (error?.name === 'AbortError' || abortController?.signal?.aborted) {
    return createOperationAbortError(abortController?.signal, 'Bing token request aborted');
  }

  const normalizedError = error || new Error('Bing token request failed');
  if (!normalizedError.type || normalizedError.type === ErrorTypes.API_ERROR) {
    normalizedError.type = ErrorTypes.NETWORK_ERROR;
  }
  return normalizedError;
}

export class BingTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static description = "Bing Translator";
  static displayName = "Microsoft Bing";
  static reliableJsonMode = false;
  static supportsDictionary = false;
  static bingBaseUrl = "https://www.bing.com/ttranslatev3";
  static bingTokenUrl = "https://www.bing.com/translator";
  static bingAccessToken = null;

  // BaseTranslateProvider capabilities (Default values)
  // NOTE: Character limits and chunk sizes are now dynamically managed 
  // by ProviderConfigurations.js based on the active Optimization Level.
  static characterLimit = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.BING;
  static maxChunksPerBatch = TRANSLATION_CONSTANTS.MAX_CHUNKS_PER_BATCH.BING;

  // BaseTranslateProvider capabilities
  static supportsStreaming = TRANSLATION_CONSTANTS.SUPPORTS_STREAMING.BING;
  static chunkingStrategy = TRANSLATION_CONSTANTS.CHUNKING_STRATEGIES.BING;

  constructor() {
    super(ProviderNames.BING_TRANSLATE);
  }

  _getLangCode(lang) {
    const normalized = LanguageSwappingService._normalizeLangValue(lang);
    if (normalized === AUTO_DETECT_VALUE) return PROVIDER_LANGUAGE_MAPPINGS.BING.auto;

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
   * @param {number} segmentCount - Total number of segments in this chunk
   * @param {number} chunkIndex - Index of this chunk in the batch
   * @param {number} totalChunks - Total number of chunks in the batch
   * @param {Object} options - Additional options (sessionId, originalCharCount)
   * @returns {Promise<string>} - Translated raw string for this chunk
   */
   async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt, segmentCount, chunkIndex, totalChunks, options = {}) {

    const context = `${this.providerName.toLowerCase()}-translate-chunk${retryAttempt > 0 ? `-retry-${retryAttempt}` : ''}`;

    // Fetch user's preferred optimization level using the standard async utility
    const optimizationLevel = await getProviderOptimizationLevelAsync(this.providerName);

    const providerConfig = getProviderConfiguration(this.providerName, optimizationLevel);

    // Add key info log for translation start
    if (retryAttempt === 0) {
      logger.info(`[Bing] Starting translation: ${chunkTexts.reduce((s, t) => s + getTextInfo(t).length, 0)} chars (Level: ${optimizationLevel})`);
    }

    try {
      // Get Bing access token
      const tokenData = await this._getBingAccessToken(abortController);
      
      if (abortController?.signal?.aborted) {
        throw createOperationAbortError(abortController.signal, 'Bing translation aborted after token acquisition');
      }

      const textToTranslate = chunkTexts
        .map(item => getTextInfo(item).text)
        .join(TRANSLATION_CONSTANTS.TEXT_DELIMITER);
      
      const sl = this._getLangCode(sourceLang);
      const tl = this._getLangCode(targetLang);

      const formData = new URLSearchParams({
        text: textToTranslate, 
        fromLang: sl, 
        to: tl, 
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
            logger.debug(`[Bing] Received HTML response instead of JSON. Chunk size: ${chunkTexts.length}`);
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
            logger.debug(`[Bing] JSON parsing failed: ${parseError.message}. Response length: ${responseText.length}`);

            // Check if response might be HTML despite content-type
            if (responseText.trim().startsWith('<')) {
              logger.debug(`[Bing] Response appears to be HTML despite content-type`);
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
            err.type = ErrorTypes.HTTP_ERROR;
            err.statusCode = 400;
            throw err;
          }

          const targetText = data?.[0]?.translations?.[0]?.text;
          if (typeof targetText !== 'string' || !targetText.trim()) {
            const error = new Error('Bing response contained no translation text');
            error.type = ErrorTypes.API_RESPONSE_INVALID;
            throw error;
          }

          this._setExecutionDetectedLanguage(options, data?.[0]?.detectedLanguage?.language);
          
          // Return raw text string. 
          // Centralized TranslationSegmentMapper will handle robust splitting, 
          // delimiter normalization, and BIDI-aware scrubbing for multiple segments.
          return targetText;
          },

        context,
        abortController,
        charCount: TraditionalTextProcessor.calculateTraditionalCharCount(chunkTexts),
        sessionId: options.sessionId,
        originalCharCount: options.originalCharCount || TraditionalTextProcessor.calculateTraditionalCharCount(chunkTexts),
        callPurpose: options.callPurpose
      });

      // If result is a string and we have multiple segments, let Coordinator split it.
      // If we are in a recursive call, we might need to wrap it in an array for the parent.
      if (!result || (typeof result === 'string' && !result.trim())) {
        const error = new Error('Bing response contained no translation text');
        error.type = ErrorTypes.API_RESPONSE_INVALID;
        throw error;
      }
      const finalResult = typeof result === 'string' ? [result] : result;

      // Add completion log for successful translation
      if (retryAttempt === 0 && finalResult.length > 0) {
        logger.info(`[Bing] Translation completed successfully`);
      }

      return finalResult;

    } catch (error) {
      const errorType = error.type || matchErrorToType(error);
      
      // Handle HTML response and JSON parsing errors with existing adaptive recovery.
      if (error.name === 'BingHtmlResponseError' || error.name === 'BingJsonParseError') {
        const maxRetries = providerConfig?.batching?.maxRetries ?? 3;
        const adaptiveChunking = providerConfig?.batching?.adaptiveChunking ?? true;

        logger.warn(`[Bing] ${error.name} on attempt ${retryAttempt + 1}/${maxRetries + 1}. Chunk size: ${chunkTexts.length}. Reason: ${error.message}`);

        if (adaptiveChunking && retryAttempt < maxRetries && chunkTexts.length > 1) {
          // Calculate new chunk size - halving it is usually the most effective way to bypass Bing's 400 errors
          const newChunkSize = Math.max(
            Math.ceil(chunkTexts.length / 2),
            1 // Safety minimum
          );

          logger.info(`[Bing] Retrying with smaller chunks (Size: ${newChunkSize}) due to ${error.name}`);

          try {
            const results = [];
            for (let i = 0; i < chunkTexts.length; i += newChunkSize) {
              // Check for cancellation before processing each sub-chunk
              if (abortController?.signal?.aborted) {
                throw createOperationAbortError(abortController.signal, 'Bing translation aborted during adaptive retry');
              }

              const subChunk = chunkTexts.slice(i, i + newChunkSize);
              const subResults = await this._translateChunk(
                subChunk,
                sourceLang,
                targetLang,
                translateMode,
                abortController,
                retryAttempt + 1,
                segmentCount,
                0, // Index reset for sub-chunks
                0, // Total reset
                options
              );
              results.push(...subResults);
            }
            return results;
          } catch (retryError) {
            logger.error(`[Bing] Adaptive chunking failed for ${error.name}:`, retryError.message);
            throw retryError;
          }
        }

        throw error;
      }

      const isFatal = isFatalError(error) || isFatalError(errorType);
      // CRITICAL: If it's a fatal error, don't attempt any retries
      if (isFatal) {
        if (!error.type) error.type = errorType;
        throw error;
      }

      if (error.name === 'BingApiError' || error instanceof SyntaxError) {
        logger.debug(`[Bing] Chunk translation failed, will be handled by fallback. Chunk size: ${chunkTexts.length}`);
        // Ensure type is set
        if (!error.type) error.type = errorType;
        // Let BaseTranslateProvider handle the error and fallback
        throw error;
      }

      error.context = context;
      if (!error.type) error.type = errorType;
      throw error;
    }
  }

  async _getBingAccessToken(abortController) {
    try {
      if (abortController?.signal.aborted) {
        throw createOperationAbortError(abortController.signal, 'Bing token request aborted before execution');
      }
      
      if (!BingTranslateProvider.bingAccessToken || 
          Date.now() - BingTranslateProvider.bingAccessToken.tokenTs > BingTranslateProvider.bingAccessToken.tokenExpiryInterval) {
        logger.debug('[Bing] Fetching new access token...');
        
        let response;
        try {
          const proxyConfig = await this._initializeProxy();
          response = await proxyManager.fetch(
            BingTranslateProvider.bingTokenUrl,
            { signal: abortController?.signal },
            proxyConfig,
            { allowHtmlResponse: true },
          );
        } catch (fetchError) {
          throw normalizeBingTokenFetchError(fetchError, abortController);
        }
        
        if (!response.ok) {
          throw createBingTokenError(
            `Failed to fetch token page: ${response.status}`,
            classifyBingTokenStatus(response.status),
            response.status
          );
        }
        
        let data;
        try {
          data = await response.text();
        } catch (bodyError) {
          throw normalizeBingTokenFetchError(bodyError, abortController);
        }

        if (typeof data !== 'string') {
          throw createInvalidBingTokenResponseError('Bing token response body is invalid');
        }

        const igMatch = data.match(/IG:"([^"]+)"/);
        const iidMatch = data.match(/EventID:"([^"]+)"/);
        const paramsMatch = data.match(/var params_AbusePreventionHelper\s?=\s?(\[.*?\]);/);

        if (!igMatch || !iidMatch || !paramsMatch) {
          logger.error('[Bing] Failed to extract token parameters. HTML might have changed.', {
            responseLength: data.length,
          });
          throw createInvalidBingTokenResponseError('Bing token response missing required parameters');
        }

        const IG = igMatch[1];
        const IID = iidMatch[1];
        let params;
        try {
          params = JSON.parse(paramsMatch[1]);
        } catch {
          throw createInvalidBingTokenResponseError('Bing token response parameters are invalid');
        }

        if (!Array.isArray(params) || params.length < 3) {
          throw createInvalidBingTokenResponseError('Bing token response parameters are incomplete');
        }

        const [_key, _token, tokenExpiryInterval] = params;
        if (!IG || !IID
          || typeof _key !== 'number' || !Number.isFinite(_key) || _key <= 0
          || typeof _token !== 'string' || !_token
          || typeof tokenExpiryInterval !== 'number'
          || !Number.isFinite(tokenExpiryInterval) || tokenExpiryInterval <= 0) {
          throw createInvalidBingTokenResponseError('Bing token response contains unusable token data');
        }

        BingTranslateProvider.bingAccessToken = {
          IG: IG,
          IID: IID,
          key: _key,
          token: _token,
          tokenTs: Date.now(),
          tokenExpiryInterval,
          count: 0,
        };
        
        logger.debug('[Bing] New access token obtained successfully.');
      }
      
      return BingTranslateProvider.bingAccessToken;
    } catch (error) {
      logger.error(`[Bing] Failed to get access token:`, error);
      if (!error.context) error.context = BING_TOKEN_CONTEXT;
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
