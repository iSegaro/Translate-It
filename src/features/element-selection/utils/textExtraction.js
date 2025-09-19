// Text Extraction Utilities for Element Selection
// Complete text extraction system dedicated to Select Element feature
// Independent from shared utilities to avoid conflicts

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

// Import dedicated utilities
import { getElementSelectionCache } from './cache.js';
import { correctTextDirection, storeOriginalElementStyles, restoreOriginalElementStyles } from './textDirection.js';
import {
  collectTextNodes,
  applyTranslationsToNodes,
  revertTranslations,
  generateUniqueId,
  extractElementText,
  isValidTextElement
} from './domManipulation.js';
import {
  expandTextsForTranslation,
  reassembleTranslations,
  separateCachedAndNewTexts,
  parseAndCleanTranslationResponse,
  handleTranslationLengthMismatch,
  isValidTextContent,
  cleanText
} from './textProcessing.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'textExtraction');

/**
 * Element Selection Text Extraction Manager
 * Complete text extraction and translation system for Select Element feature
 */
export class ElementTextExtraction {
  constructor() {
    this.cache = getElementSelectionCache();
    this.errorHandler = ErrorHandler.getInstance();
    this.initialized = false;
  }

  /**
   * Initialize the text extraction system
   */
  async initialize() {
    if (this.initialized) {
      logger.debug('TextExtraction already initialized');
      return;
    }

    this.cache.initialize();
    this.initialized = true;
    logger.debug('Element Text Extraction initialized');
  }

  /**
   * Extract and prepare text from element for translation
   * @param {HTMLElement} element - Element to extract text from
   * @param {Object} options - Extraction options
   * @returns {Object} Extraction result
   */
  async extractTextForTranslation(element, options = {}) {
    const {
      useIntelligentGrouping = true,
      validateText = true,
      cleanTextContent = true
    } = options;

    if (!element) {
      throw new Error('No element provided for text extraction');
    }

    logger.debug('Starting text extraction for translation', {
      element: element.tagName,
      className: element.className,
      useIntelligentGrouping
    });

    try {
      // Collect text nodes from element
      const { textNodes, originalTextsMap } = collectTextNodes(element, useIntelligentGrouping);

      if (textNodes.length === 0) {
        logger.debug('No text nodes found in element');
        return {
          textNodes: [],
          originalTextsMap: new Map(),
          textsToTranslate: [],
          cachedTranslations: new Map(),
          totalTexts: 0
        };
      }

      // Validate and clean texts if requested
      let processedTextsMap = originalTextsMap;
      if (validateText || cleanTextContent) {
        processedTextsMap = this.processTextsMap(originalTextsMap, {
          validate: validateText,
          clean: cleanTextContent
        });
      }

      // Separate cached and new texts
      const { textsToTranslate, cachedTranslations } = separateCachedAndNewTexts(processedTextsMap);

      logger.debug('Text extraction completed', {
        totalNodes: textNodes.length,
        uniqueTexts: processedTextsMap.size,
        newTexts: textsToTranslate.length,
        cachedTexts: cachedTranslations.size
      });

      return {
        textNodes,
        originalTextsMap: processedTextsMap,
        textsToTranslate,
        cachedTranslations,
        totalTexts: processedTextsMap.size
      };

    } catch (error) {
      const processedError = await ErrorHandler.processError(error);
      logger.error('Text extraction failed:', processedError);
      throw processedError;
    }
  }

  /**
   * Process and filter texts map based on validation and cleaning options
   * @param {Map} originalTextsMap - Original texts map
   * @param {Object} options - Processing options
   * @returns {Map} Processed texts map
   */
  processTextsMap(originalTextsMap, options = {}) {
    const { validate = true, clean = true } = options;
    const processedMap = new Map();

    originalTextsMap.forEach((nodes, text) => {
      let processedText = text;

      // Clean text if requested
      if (clean) {
        processedText = cleanText(text, {
          normalizeWhitespace: true,
          removeEmptyLines: false,
          trimLines: true
        });
      }

      // Validate text if requested
      if (validate) {
        if (!isValidTextContent(processedText)) {
          logger.debug(`Skipping invalid text: ${text.substring(0, 30)}...`);
          return;
        }
      }

      // Use processed text as key if it changed, otherwise use original
      const finalKey = processedText !== text ? processedText : text;

      if (processedMap.has(finalKey)) {
        // Merge nodes if text already exists
        processedMap.get(finalKey).push(...nodes);
      } else {
        processedMap.set(finalKey, [...nodes]);
      }
    });

    return processedMap;
  }

