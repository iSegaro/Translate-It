// src/providers/core/BaseTranslationProvider.js

import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { matchErrorToType, isFatalError } from "@/shared/error-management/ErrorMatcher.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { TranslationMode } from "@/shared/config/config.js";
import { proxyManager } from "@/shared/proxy/ProxyManager.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { ApiKeyManager } from "@/features/translation/providers/ApiKeyManager.js";
import { getBrowserInfoSync } from "@/utils/browser/compatibility.js";

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'BaseProvider');

/**
 * Base class for all translation providers.
 * Provides a centralized translation workflow, error handling, and common utilities.
 */
export class BaseProvider {
  constructor(providerName) {
    this.providerName = providerName;
    this.sessionContext = null;
    this.providerSettingKey = null; // To be set by subclasses that use API keys
    this._initializeProxy();
  }

  /**
   * Internal helper to adapt request headers based on the environment (Browser/Platform)
   * This is crucial for stability in Firefox and Mobile browsers where some headers
   * like Sec-Fetch-* or Referer might cause issues or are ignored.
   * @protected
   */
  _prepareHeaders(headers = {}, providerName = "") {
    const info = getBrowserInfoSync();
    const finalHeaders = { ...headers };

    // 1. Remove Chrome-only sensitive headers if not in a Chromium-based browser
    // Firefox might block or fail requests if we try to set these "Forbidden Headers"
    if (info.isFirefox || info.isMobile) {
      delete finalHeaders['Sec-Fetch-Dest'];
      delete finalHeaders['Sec-Fetch-Mode'];
      delete finalHeaders['Sec-Fetch-Site'];
      delete finalHeaders['Sec-Fetch-User'];
      delete finalHeaders['Sec-Fetch-Storage-Access'];
      
      // Some providers like Google Translate V2 use a Referer that Firefox blocks 
      // when set manually in a fetch request from an extension.
      if (info.isFirefox) {
        delete finalHeaders['Referer'];
      }
    }

    // 2. Identity Spoofing for specific providers in non-native environments
    // For Microsoft Edge provider, we MUST look like Edge/Chromium to get tokens
    if (providerName === ProviderNames.MICROSOFT_EDGE && (info.isFirefox || info.isMobile)) {
      finalHeaders['User-Agent'] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
    }

    return finalHeaders;
  }

  /**
   * Initialize proxy configuration from settings
   * @private
   */
  async _initializeProxy() {
    try {
      const { getSettingsAsync } = await import("@/shared/config/config.js");
      const settings = await getSettingsAsync();

      // Always set config - enabled or disabled
      proxyManager.setConfig({
        enabled: settings.PROXY_ENABLED || false,
        type: settings.PROXY_TYPE || 'http',
        host: settings.PROXY_HOST || '',
        port: settings.PROXY_PORT || 8080,
        auth: {
          username: settings.PROXY_USERNAME || '',
          password: settings.PROXY_PASSWORD || ''
        }
      });
    } catch (error) {
      logger.warn(`[${this.providerName}] Failed to initialize proxy:`, error);
    }
  }

  // By default providers are considered "not reliably returning JSON-mode"
  // Consumers can opt-in by setting `static reliableJsonMode = true` on the provider class.
  static reliableJsonMode = false;
  static supportsDictionary = false;

  /**
   * Orchestrates the entire translation process.
   * This method handles language swapping, JSON mode detection, batching, and result formatting.
   * Subclasses should NOT override this method. Instead, they must implement `_batchTranslate` and `_getLangCode`.
   * @param {string} text - Text to translate (can be plain text or a specific JSON string)
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {string} originalSourceLang - Original source language before any swapping
   * @param {string} originalTargetLang - Original target language before any swapping
   * @param {AbortController} abortController - Optional abort controller for cancellation
   * @returns {Promise<string|null>} - Translated text or null if no translation was needed
   */
  async translate(text, sourceLang, targetLang, options) {
    const {
      mode: translateMode,
      originalSourceLang,
      originalTargetLang,
      messageId,
      engine,
    } = typeof options === 'object' && options !== null ? options : { mode: options };

    const abortController = (messageId && engine) ? engine.activeTranslations.get(messageId) : null;

    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    // IMPORTANT: Set Field/Subtitle mode BEFORE language swapping
    // 1. LanguageSwappingService needs sourceLang=AUTO_DETECT_VALUE to work properly
    if (translateMode === TranslationMode.Field || translateMode === TranslationMode.Subtitle) {
      sourceLang = AUTO_DETECT_VALUE;
    }

    // 2. Language swapping and normalization (after Field mode is set)
    [sourceLang, targetLang] = await LanguageSwappingService.applyLanguageSwapping(
      text, sourceLang, targetLang, originalSourceLang, originalTargetLang,
      { providerName: this.providerName, useRegexFallback: true }
    );

    // 3. Convert to provider-specific language codes
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);

