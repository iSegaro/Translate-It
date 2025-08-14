// src/capture/TextExtractor.js

import { ErrorTypes } from "../error-management/ErrorTypes.js";

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.CAPTURE, 'TextExtractor');


/**
 * Text extraction interface - supports both AI and OCR methods
 * This class provides a unified interface for extracting text from images
 * Currently uses AI providers, but ready for OCR integration
 */
export class TextExtractor {
  constructor() {
    this.extractionMethods = new Map();
    this.defaultMethod = "ai";
  }

  /**
   * Register text extraction method
   * @param {string} methodName - Method name (ai, ocr, tesseract, etc.)
   * @param {Function} extractorFunction - Extraction function
   */
  registerMethod(methodName, extractorFunction) {
    this.extractionMethods.set(methodName, extractorFunction);
  logger.debug(`Registered method: ${methodName}`);
  }

  /**
   * Extract text from image using specified method
   * @param {string} imageData - Base64 encoded image data
   * @param {Object} options - Extraction options
   * @param {string} options.method - Extraction method (ai, ocr)
   * @param {string} options.sourceLang - Source language
   * @param {string} options.targetLang - Target language
   * @param {string} options.provider - AI provider (for AI method)
   * @param {string} options.mode - Translation mode
   * @returns {Promise<Object>} Extraction result
   */
  async extractText(imageData, options = {}) {
    try {
      const method = options.method || this.defaultMethod;

  logger.debug(`Extracting text using method: ${method}`, {
        method,
        hasImage: !!imageData,
        options: { ...options, imageData: "[base64-data]" },
      });

      const extractorFunction = this.extractionMethods.get(method);
      if (!extractorFunction) {
        throw this._createError(
          ErrorTypes.INTEGRATION,
          `Text extraction method '${method}' not available`,
        );
      }

      const result = await extractorFunction(imageData, options);

  logger.info('Text extraction completed:', {
        method,
        success: !!result,
        textLength: result?.extractedText?.length || 0,
      });

      return {
        method,
        extractedText: result.extractedText || "",
        confidence: result.confidence || 1.0,
        metadata: result.metadata || {},
        timestamp: Date.now(),
      };
    } catch (error) {
  logger.error('Text extraction failed:', error);
      throw this._normalizeError(error, "extractText");
    }
  }

  /**
   * Extract and translate text in one operation
   * @param {string} imageData - Base64 encoded image data
   * @param {Object} options - Options
   * @returns {Promise<Object>} Combined result
   */
  async extractAndTranslate(imageData, options = {}) {
    try {
  logger.debug('Starting extract and translate operation');

      // For AI method, use direct AI translation (current implementation)
      if (!options.method || options.method === "ai") {
        return await this._aiExtractAndTranslate(imageData, options);
      }

      // For OCR method, extract first then translate
      const extractionResult = await this.extractText(imageData, options);

      if (!extractionResult.extractedText) {
        throw this._createError(
          ErrorTypes.TEXT_EMPTY,
          "No text extracted from image",
        );
      }

      // TODO: Add text translation step for OCR results
      // This would involve calling translation providers with extracted text

      return {
        ...extractionResult,
        translatedText: extractionResult.extractedText, // Placeholder for now
        translationMethod: "pending-ocr-implementation",
      };
    } catch (error) {
      getLogger().error('Extract and translate failed:', error);
      throw this._normalizeError(error, "extractAndTranslate");
    }
  }

  /**
   * AI-based extraction and translation (current implementation)
   * @param {string} imageData - Image data
   * @param {Object} options - Options
   * @returns {Promise<Object>} Result
   * @private
   */
  async _aiExtractAndTranslate(imageData, options) {
    const { provider, sourceLang, targetLang, mode } = options;

    // Import here to avoid circular dependencies
    const { providerFactory } = await import(
      "../providers/core/ProviderFactory.js"
    );

    const providerInstance = providerFactory.getProvider(provider);
    if (!providerInstance || !providerInstance.translateImage) {
      throw this._createError(
        ErrorTypes.PROVIDER_IMAGE_NOT_SUPPORTED,
        `Provider ${provider} does not support image translation`,
      );
    }

    const translatedText = await providerInstance.translateImage(
      imageData,
      sourceLang,
      targetLang,
      mode,
    );

    return {
      method: "ai",
      extractedText: "[AI-extracted]", // AI combines extraction and translation
      translatedText,
      confidence: 1.0,
      metadata: { provider, aiCombined: true },
    };
  }

  /**
   * Check if extraction method is available
   * @param {string} method - Method name
   * @returns {boolean} True if available
   */
  isMethodAvailable(method) {
    return this.extractionMethods.has(method);
  }

  /**
   * Get list of available extraction methods
   * @returns {Array<string>} Available methods
   */
  getAvailableMethods() {
    return Array.from(this.extractionMethods.keys());
  }

  /**
   * Set default extraction method
   * @param {string} method - Method name
   */
  setDefaultMethod(method) {
    if (this.isMethodAvailable(method)) {
      this.defaultMethod = method;
      getLogger().debug('Default method set to: ${method}');
    } else {
      throw this._createError(
        ErrorTypes.INTEGRATION,
        `Cannot set default method to unavailable method: ${method}`,
      );
    }
  }

  /**
   * Create normalized error
   * @param {string} type - Error type
   * @param {string} message - Error message
   * @returns {Error} Normalized error
   * @private
   */
  _createError(type, message) {
    const error = new Error(message);
    error.type = type;
    error.context = "text-extractor";
    return error;
  }

  /**
   * Normalize error for consistent handling
   * @param {Error} error - Original error
   * @param {string} context - Operation context
   * @returns {Error} Normalized error
   * @private
   */
  _normalizeError(error, context) {
    if (error.type) {
      return error; // Already normalized
    }

    let errorType = ErrorTypes.INTEGRATION;

    if (error.message?.includes("not supported")) {
      errorType = ErrorTypes.PROVIDER_IMAGE_NOT_SUPPORTED;
    } else if (
      error.message?.includes("empty") ||
      error.message?.includes("no text")
    ) {
      errorType = ErrorTypes.TEXT_EMPTY;
    } else if (error.message?.includes("extraction")) {
      errorType = ErrorTypes.IMAGE_PROCESSING_FAILED;
    }

    const normalizedError = new Error(error.message || "Text extraction error");
    normalizedError.type = errorType;
    normalizedError.context = `text-extractor-${context}`;

    return normalizedError;
  }

  /**
   * Initialize with default methods
   * @static
   * @returns {TextExtractor} Initialized instance
   */
  static createWithDefaults() {
    const extractor = new TextExtractor();

    // Register AI method (current implementation)
    extractor.registerMethod("ai", async (imageData, options) => {
      // This is handled by _aiExtractAndTranslate
      throw new Error("AI method should use extractAndTranslate");
    });

    // Register placeholder for future OCR methods
    extractor.registerMethod("tesseract", async (imageData, options) => {
      throw new Error("Tesseract OCR not implemented yet");
    });

    extractor.registerMethod("webocr", async (imageData, options) => {
      throw new Error("Web OCR API not implemented yet");
    });

    return extractor;
  }
}

// Export singleton instance
export const textExtractor = TextExtractor.createWithDefaults();