  /**
   * Apply translations to extracted text nodes
   * @param {Node[]} textNodes - Text nodes to apply translations to
   * @param {Map} translations - Map of translations
   * @param {Object} context - Context object
   * @returns {Promise<number>} Number of applied translations
   */
  async applyTranslations(textNodes, translations, context = {}) {
    if (!textNodes || !translations) {
      logger.error('Invalid parameters for applying translations');
      return 0;
    }

    const extractionContext = {
      state: {
        originalTexts: this.cache.getAllOriginalTexts()
      },
      errorHandler: this.errorHandler,
      ...context
    };

    try {
      logger.debug(`Applying translations to ${textNodes.length} nodes`);
      applyTranslationsToNodes(textNodes, translations, extractionContext);

      const appliedCount = translations.size;
      logger.debug(`Successfully applied ${appliedCount} translations`);
      return appliedCount;

    } catch (error) {
      const processedError = await ErrorHandler.processError(error);
      logger.error('Failed to apply translations:', processedError);

      if (this.errorHandler) {
        this.errorHandler.handle(processedError, {
          type: ErrorTypes.UI,
          context: 'element-selection-apply-translations'
        });
      }

      throw processedError;
    }
  }

  /**
   * Revert all translations in the current context
   * @param {Object} context - Context object
   * @returns {Promise<number>} Number of reverted translations
   */
  async revertAllTranslations(context = {}) {
    const extractionContext = {
      state: {
        originalTexts: this.cache.getAllOriginalTexts()
      },
      errorHandler: this.errorHandler,
      ...context
    };

    try {
      logger.debug('Starting translation revert process');
      const revertedCount = await revertTranslations(extractionContext);

      // Clear cache after successful revert
      this.cache.clearOriginalTexts();

      logger.debug(`Successfully reverted ${revertedCount} translations`);
      return revertedCount;

    } catch (error) {
      const processedError = await ErrorHandler.processError(error);
      logger.error('Failed to revert translations:', processedError);

      if (this.errorHandler) {
        this.errorHandler.handle(processedError, {
          type: ErrorTypes.UI,
          context: 'element-selection-revert-translations'
        });
      }

      throw processedError;
    }
  }

  /**
   * Complete translation workflow for an element
   * @param {HTMLElement} element - Element to translate
   * @param {Function} translationFunction - Function to call for translation
   * @param {Object} options - Translation options
   * @returns {Promise<Object>} Translation result
   */
  async translateElement(element, translationFunction, options = {}) {
    const {
      useCache = true,
      applyImmediately = true,
      returnDetails = true
    } = options;

    try {
      // Extract text for translation
      const extractionResult = await this.extractTextForTranslation(element, options);

      if (extractionResult.textsToTranslate.length === 0 && extractionResult.cachedTranslations.size === 0) {
        logger.debug('No texts to translate found');
        return {
          success: false,
          reason: 'no_translatable_text',
          ...extractionResult
        };
      }

      let allTranslations = new Map();

      // Add cached translations
      if (useCache) {
        extractionResult.cachedTranslations.forEach((translation, original) => {
          allTranslations.set(original, translation);
        });
      }

      // Translate new texts if any
      if (extractionResult.textsToTranslate.length > 0) {
        logger.debug(`Translating ${extractionResult.textsToTranslate.length} new texts`);

        const newTranslations = await this.processTranslationRequest(
          extractionResult.textsToTranslate,
          translationFunction,
          options
        );

        // Merge new translations
        newTranslations.forEach((translation, original) => {
          allTranslations.set(original, translation);
        });
      }

      // Apply translations to DOM if requested
      let appliedCount = 0;
      if (applyImmediately && allTranslations.size > 0) {
        appliedCount = await this.applyTranslations(
          extractionResult.textNodes,
          allTranslations
        );
      }

      const result = {
        success: true,
        appliedCount,
        totalTranslations: allTranslations.size,
        newTranslations: extractionResult.textsToTranslate.length,
        cachedTranslations: extractionResult.cachedTranslations.size
      };

      if (returnDetails) {
        result.translations = allTranslations;
        result.extractionResult = extractionResult;
      }

      logger.debug('Element translation completed successfully', result);
      return result;

    } catch (error) {
      const processedError = await ErrorHandler.processError(error);
      logger.error('Element translation failed:', processedError);

      return {
        success: false,
        error: processedError,
        reason: 'translation_error'
      };
    }
  }

