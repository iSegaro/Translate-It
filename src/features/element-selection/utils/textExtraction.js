// Text Extraction Utilities for Element Selection
// Complete text extraction system dedicated to Select Element feature
// Independent from shared utilities to avoid conflicts

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

// Import dedicated utilities
// Note: Cache system has been removed from Select Element feature
import { applyContainerDirection, restoreOriginalDirection } from './textDirection.js';
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

    this.initialized = true;
    logger.debug('Element Text Extraction initialized');
  }

  /**
   * Extract and prepare text from element for translation with segment IDs
   * @param {HTMLElement} element - Element to extract text from
   * @param {Object} options - Extraction options
   * @returns {Object} Extraction result with segment IDs
   */
  async extractTextForTranslation(element, options = {}) {
    const {
      validateText = true,
      cleanTextContent = true
    } = options;

    if (!element) {
      throw new Error('No element provided for text extraction');
    }

    logger.debug('Starting text extraction for translation with segment IDs', {
      element: element.tagName,
      className: element.className
    });

    try {
      // Collect text nodes from element with segment IDs
      const { textNodes, originalTextsMap, segmentMap } = this.collectTextNodesWithSegments(element);

      if (textNodes.length === 0) {
        logger.debug('No text nodes found in element');
        return {
          textNodes: [],
          originalTextsMap: new Map(),
          segmentMap: new Map(),
          textsToTranslate: [],
          cachedTranslations: new Map(),
          totalTexts: 0
        };
      }

      // Validate and clean texts if requested
      let processedTextsMap = originalTextsMap;
      let processedSegmentMap = segmentMap;
      if (validateText || cleanTextContent) {
        ({ processedTextsMap, processedSegmentMap } = this.processTextsWithSegments(originalTextsMap, segmentMap, {
          validate: validateText,
          clean: cleanTextContent
        }));
      }

      // Convert processed texts to array for translation with segment metadata
      const textsToTranslate = Array.from(processedTextsMap.keys()).map(text => ({
        text,
        segmentId: processedSegmentMap.get(text),
        originalText: text
      }));

      logger.debug('Text extraction completed with segment IDs', {
        totalNodes: textNodes.length,
        uniqueTexts: processedTextsMap.size,
        textsToTranslate: textsToTranslate.length
      });

      return {
        textNodes,
        originalTextsMap: processedTextsMap,
        segmentMap: processedSegmentMap,
        textsToTranslate,
        totalTexts: processedTextsMap.size
      };

    } catch (error) {
      const processedError = await ErrorHandler.processError(error);
      logger.error('Text extraction failed:', processedError);
      throw processedError;
    }
  }

  /**
   * Collect text nodes from element with unique segment IDs
   * @param {HTMLElement} element - Element to collect text from
   * @returns {Object} Collection result with segment mappings
   */
  collectTextNodesWithSegments(element) {
    const textNodes = [];
    const originalTextsMap = new Map();
    const segmentMap = new Map();
    let segmentCounter = 0;

    // Generate a unique prefix for this extraction session
    const sessionId = `seg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const traverseNode = (node, depth = 0) => {
      // Skip script and style tags
      if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE') {
        return;
      }

      // Handle text nodes
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent; // Don't trim here to preserve whitespace
        
        // Always process the node to wrap it and give it an ID, even if it's just whitespace
        const segmentId = `${sessionId}-${segmentCounter}`;
        segmentCounter++;

        const wrapper = document.createElement('span');
        wrapper.setAttribute('data-segment-id', segmentId);
        wrapper.textContent = text;
        wrapper.setAttribute('data-original-text', text);

        if (node.parentNode) {
          node.parentNode.replaceChild(wrapper, node);
        }

        const nodeInfo = {
          node: wrapper,
          originalNode: node,
          text,
          segmentId,
          wrapper,
          depth,
          parentNode: wrapper.parentNode,
          parentTag: wrapper.parentNode?.tagName,
          index: Array.from(wrapper.parentNode?.childNodes || []).indexOf(wrapper)
        };

        textNodes.push(nodeInfo);

        if (text.trim().length > 0) {
          if (!originalTextsMap.has(text)) {
            originalTextsMap.set(text, []);
          }
          originalTextsMap.get(text).push(nodeInfo);
          segmentMap.set(text, segmentId);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Recursively traverse child elements
        for (const child of node.childNodes) {
          traverseNode(child, depth + 1);
        }
      }
    };

    // Start traversal from the element
    traverseNode(element);

    logger.debug('Collected text nodes with segment IDs', {
      totalNodes: textNodes.length,
      uniqueTexts: originalTextsMap.size,
      sessionId
    });

    return {
      textNodes,
      originalTextsMap,
      segmentMap
    };
  }

  /**
   * Process texts with their segment IDs
   * @param {Map} originalTextsMap - Original texts map
   * @param {Map} segmentMap - Segment ID map
   * @param {Object} options - Processing options
   * @returns {Object} Processed maps
   */
  processTextsWithSegments(originalTextsMap, segmentMap, options = {}) {
    const { validate = true, clean = true } = options;
    const processedMap = new Map();
    const processedSegmentMap = new Map();

    originalTextsMap.forEach((nodes, text) => {
      let processedText = text;

      // Clean text if requested
      if (clean) {
        processedText = cleanText(text, {
          normalizeWhitespace: false,
          removeEmptyLines: false,
          trimLines: false
        });
      }

      // Validate text if requested
      if (validate) {
        if (processedText.length > 0 && !isValidTextContent(processedText)) {
          logger.debug(`Skipping invalid text: ${text.substring(0, 30)}...`);
          return;
        }
      }

      // Use processed text as key if it changed
      const finalKey = processedText !== text ? processedText : text;

      // Preserve segment ID mapping
      const segmentId = segmentMap.get(text);

      if (processedMap.has(finalKey)) {
        // Merge nodes if text already exists
        processedMap.get(finalKey).push(...nodes);
      } else {
        processedMap.set(finalKey, [...nodes]);
      }

      // Map processed text to segment ID
      if (segmentId) {
        processedSegmentMap.set(finalKey, segmentId);
      }
    });

    return {
      processedTextsMap: processedMap,
      processedSegmentMap
    };
  }

  /**
   * Apply translations using segment IDs for reliable mapping
   * @param {Array} translationResults - Translation results with segment IDs
   * @param {Object} context - Application context
   * @returns {Promise<number>} Number of applied translations
   */
  async applyTranslationsWithSegments(translationResults, context = {}) {
    if (!translationResults || !Array.isArray(translationResults)) {
      logger.error('Invalid translation results provided');
      return 0;
    }

    logger.debug(`Applying ${translationResults.length} translations with segment IDs`);

    let appliedCount = 0;

    for (const result of translationResults) {
      try {
        const { segmentId, translatedText } = result;

        if (!translatedText || !segmentId) {
          logger.debug('Skipping translation result missing data', { segmentId });
          continue;
        }

        // Find DOM elements using segment ID
        const elements = document.querySelectorAll(`[data-segment-id="${segmentId}"]`);

        if (elements.length === 0) {
          logger.debug(`No elements found for segment ID: ${segmentId}`);
          continue;
        }

        // Apply translation to all matching elements
        for (const element of elements) {
          element.textContent = translatedText;

          // Apply container-level direction if needed
          if (context.targetLanguage) {
            applyContainerDirection(element, context.targetLanguage, translatedText);
          }
        }

        appliedCount++;
        logger.debug(`Applied translation for segment ${segmentId}`);

      } catch (error) {
        logger.error(`Failed to apply translation for segment:`, error);
      }
    }

    logger.debug(`Successfully applied ${appliedCount} translations`);
    return appliedCount;
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
          normalizeWhitespace: false,  // Don't normalize to preserve structure
          removeEmptyLines: false,
          trimLines: false  // Don't trim to preserve empty lines
        });
      }

      // Validate text if requested (but allow empty lines for structure)
      if (validate) {
        if (processedText.length > 0 && !isValidTextContent(processedText)) {
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
      errorHandler: this.errorHandler,
      ...context
    };

    try {
      logger.debug('Starting translation revert process');
      const revertedCount = await revertTranslations(extractionContext);

      // Note: Cache system has been removed - no cache to clear

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
      applyImmediately = true,
      returnDetails = true
    } = options;

    try {
      // Extract text for translation
      const extractionResult = await this.extractTextForTranslation(element, options);

      if (extractionResult.textsToTranslate.length === 0) {
        logger.debug('No texts to translate found');
        return {
          success: false,
          reason: 'no_translatable_text',
          ...extractionResult
        };
      }

      let allTranslations = new Map();

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
        newTranslations: extractionResult.textsToTranslate.length
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
      const { expandedTexts, originMapping } =
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
        textsToTranslate
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
      initialized: this.initialized
    };
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    logger.debug('Text extraction cache cleared (cache system removed)');
  }

  /**
   * Cleanup resources
   */
  cleanup() {
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
  parseAndCleanTranslationResponse,
  handleTranslationLengthMismatch,
  isValidTextContent,
  cleanText,

  // Text direction functions
  applyContainerDirection as applyContainerDirectionExtraction,
  restoreOriginalDirection as restoreOriginalDirectionExtraction
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
 * Clear all caches (legacy compatibility function)
 * Note: Cache system has been removed from Select Element feature
 */
export function clearAllCaches() {
  logger.debug('All Element Selection caches cleared (cache system removed)');
}