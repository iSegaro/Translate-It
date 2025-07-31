/**
 * Universal Translation Messaging Protocol
 * Standardized format for translation requests and responses across all extension contexts
 */

/**
 * Translation Request Structure
 * @typedef {Object} TranslationRequest
 * @property {string} action - Always 'TRANSLATE' for translation requests
 * @property {string} context - Source context ('popup', 'sidepanel', 'selection', 'content', 'subtitle')
 * @property {TranslationData} data - Translation parameters
 */

/**
 * Translation Data Structure
 * @typedef {Object} TranslationData
 * @property {string} text - Text to translate (required)
 * @property {string} provider - Provider ID (e.g., 'google', 'gemini', 'openai')
 * @property {string} sourceLanguage - Source language code (e.g., 'en', 'auto')
 * @property {string} targetLanguage - Target language code (e.g., 'fa', 'es')
 * @property {string} mode - Translation mode ('simple', 'selection', 'subtitle', 'smart')
 * @property {Object} [options] - Additional options specific to provider or mode
 */

/**
 * Translation Response Structure
 * @typedef {Object} TranslationResponse
 * @property {boolean} success - Whether translation succeeded
 * @property {string} [translatedText] - Translated text (if successful)
 * @property {string} [detectedLanguage] - Auto-detected source language
 * @property {string} provider - Provider that handled the translation
 * @property {string} sourceLanguage - Actual source language used
 * @property {string} targetLanguage - Target language used
 * @property {string} originalText - Original text that was translated
 * @property {number} timestamp - Unix timestamp of translation
 * @property {string} mode - Translation mode used
 * @property {boolean} [fromCache] - Whether result came from cache
 * @property {TranslationError} [error] - Error details (if failed)
 */

/**
 * Translation Error Structure
 * @typedef {Object} TranslationError
 * @property {string} type - Error type ('TRANSLATION_ERROR', 'PROVIDER_ERROR', 'NETWORK_ERROR', etc.)
 * @property {string} message - Human-readable error message
 * @property {string} context - Context where error occurred
 * @property {number} timestamp - Unix timestamp of error
 * @property {string} [code] - Provider-specific error code
 */

/**
 * Standard translation request actions
 */
export const TRANSLATION_ACTIONS = {
  TRANSLATE: "TRANSLATE",
  GET_PROVIDERS: "GET_PROVIDERS",
  GET_HISTORY: "GET_HISTORY",
  CLEAR_CACHE: "CLEAR_CACHE",
  CLEAR_HISTORY: "CLEAR_HISTORY",
};

/**
 * Standard translation contexts
 */
export const TRANSLATION_CONTEXTS = {
  POPUP: "popup",
  SIDEPANEL: "sidepanel",
  SELECTION: "selection",
  CONTENT: "content",
  SUBTITLE: "subtitle",
  CAPTURE: "capture",
  EVENT_HANDLER: "event-handler",
  CONTENT_SELECT_ELEMENT: "content-select-element",
};

/**
 * Standard translation modes
 */
export const TRANSLATION_MODES = {
  SIMPLE: "simple",
  SELECTION: "selection",
  SUBTITLE: "subtitle",
  SMART: "smart",
  BULK: "bulk",
};

/**
 * Standard error types
 */
export const ERROR_TYPES = {
  TRANSLATION_ERROR: "TRANSLATION_ERROR",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  API_KEY_ERROR: "API_KEY_ERROR",
  RATE_LIMIT_ERROR: "RATE_LIMIT_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INITIALIZATION_ERROR: "INITIALIZATION_ERROR",
};

/**
 * Create a standardized translation request
 * @param {string} context - Source context
 * @param {string} text - Text to translate
 * @param {Object} options - Translation options
 * @returns {TranslationRequest}
 */
export function createTranslationRequest(context, text, options = {}) {
  return {
    action: TRANSLATION_ACTIONS.TRANSLATE,
    context,
    data: {
      text,
      provider: options.provider || "google",
      sourceLanguage: options.sourceLanguage || "auto",
      targetLanguage: options.targetLanguage || "fa",
      mode: options.mode || TRANSLATION_MODES.SIMPLE,
      options: options.additionalOptions || {},
    },
  };
}

/**
 * Create a standardized success response
 * @param {string} translatedText - Translated text
 * @param {Object} metadata - Translation metadata
 * @returns {TranslationResponse}
 */
export function createSuccessResponse(translatedText, metadata) {
  return {
    success: true,
    translatedText,
    provider: metadata.provider,
    sourceLanguage: metadata.sourceLanguage,
    targetLanguage: metadata.targetLanguage,
    originalText: metadata.originalText,
    timestamp: Date.now(),
    mode: metadata.mode || TRANSLATION_MODES.SIMPLE,
    detectedLanguage: metadata.detectedLanguage,
    fromCache: metadata.fromCache || false,
  };
}

/**
 * Create a standardized error response
 * @param {Error} error - Error object
 * @param {string} context - Context where error occurred
 * @param {string} [provider] - Provider that failed
 * @returns {TranslationResponse}
 */
export function createErrorResponse(error, context, provider = "unknown") {
  return {
    success: false,
    provider,
    timestamp: Date.now(),
    error: {
      type: error.type || ERROR_TYPES.TRANSLATION_ERROR,
      message: error.message || "Translation failed",
      context,
      timestamp: Date.now(),
      code: error.code,
    },
  };
}

/**
 * Validate translation request
 * @param {Object} request - Request to validate
 * @returns {boolean}
 */
export function validateTranslationRequest(request) {
  if (!request || typeof request !== "object") {
    return false;
  }

  if (request.action !== TRANSLATION_ACTIONS.TRANSLATE) {
    return false;
  }

  if (
    !request.context ||
    !Object.values(TRANSLATION_CONTEXTS).includes(request.context)
  ) {
    return false;
  }

  if (!request.data || typeof request.data !== "object") {
    return false;
  }

  const { text, provider, sourceLanguage, targetLanguage } = request.data;

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return false;
  }

  if (!provider || typeof provider !== "string") {
    return false;
  }

  if (!sourceLanguage || typeof sourceLanguage !== "string") {
    return false;
  }

  if (!targetLanguage || typeof targetLanguage !== "string") {
    return false;
  }

  return true;
}

/**
 * Create a provider list request
 * @param {string} context - Source context
 * @returns {Object}
 */
export function createProviderListRequest(context) {
  return {
    action: TRANSLATION_ACTIONS.GET_PROVIDERS,
    context,
  };
}

/**
 * Create a history request
 * @param {string} context - Source context
 * @returns {Object}
 */
export function createHistoryRequest(context) {
  return {
    action: TRANSLATION_ACTIONS.GET_HISTORY,
    context,
  };
}

/**
 * Create a cache clear request
 * @param {string} context - Source context
 * @returns {Object}
 */
export function createClearCacheRequest(context) {
  return {
    action: TRANSLATION_ACTIONS.CLEAR_CACHE,
    context,
  };
}

/**
 * Create a history clear request
 * @param {string} context - Source context
 * @returns {Object}
 */
export function createClearHistoryRequest(context) {
  return {
    action: TRANSLATION_ACTIONS.CLEAR_HISTORY,
    context,
  };
}