  /**
   * Process translation request with expansion and reassembly
   * @param {string[]} textsToTranslate - Texts to translate
   * @param {Function} translationFunction - Translation function
   * @param {Object} options - Processing options
   * @returns {Promise<Map>} Translation results
   */
  async processTranslationRequest(textsToTranslate, translationFunction, options = {}) {
    const { useOptimization = true } = options;

    try {
      // Expand texts for translation
      const { expandedTexts, originMapping, originalToExpandedIndices } =
        expandTextsForTranslation(textsToTranslate, { useOptimization });

      if (expandedTexts.length === 0) {
        logger.debug('No expanded texts to translate');
        return new Map();
      }

      // Call translation function
      logger.debug(`Calling translation function for ${expandedTexts.length} segments`);
      const translatedData = await translationFunction(expandedTexts);

      // Validate response
      if (!handleTranslationLengthMismatch(translatedData, expandedTexts)) {
        logger.warn('Translation length mismatch detected, proceeding with caution');
      }

      // Reassemble translations
      const reassembledTranslations = reassembleTranslations(
        translatedData,
        expandedTexts,
        originMapping,
        textsToTranslate,
        new Map() // No additional cached translations at this level
      );

      logger.debug(`Reassembled ${reassembledTranslations.size} translations`);
      return reassembledTranslations;

    } catch (error) {
      logger.error('Translation processing failed:', error);
      throw error;
    }
  }

  /**
   * Get extraction statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      cacheStats: this.cache.getStats(),
      initialized: this.initialized
    };
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clearAllCaches();
    logger.debug('Text extraction cache cleared');
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.cache.cleanup();
    this.initialized = false;
    logger.debug('Text extraction cleanup completed');
  }
}

// Export all the individual functions for direct use
export {
  // DOM functions
  collectTextNodes,
  applyTranslationsToNodes,
  revertTranslations,
  generateUniqueId,
  extractElementText,
  isValidTextElement,

  // Text processing functions
  expandTextsForTranslation,
  reassembleTranslations,
  separateCachedAndNewTexts,
  parseAndCleanTranslationResponse,
  handleTranslationLengthMismatch,
  isValidTextContent,
  cleanText,

  // Text direction functions
  correctTextDirection,
  storeOriginalElementStyles as storeOriginalParentStyles,
  restoreOriginalElementStyles as restoreOriginalParentStyles,

  // Cache functions
  getElementSelectionCache as getTranslationCache
};

// Singleton instance
let extractionInstance = null;

/**
 * Get singleton text extraction instance
 * @returns {ElementTextExtraction} Extraction instance
 */
export function getElementTextExtraction() {
  if (!extractionInstance) {
    extractionInstance = new ElementTextExtraction();
  }
  return extractionInstance;
}

/**
 * Initialize the text extraction system
 * @returns {Promise<ElementTextExtraction>} Initialized extraction instance
 */
export async function initializeTextExtraction() {
  const extraction = getElementTextExtraction();
  await extraction.initialize();
  return extraction;
}

/**
 * Get translation cache as Map for legacy compatibility
 * @returns {Map} Translation cache map
 */
export function getTranslationCacheMap() {
  const cache = getElementSelectionCache();
  return cache.getAllTranslations();
}

/**
 * Clear all caches (legacy compatibility function)
 * @param {Object} context - Context object (for compatibility)
 */
export function clearAllCaches(context = {}) {
  const extraction = getElementTextExtraction();
  extraction.clearCache();

  if (context && context.state && context.state.originalTexts) {
    context.state.originalTexts.clear();
  }

  logger.debug('All Element Selection caches cleared');
}