    if (sl === tl) return text;

    // 4. JSON Mode Detection
    let isJsonMode = false;
    let originalJsonStruct;
    let textsToTranslate = [text];

    try {
      const parsed = JSON.parse(text);
      if (this._isSpecificTextJsonFormat(parsed)) {
        isJsonMode = true;
        originalJsonStruct = parsed;
        textsToTranslate = originalJsonStruct.map((item) => item.text || '');
        logger.debug(`[${this.providerName}] JSON mode detected with ${textsToTranslate.length} segments.`);
      }
    } catch {
      // Not a valid JSON, proceed in plain text mode.
    }

    // 5. Perform batch translation using the subclass implementation
    const priority = options?.priority || (await import("@/features/translation/core/RateLimitManager.js")).TranslationPriority.NORMAL;
    const translatedSegments = await this._batchTranslate(textsToTranslate, sl, tl, translateMode, engine, messageId, abortController, priority);

    // 6. Reconstruct the final output
    if (isJsonMode) {
      if (translatedSegments.length !== originalJsonStruct.length) {
        logger.error(`[${this.providerName}] JSON reconstruction failed due to segment mismatch.`);
        // Fallback: return a simple join of translated segments
        return translatedSegments.join('\n');
      }
      const translatedJson = originalJsonStruct.map((item, index) => ({
        ...item,
        text: translatedSegments[index] || "",
      }));
      return JSON.stringify(translatedJson, null, 2);
    } else {
      // For plain text, there's only one segment
      return translatedSegments[0];
    }
  }

  /**
   * Abstract method for batch translating an array of texts.
   * Each provider MUST implement this method to handle its specific API logic for batching requests.
   * @param {string[]} texts - An array of strings to be translated.
   * @param {string} sourceLang - Provider-specific source language code.
   * @param {string} targetLang - Provider-specific target language code.
   * @param {string} translateMode - The mode of translation (e.g., 'Field', 'Selection').
   * @param {object} engine - The translation engine instance.
   * @param {string} messageId - The message ID for cancellation.
   * @param {AbortController} abortController - Optional abort controller for cancellation.
   * @returns {Promise<string[]>} - A promise that resolves to an array of translated strings.
   * @protected
   */
  async _batchTranslate(/*texts, sourceLang, targetLang, translateMode, engine, messageId, abortController*/) {
    throw new Error(`_batchTranslate method must be implemented by ${this.constructor.name}`);
  }

  /**
   * Abstract method for converting a language name/code to the provider's specific code.
   * @param {string} lang - The language name or standard code (e.g., 'English', 'en', 'auto').
   * @returns {string} The provider-specific language code.
   * @protected
   */
  _getLangCode(/* lang */) {
    throw new Error(`_getLangCode method must be implemented by ${this.constructor.name}`);
  }

  /**
   * Checks if the input is a JSON object in the specific format `[{ text: "..." }]`.
   * @param {*} obj - The object to check.
   * @returns {boolean} - True if it matches the format.
   * @protected
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
   * Abstract method for image translation - implemented by AI providers only
   * @param {string} imageData - Base64 encoded image data
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @returns {Promise<string>} - Translated text extracted from image
   */
  async translateImage() {
    throw new Error(`translateImage method not supported by ${this.constructor.name}`);
  }

  /**
   * UNIFIED API REQUEST HANDLER
   * The primary method for all providers to execute API calls.
   * Handles: Fetch, Proxy, Response Normalization, Failover (if keys available), and Error Reporting.
   * 
   * @param {Object} params
   * @param {string} params.url - Endpoint URL
   * @param {Object} params.fetchOptions - Request options (headers, body, etc.)
   * @param {Function} params.extractResponse - Function to parse valid response data
   * @param {string} params.context - Context for error reporting
   * @param {AbortController} [params.abortController] - For cancellation
   * @param {Function} [params.updateApiKey] - Callback to update key in options for failover
   * @param {boolean} [params.silent] - If true, don't show toast on error
   * @returns {Promise<any>}
   */
  async _executeRequest({ url, fetchOptions, extractResponse, context, abortController, updateApiKey, silent = false }) {
    // 1. Determine how many attempts we should make based on available keys
    let availableKeysCount = 1;
    if (this.providerSettingKey && updateApiKey) {
      try {
        const keys = await ApiKeyManager.getKeys(this.providerSettingKey);
        // Try all available keys, but cap at 10 for safety
        availableKeysCount = Math.min(Math.max(1, keys.length), 10);
      } catch (e) {
        logger.warn(`[${this.providerName}] Failed to count keys for failover:`, e);
      }
    }

    let lastError = null;
    let currentUrl = url;

    for (let attempt = 0; attempt < availableKeysCount; attempt++) {
      try {
        // 2. Perform actual API call
        const result = await this._executeApiCall({ 
          url: currentUrl, 
          fetchOptions, 
          extractResponse, 
          context, 
          abortController 
        });

        // 3. Success! Promote the working key
        if (attempt > 0 && this.providerSettingKey) {
          const authHeader = fetchOptions.headers?.Authorization || fetchOptions.headers?.authorization;
          const currentKey = authHeader ? authHeader.replace(/^(Bearer |DeepL-Auth-Key )/i, '') : 
                           (new URL(currentUrl).searchParams.get('key'));
          
          if (currentKey) {
            await ApiKeyManager.promoteKey(this.providerSettingKey, currentKey);
            logger.info(`[${this.providerName}] Failover successful on attempt ${attempt + 1}, key promoted.`);
          }
        }

        return result;

      } catch (error) {
        lastError = error;

        // 4. Check for cancellation (silent)
        const errorType = error.type || matchErrorToType(error);
        if (errorType === ErrorTypes.USER_CANCELLED || errorType === ErrorTypes.TRANSLATION_CANCELLED) {
          throw error;
        }

        // 5. Handle Failover if we have more keys to try
        if (attempt < availableKeysCount - 1 && ApiKeyManager.shouldFailover(error)) {
          const keys = await ApiKeyManager.getKeys(this.providerSettingKey);
          if (keys.length > attempt + 1) {
            logger.warn(`[${this.providerName}] Key error, attempting failover (${attempt + 1}/${availableKeysCount})`);
            const nextKey = keys[attempt + 1];
            await updateApiKey(nextKey, fetchOptions);
            
            // Handle Gemini specific URL update
            if (fetchOptions.url && fetchOptions.url !== currentUrl) {
              currentUrl = fetchOptions.url;
            } else if (this.providerName === ProviderNames.GEMINI) {
              const urlObj = new URL(currentUrl);
              urlObj.searchParams.set('key', nextKey);
              currentUrl = urlObj.toString();
            }
            continue; 
          }
        }

        // 6. Final error handling via ErrorHandler (if no more keys or not a failover error)
        const { ErrorHandler } = await import("@/shared/error-management/ErrorHandler.js");
        const errorHandler = ErrorHandler.getInstance();
        
        if (!error.type) error.type = errorType;

        await errorHandler.handle(error, {
          context,
          provider: this.providerName,
          showToast: !silent,
          isSilent: silent
        });

        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Executes a fetch call and normalizes HTTP, API-response-invalid, and network errors.
   * Internal helper for _executeRequest.
   * @private
   */
  async _executeApiCall({ url, fetchOptions, extractResponse, context, abortController }) {
    logger.debug(`_executeApiCall starting for context: ${context}`);
    // URL and fetchOptions logged at TRACE level to avoid exposing sensitive data

    try {
      const finalFetchOptions = { ...fetchOptions };
      if (abortController) {
        finalFetchOptions.signal = abortController.signal;
      }

      // Adapt headers for the current environment
      if (finalFetchOptions.headers) {
        finalFetchOptions.headers = this._prepareHeaders(finalFetchOptions.headers, this.providerName);
      }

      // Ensure proxy is initialized with latest settings before request
      await this._initializeProxy();

      // Use proxy manager for the request
      const response = await proxyManager.fetch(url, finalFetchOptions);
      logger.debug(`_executeApiCall response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        let body = {};
        try {
          body = await response.json();
                } catch {
          // Ignore if body is not JSON
        }
        const msg = body.detail || body.error?.message || response.statusText || `HTTP ${response.status}`;

        // For DeepL, HTTP 400 is a retryable error (too many segments), use debug level
        const isDeepL400 = this.providerName === ProviderNames.DEEPL_TRANSLATE && response.status === 400;
        // For server errors (502, 503, 524), use warn level instead of error - these are temporary server issues
        const isServerError = response.status >= 500 && response.status < 600;
        const logLevel = isDeepL400 || isServerError ? 'warn' : 'error';
        logger[logLevel](`[${this.providerName}] _executeApiCall HTTP error:`, {
          status: response.status,
          message: msg,
          url: url,
          // Log full error body for DeepL 400 errors to diagnose the issue
          ...(isDeepL400 && { errorBody: body })
        });

        // Determine error type centrally based on status code, message, and response body
        // Pass providerType to differentiate between AI and traditional providers
        const errorType = matchErrorToType({ 
          statusCode: response.status, 
          message: msg, 
          providerType: this.constructor.type,
          ...body 
        });

        const err = new Error(msg);
        err.type = errorType;
        err.statusCode = response.status;
        err.context = context;
        err.providerName = this.providerName;
        throw err;
      }

      // Enhanced content type handling
      const contentType = response.headers.get('content-type');

      // Check if extractResponse is async OR expects the raw response object (length > 2)
      // For these cases, we MUST NOT consume the body beforehand (e.g., via response.json())
      // because the handler might want to call response.text() or handle streaming itself.
      const isAsyncHandler = extractResponse.constructor.name === 'AsyncFunction';
      const wantsRawResponse = extractResponse.length > 2;

      if (isAsyncHandler || wantsRawResponse) {
        logger.debug(`[${this.providerName}] Passing raw response to ${isAsyncHandler ? 'async ' : ''}extractResponse`);
        // We still try to provide parsed data as the 3rd argument if it happens to be JSON
        // but we don't consume the body of the 'response' object we pass as the 1st argument.
        // Actually, consuming it once consumes it for all. So we just pass the response.
        return await extractResponse(response, response.status, response);
      }

      // Traditional synchronous handling (1-2 args)
      const isJson = contentType && contentType.includes('application/json');
      if (isJson) {
        try {
          const data = await response.json();
          logger.debug('_executeApiCall raw response data:', data);
          const result = await extractResponse(data, response.status);
          
          if (result === undefined) {
            logger.error(`[${this.providerName}] _executeApiCall result is undefined. Raw data:`, data);
            const err = new Error(ErrorTypes.API_RESPONSE_INVALID);
            err.type = ErrorTypes.API_RESPONSE_INVALID;
            err.statusCode = response.status;
            err.context = context;
            throw err;
          }
          return result;
        } catch (jsonErr) {
          if (jsonErr.type === ErrorTypes.API_RESPONSE_INVALID) throw jsonErr;
          logger.debug(`[${this.providerName}] Failed to parse JSON even though content-type was JSON`, jsonErr);
        }
      }

      // Fallback for non-JSON or failed JSON parsing
      const responseText = await response.text();
      if (!isJson) {
        logger.error(`[${this.providerName}] Expected JSON but received ${contentType || 'unknown content type'}. Response:`, responseText.substring(0, 500));
        const err = new Error('API returned non-JSON response. This may indicate a proxy configuration error.');
        err.type = ErrorTypes.API_RESPONSE_INVALID;
        err.statusCode = response.status;
        err.context = context;
        throw err;
      }

      // If it was supposed to be JSON but parsing failed, we already logged it.
      // Final attempt to call extractResponse with the text (though it likely expects an object)
      return await extractResponse(responseText, response.status);
    } catch (err) {
      if (err.name === 'AbortError') {
        const abortErr = new Error('Translation cancelled by user');
        abortErr.type = ErrorTypes.USER_CANCELLED;
        abortErr.context = context;
        logger.debug(`[${this.providerName}] Request cancelled for context: ${context}`);
        throw abortErr;
      }
      
      if (err instanceof TypeError && /NetworkError/.test(err.message)) {
        const networkErr = new Error(err.message);
        networkErr.type = ErrorTypes.NETWORK_ERROR;
        networkErr.context = context;
        throw networkErr;
      }
      throw err;
    }
  }

  /**
   * Validates required configuration for the provider
   * @param {Object} config - Configuration object
   * @param {Array<string>} requiredFields - Required field names
   * @param {string} context - Context for error reporting
   * @throws {Error} - If validation fails
   */
  _validateConfig(config, requiredFields, context) {
    for (const field of requiredFields) {
      if (!config[field]) {
        const errorType = field.toLowerCase().includes('key')
          ? ErrorTypes.API_KEY_MISSING
          : field.toLowerCase().includes('url')
          ? ErrorTypes.API_URL_MISSING
          : field.toLowerCase().includes('model')
          ? ErrorTypes.MODEL_MISSING
          : ErrorTypes.API;

        const err = new Error(errorType);
        err.type = errorType;
        err.context = context;
        err.providerName = this.providerName;
        throw err;
      }
    }
  }

  /**
   * Session context management
   */
  storeSessionContext(ctx) {
    this.sessionContext = { ...ctx, timestamp: Date.now() };
  }

  resetSessionContext() {
    this.sessionContext = null;
  }

  shouldResetSession() {
    return (
      this.sessionContext && Date.now() - this.sessionContext.lastUsed > 300000
    );
  }

  /**
   * Check if source and target languages are the same
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @returns {boolean} - True if same language
   */
  _isSameLanguage(sourceLang, targetLang) {
    return sourceLang === targetLang;
  }

  /**
   * Test proxy connection
   * @param {string} testUrl - Optional test URL
   * @returns {Promise<boolean>} - True if connection successful
   */
  async testProxyConnection(testUrl) {
    try {
      await this._initializeProxy();
      return await proxyManager.testConnection(testUrl);
    } catch (error) {
      logger.error(`[${this.providerName}] Proxy test failed:`, error);
      return false;
    }
  }

  /**
   * Processes an array of text segments in batches, respecting provider-specific limits.
   * Uses sequential processing with rate limiting to prevent API limits.
   * @param {Array<string>} segments - The array of text segments to translate.
   * @param {Function} translateChunk - A function that takes a chunk (an array of strings) and translates it.
   * @param {Object} limits - An object with `CHUNK_SIZE` and `CHAR_LIMIT`.
   * @param {AbortController} abortController - Optional abort controller for cancellation.
   * @returns {Promise<Array<string>>} - A promise that resolves to an array of translated segments.
   */
  async _processInBatches(segments, translateChunk, limits, abortController = null, priority = null) {
    const { CHUNK_SIZE, CHAR_LIMIT } = limits;
    const { TranslationPriority, rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    const targetPriority = priority || TranslationPriority.NORMAL;

    const chunks = [];
    const chunkIndexMap = []; // Map to track which original indices each chunk contains
    let currentChunk = [];
    let currentCharCount = 0;
    let currentIndices = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentLength = segment.length;

      if (segmentLength > CHAR_LIMIT) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          chunkIndexMap.push([...currentIndices]);
          currentChunk = [];
          currentCharCount = 0;
          currentIndices = [];
        }
        chunks.push([segment]);
        chunkIndexMap.push([i]);
        continue;
      }

      if (
        currentChunk.length > 0 &&
        (currentChunk.length >= CHUNK_SIZE ||
          currentCharCount + segmentLength > CHAR_LIMIT)
      ) {
        chunks.push(currentChunk);
        chunkIndexMap.push([...currentIndices]);
        currentChunk = [];
        currentCharCount = 0;
        currentIndices = [];
      }

      currentChunk.push(segment);
      currentCharCount += segmentLength;
      currentIndices.push(i);
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
      chunkIndexMap.push([...currentIndices]);
    }

    // Process chunks sequentially with rate limiting
    const translatedSegments = new Array(segments.length); // Pre-allocate array to maintain order

    for (let i = 0; i < chunks.length; i++) {
      // Check for cancellation
      if (abortController && abortController.signal.aborted) {
        const cancelError = new Error('Translation cancelled by user');
        cancelError.name = 'AbortError';
        cancelError.type = ErrorTypes.USER_CANCELLED;
        throw cancelError;
      }

      const chunk = chunks[i];
      const indices = chunkIndexMap[i];
      const context = `batch-${i + 1}/${chunks.length}`;

      try {
        // Execute with rate limiting
        const result = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => translateChunk(chunk, i, chunks.length), // Pass chunk index and total
          context,
          targetPriority
        );

        // Place translated results in correct positions
        if (result.length === chunk.length) {
          for (let j = 0; j < indices.length; j++) {
            translatedSegments[indices[j]] = result[j];
          }
        } else {
          // If result length doesn't match, use original text
          for (let j = 0; j < indices.length; j++) {
            translatedSegments[indices[j]] = chunk[j];
          }
        }
      } catch (error) {
        logger.error(`[${this.providerName}] Chunk ${i + 1} failed:`, error);
        
        // Ensure error type is detected
        const errorType = error.type || matchErrorToType(error);
        if (!error.type) error.type = errorType;

        // If it's a fatal error, stop processing subsequent chunks
        if (isFatalError(error) || isFatalError(errorType)) {
          throw error;
        }

        // For non-fatal chunk errors, use the original text as fallback for this chunk
        for (let j = 0; j < indices.length; j++) {
          translatedSegments[indices[j]] = chunk[j];
        }
      }
    }

    return translatedSegments;
  }
}
