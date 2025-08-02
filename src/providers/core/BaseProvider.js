// src/providers/core/BaseTranslationProvider.js
import { logME } from "@utils/helpers.js";
import { ErrorTypes } from "@/error-management/ErrorTypes.js";

/**
 * Base class for all translation providers
 * Provides common functionality like error handling, API calls, and validation
 */
export class BaseProvider {
  constructor(providerName) {
    this.providerName = providerName;
    this.sessionContext = null;
  }

  /**
   * Abstract method - must be implemented by subclasses
   * @param {string} text - Text to translate
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @returns {Promise<string>} - Translated text
   */
  async translate(text, sourceLang, targetLang, translateMode) {
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
  async translateImage(imageData, sourceLang, targetLang, translateMode) {
    throw new Error(`translateImage method not supported by ${this.constructor.name}`);
  }

  /**
   * Executes a fetch call and normalizes HTTP, API-response-invalid, and network errors.
   * @param {Object} params
   * @param {string} params.url - The endpoint URL
   * @param {RequestInit} params.fetchOptions - Fetch options
   * @param {Function} params.extractResponse - Function to extract/transform JSON + status
   * @param {string} params.context - Context for error reporting
   * @returns {Promise<any>} - Transformed result
   * @throws {Error} - With properties: type, statusCode (for HTTP/API), context
   */
  async _executeApiCall({ url, fetchOptions, extractResponse, context }) {
    logME(`[${this.providerName}] _executeApiCall starting for context: ${context}`);
    logME(`[${this.providerName}] _executeApiCall URL: ${url}`);
    logME(`[${this.providerName}] _executeApiCall fetchOptions:`, fetchOptions);

    try {
      const response = await fetch(url, fetchOptions);
      logME(
        `[${this.providerName}] _executeApiCall response status: ${response.status} ${response.statusText}`
      );

      if (!response.ok) {
        // Extract error details if available
        let body = {};
        try {
          body = await response.json();
        } catch (jsonError) {
          console.error(`[${this.providerName}] Failed to parse error response JSON:`, jsonError);
        }
        // Use detail or error.message or statusText, fallback to HTTP status
        const msg =
          body.detail ||
          body.error?.message ||
          response.statusText ||
          `HTTP ${response.status}`;

        console.error(`[${this.providerName}] _executeApiCall HTTP error:`, {
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
      logME(`[${this.providerName}] _executeApiCall raw response data:`, data);
      logME(`[${this.providerName}] _executeApiCall response data:`, data);

      const result = extractResponse(data, response.status);
      logME(`[${this.providerName}] _executeApiCall extracted result:`, result);

      if (result === undefined) {
        console.error(
          `[${this.providerName}] _executeApiCall result is undefined - treating as invalid response. Raw data:`,
          data
        );
        const err = new Error(ErrorTypes.API_RESPONSE_INVALID);
        err.type = ErrorTypes.API;
        err.statusCode = response.status;
        err.context = context;
        throw err;
      }

      logME(`[${this.providerName}] _executeApiCall success for context: ${context}`);
      return result;
    } catch (err) {
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
}