// Element Selection Utilities Index
// Centralized exports for all Element Selection utilities

// Cache system
export {
  ElementSelectionCache,
  getElementSelectionCache,
  initializeCache
} from './cache.js';

// Text direction utilities
export {
  isRTLText,
  getTextDirection,
  correctTextDirection,
  storeOriginalElementStyles,
  restoreOriginalElementStyles,
  storeOriginalParentStyles,
  restoreOriginalParentStyles,
  applyTextDirectionToParent,
  detectBulkTextDirection,
  createDirectionAwareContainer,
  hasRTLDirection,
  ElementDirectionUtils,
  RTL_PATTERNS
} from './textDirection.js';

// DOM manipulation utilities
export {
  generateUniqueId,
  collectTextNodes,
  applyTranslationsToNodes,
  revertTranslations,
  findBestTextContainer,
  isValidTextElement,
  extractElementText,
  ElementDOMUtils
} from './domManipulation.js';

// Text processing utilities
export {
  expandTextsForTranslation,
  reassembleTranslations,
  separateCachedAndNewTexts,
  handleTranslationLengthMismatch,
  parseAndCleanTranslationResponse,
  isValidTextContent,
  cleanText,
  ElementTextProcessingUtils
} from './textProcessing.js';

// Main text extraction system
export {
  ElementTextExtraction,
  getElementTextExtraction,
  initializeTextExtraction,
  clearAllCaches,

  // Re-exported functions for compatibility
  collectTextNodes as collectTextNodesExtraction,
  applyTranslationsToNodes as applyTranslationsToNodesExtraction,
  revertTranslations as revertTranslationsExtraction,
  generateUniqueId as generateUniqueIdExtraction,
  extractElementText as extractElementTextExtraction,
  isValidTextElement as isValidTextElementExtraction,
  expandTextsForTranslation as expandTextsForTranslationExtraction,
  reassembleTranslations as reassembleTranslationsExtraction,
  separateCachedAndNewTexts as separateCachedAndNewTextsExtraction,
  parseAndCleanTranslationResponse as parseAndCleanTranslationResponseExtraction,
  handleTranslationLengthMismatch as handleTranslationLengthMismatchExtraction,
  isValidTextContent as isValidTextContentExtraction,
  cleanText as cleanTextExtraction,
  correctTextDirection as correctTextDirectionExtraction,
  storeOriginalParentStyles as storeOriginalParentStylesExtraction,
  restoreOriginalParentStyles as restoreOriginalParentStylesExtraction,
  getElementSelectionCache as getTranslationCache
} from './textExtraction.js';