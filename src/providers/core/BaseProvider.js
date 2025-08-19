// src/providers/core/BaseTranslationProvider.js

import { ErrorTypes } from "@/error-management/ErrorTypes.js";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'BaseProvider');

/**
 * Base class for all translation providers
 * Provides common functionality like error handling, API calls, and validation
 */
export class BaseProvider {
  constructor(providerName) {
    this.providerName = providerName;
    this.sessionContext = null;
  }

  // By default providers are considered "not reliably returning JSON-mode"
  // Consumers can opt-in by setting `static reliableJsonMode = true` on the provider class.
  static reliableJsonMode = false;

  /**
   * Abstract method - must be implemented by subclasses
   * @param {string} text - Text to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {string} originalSourceLang - Original source language
   * @param {string} originalTargetLang - Original target language
   * @param {AbortController} abortController - Optional abort controller for cancellation
   * @returns {Promise<string>} - Translated text
   */
  async translate() {
    throw new Error(`translate method must be implemented by ${this.constructor.name}`);
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
   * Executes a fetch call and normalizes HTTP, API-response-invalid, and network errors.
   * @param {Object} params
   * @param {string} params.url - The endpoint URL
   * @param {RequestInit} params.fetchOptions - Fetch options
   * @param {Function} params.extractResponse - Function to extract/transform JSON + status
   * @param {string} params.context - Context for error reporting
   * @param {AbortController} params.abortController - Optional abort controller for cancellation
   * @returns {Promise<any>} - Transformed result
   * @throws {Error} - With properties: type, statusCode (for HTTP/API), context
   */
  async _executeApiCall({ url, fetchOptions, extractResponse, context, abortController }) {
  logger.debug(`_executeApiCall starting for context: ${context}`);
  logger.debug(`_executeApiCall URL: ${url}`);
    logger.debug('_executeApiCall fetchOptions:', fetchOptions);

    try {
      // Add abort signal if provided
      const finalFetchOptions = { ...fetchOptions };
      if (abortController) {
        finalFetchOptions.signal = abortController.signal;
        logger.debug(`[${this.providerName}] Adding abort signal to request:`, { context, hasSignal: !!abortController.signal });
      } else {
        logger.debug(`[${this.providerName}] No abort controller provided for context:`, context);
      }
      
      const response = await fetch(url, finalFetchOptions);
  logger.debug(`_executeApiCall response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        // Extract error details if available
        let body = {};
        try {
          body = await response.json();
        } catch (jsonError) {
          logger.error(`[${this.providerName}] Failed to parse error response JSON:`, jsonError);
        }
        // Use detail or error.message or statusText, fallback to HTTP status
        const msg =
          body.detail ||
          body.error?.message ||
          response.statusText ||
          `HTTP ${response.status}`;

        logger.error(`[${this.providerName}] _executeApiCall HTTP error:`, {
          status: response.status,
          statusText: response.statusText,
          body: body,
          message: msg,
          url: url
        });
        const err = new Error(msg);
        // Mark as HTTP error (status codes 4xx/5xx)
        err.type = ErrorTypes.HTTP_ERROR;
        err.statusCode = response.status;
        err.context = context;
        throw err;
      }

      // Parse successful response
      const data = await response.json();
  logger.debug('_executeApiCall raw response data:', data);
      logger.debug('_executeApiCall response data:', data);

      const result = extractResponse(data, response.status);
      logger.info('_executeApiCall extracted result:', result);

      if (result === undefined) {
        logger.error(
          `[${this.providerName}] _executeApiCall result is undefined - treating as invalid response. Raw data:`,
          data
        );
        const err = new Error(ErrorTypes.API_RESPONSE_INVALID);
        err.type = ErrorTypes.API;
        err.statusCode = response.status;
        err.context = context;
        throw err;
      }

  logger.init(`_executeApiCall success for context: ${context}`);
      return result;
    } catch (err) {
      // Handle abort errors (cancellation)
      if (err.name === 'AbortError') {
        const abortErr = new Error('Translation cancelled by user');
        abortErr.type = ErrorTypes.USER_CANCELLED;
        abortErr.context = context;
        logger.debug(`[${this.providerName}] Request cancelled for context: ${context}`);
        throw abortErr;
      }
      
      // Handle fetch network errors (e.g., offline)
      if (err instanceof TypeError && /NetworkError/.test(err.message)) {
        const networkErr = new Error(err.message);
        networkErr.type = ErrorTypes.NETWORK_ERROR;
        networkErr.context = context;
        throw networkErr;
      }
      // Rethrow existing HTTP/API errors or others
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
          ? ErrorTypes.AI_MODEL_MISSING
          : ErrorTypes.API;

        const err = new Error(errorType);
        err.type = errorType;
        err.context = context;
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
   * Utility method to build message payload for debugging
   * @param {Object} options - API call options
   * @returns {Object} - Message payload information
   */
  _buildMessagePayload(options) {
    let promptText = "";
    try {
      const bodyObj = JSON.parse(options.fetchOptions.body);
      if (
        bodyObj.contents &&
        Array.isArray(bodyObj.contents) &&
        bodyObj.contents[0].parts
      ) {
        promptText = bodyObj.contents[0].parts[0].text;
      } else if (bodyObj.message) {
        promptText = bodyObj.message;
      } else if (
        bodyObj.messages &&
        Array.isArray(bodyObj.messages) &&
        bodyObj.messages[0].content
      ) {
        promptText = bodyObj.messages[0].content;
      }
    } catch {
      // leave promptText empty
    }
    return {
      promptText,
      sourceLanguage: options.sourceLanguage || "auto",
      targetLanguage: options.targetLanguage || "auto",
      translationMode: options.translationMode || "",
    };
  }

  /**
   * Processes an array of text segments in batches, respecting provider-specific limits.
   * @param {Array<string>} segments - The array of text segments to translate.
   * @param {Function} translateChunk - A function that takes a chunk (an array of strings) and translates it.
   * @param {Object} limits - An object with `CHUNK_SIZE` and `CHAR_LIMIT`.
   * @returns {Promise<Array<string>>} - A promise that resolves to an array of translated segments.
   */
  async _processInBatches(segments, translateChunk, limits) {
    const { CHUNK_SIZE, CHAR_LIMIT } = limits;
    const chunks = [];
    let currentChunk = [];
    let currentCharCount = 0;

    for (const segment of segments) {
      const segmentLength = segment.length;

      if (segmentLength > CHAR_LIMIT) {
        // If a single segment is too long, process it in its own chunk.
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentCharCount = 0;
        }
        chunks.push([segment]);
        continue;
      }

      if (
        currentChunk.length > 0 &&
        (currentChunk.length >= CHUNK_SIZE ||
          currentCharCount + segmentLength > CHAR_LIMIT)
      ) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentCharCount = 0;
      }

      currentChunk.push(segment);
      currentCharCount += segmentLength;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    const chunkPromises = chunks.map(chunk => translateChunk(chunk));
    const translatedChunks = await Promise.all(chunkPromises);

    return translatedChunks.flat();
  }
}