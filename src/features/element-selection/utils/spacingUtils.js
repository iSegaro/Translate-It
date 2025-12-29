/**
 * General spacing utilities for translation text processing
 * Provides reusable functions to prevent words from sticking together
 */

/**
 * Analyze spacing requirements for text nodes adjacent to inline elements
 * This is a general utility that can be used across different translation contexts
 * @param {Text} textNode - The text node being analyzed
 * @param {string} originalText - Original text content
 * @param {string} translatedText - Translated text content
 * @returns {string} Processed text with proper spacing
 */
export function ensureSpacingBeforeInlineElements(textNode, originalText, translatedText) {
  if (!textNode || !originalText || !translatedText) {
    return translatedText;
  }

  let processedText = translatedText;

  // Check if this text node is followed by an inline element that needs spacing
  const nextSibling = textNode.nextSibling;
  if (nextSibling && nextSibling.nodeType === Node.ELEMENT_NODE) {
    const tagName = nextSibling.tagName.toLowerCase();

    // Comprehensive list of inline elements that typically need spacing before them
    const inlineElements = [
      'a',           // Links
      'span',        // Generic inline containers
      'strong',      // Bold text
      'em',          // Emphasis
      'b',           // Bold (non-semantic)
      'i',           // Italic (non-semantic)
      'u',           // Underline
      'code',        // Code snippets
      'button',      // Buttons
      'input',       // Form inputs
      'select',      // Select dropdowns
      'label',       // Form labels
      'small',        // Small text
      'time',        // Time elements
      'abbr'         // Abbreviations
    ];

    if (inlineElements.includes(tagName)) {
      const elementText = nextSibling.textContent?.trim() || '';

      // Special case: Only add spacing if the inline element has meaningful content
      if (elementText.length > 0 && !processedText.endsWith(' ') && !processedText.endsWith('\t')) {
        processedText = processedText + ' ';
      }
    }
  }

  // ENHANCED: Check if the original text had trailing whitespace that should be preserved
  if (originalText.endsWith(' ') && !processedText.endsWith(' ')) {
    processedText = processedText + ' ';
  }

  // ENHANCED: Check if the original text had trailing newline that should be preserved
  if (originalText.endsWith('\n') && !processedText.endsWith('\n')) {
    processedText = processedText + '\n';
  }

  // ENHANCED: Preserve spacing patterns from original text
  const originalEndsWithSpace = originalText.match(/\s$/);
  const translatedEndsWithSpace = processedText.match(/\s$/);

  if (originalEndsWithSpace && !translatedEndsWithSpace) {
    // Add the same whitespace pattern as original
    processedText = processedText + originalEndsWithSpace[0];
  }

  return processedText;
}

/**
 * Enhanced spacing analysis with comprehensive pattern detection
 * @param {Text} textNode - The text node being analyzed
 * @param {string} originalText - Original text content
 * @param {string} translatedText - Translated text content
 * @returns {Object} Analysis result with spacing requirements
 */
export function analyzeSpacingRequirements(textNode, originalText, translatedText) {
  const result = {
    needsTrailingSpace: false,
    needsLeadingSpace: false,
    confidence: 'low',
    reason: ''
  };

  if (!textNode || !originalText || !translatedText) {
    return result;
  }

  // Check trailing spacing requirements
  const nextSibling = textNode.nextSibling;
  if (nextSibling && nextSibling.nodeType === Node.ELEMENT_NODE) {
    const tagName = nextSibling.tagName.toLowerCase();
    const inlineElements = ['a', 'span', 'strong', 'em', 'b', 'i', 'u', 'code', 'button', 'input', 'select', 'label'];

    if (inlineElements.includes(tagName)) {
      const elementText = nextSibling.textContent?.trim() || '';

      if (elementText.length > 0 && !originalText.endsWith(' ') && !originalText.endsWith('\t')) {
        result.needsTrailingSpace = true;
        result.confidence = 'high';
        result.reason = `Text followed by ${tagName} element with content`;
      }
    }
  }

  // Check leading spacing requirements
  const prevSibling = textNode.previousSibling;
  if (prevSibling && prevSibling.nodeType === Node.ELEMENT_NODE) {
    const tagName = prevSibling.tagName.toLowerCase();
    const inlineElements = ['a', 'span', 'strong', 'em', 'b', 'i', 'u', 'code', 'button', 'input', 'select', 'label'];

    if (inlineElements.includes(tagName)) {
      const elementText = prevSibling.textContent?.trim() || '';

      if (elementText.length > 0 && !originalText.startsWith(' ') && !originalText.startsWith('\t')) {
        result.needsLeadingSpace = true;
        result.confidence = 'high';
        result.reason = `Text preceded by ${tagName} element with content`;
      }
    }
  }

  return result;
}

/**
 * Apply spacing corrections based on analysis results
 * @param {string} text - Text to process
 * @param {Object} spacingRequirements - Analysis result
 * @returns {string} Processed text with spacing applied
 */
export function applySpacingCorrections(text, spacingRequirements) {
  if (!text || !spacingRequirements) {
    return text;
  }

  let processedText = text;

  // Apply trailing space if needed
  if (spacingRequirements.needsTrailingSpace && !processedText.endsWith(' ')) {
    processedText = processedText + ' ';
  }

  // Apply leading space if needed
  if (spacingRequirements.needsLeadingSpace && !processedText.startsWith(' ')) {
    processedText = ' ' + processedText;
  }

  return processedText;
}

/**
 * Preserve whitespace between adjacent text nodes during translation
 * This ensures that spacing between separate translated segments is maintained
 * @param {Text} textNode - The current text node
 * @param {string} originalText - Original text content of this node
 * @param {string} translatedText - Translated text content for this node
 * @returns {string} Processed text with preserved spacing
 */
export function preserveAdjacentSpacing(textNode, originalText, translatedText) {
  if (!textNode || !originalText || !translatedText) {
    return translatedText;
  }

  let processedText = translatedText;

  // Check if the original text ends with whitespace that should be preserved
  const originalEndsWithSpace = originalText.match(/\s+$/);
  if (originalEndsWithSpace) {
    // If original had trailing whitespace, ensure translation has it too
    const translatedEndsWithSpace = processedText.match(/\s+$/);
    if (!translatedEndsWithSpace) {
      processedText = processedText + originalEndsWithSpace[0];
    }
  }

  // Special handling for cases where the next node is a text node that might need spacing
  const nextSibling = textNode.nextSibling;
  if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
    const nextText = nextSibling.textContent || '';

    // If the next node starts with whitespace but our translation doesn't end with it
    if (nextText.match(/^\s+/) && !processedText.match(/\s+$/)) {
      // Add a space to maintain the separation
      processedText = processedText + ' ';
    }
  }

  return processedText;
}

/**
 * Utility object for convenient access to spacing functions
 */
export const SpacingUtils = {
  ensureSpacingBeforeInlineElements,
  analyzeSpacingRequirements,
  applySpacingCorrections,
  preserveAdjacentSpacing
};