// Element Selection Utilities Index
// Centralized exports for all Element Selection utilities

// Note: Cache system has been removed from Select Element feature

// Text direction utilities
export {
  isRTLLanguage,
  getTextDirection,
  applyContainerDirection,
  restoreOriginalDirection,
  createDirectionAwareContainer,
  ElementDirectionUtils,
  RTL_LANGUAGES,
  RTL_CHARACTER_PATTERN
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

  // Re-exported functions for compatibility
  collectTextNodes as collectTextNodesExtraction,
  applyTranslationsToNodes as applyTranslationsToNodesExtraction,
  revertTranslations as revertTranslationsExtraction,
  generateUniqueId as generateUniqueIdExtraction,
  extractElementText as extractElementTextExtraction,
  isValidTextElement as isValidTextElementExtraction,
  expandTextsForTranslation as expandTextsForTranslationExtraction,
  reassembleTranslations as reassembleTranslationsExtraction,
  parseAndCleanTranslationResponse as parseAndCleanTranslationResponseExtraction,
  handleTranslationLengthMismatch as handleTranslationLengthMismatchExtraction,
  isValidTextContent as isValidTextContentExtraction,
  cleanText as cleanTextExtraction,
  applyContainerDirection as applyContainerDirectionExtraction,
  restoreOriginalDirection as restoreOriginalDirectionExtraction
} from './textExtraction.js';