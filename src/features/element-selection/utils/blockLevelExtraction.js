// Block-Level Extraction - Extract complete sentences with inline element placeholders
// Part of the Contextual Sentence Translation system

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

/**
 * Block-level elements that naturally contain complete thoughts/sentences
 */
const BLOCK_ELEMENTS = new Set([
  'P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'TD', 'TH', 'BLOCKQUOTE', 'ARTICLE', 'SECTION',
  'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGCAPTION'
]);

/**
 * Inline elements that should be replaced with placeholders
 */
const INLINE_ELEMENTS = new Set([
  'A', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'STRIKE', 'CODE', 'MARK',
  'SMALL', 'SUB', 'SUP', 'TIME', 'DATA', 'ABBR', 'Q', 'CITE',
  'DFN', 'VAR', 'SAMP', 'KBD', 'SPAN', 'LABEL', 'WBR'
]);

/**
 * Elements that should never be treated as inline (even if they are inline by default)
 */
const EXCLUDED_ELEMENTS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO'
]);

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'blockLevelExtraction');

/**
 * Check if an element is a block-level element
 * @param {HTMLElement} element - The element to check
 * @returns {boolean} True if element is block-level
 */
export function isBlockElement(element) {
  if (!element || !element.tagName) return false;
  return BLOCK_ELEMENTS.has(element.tagName.toUpperCase());
}

/**
 * Check if an element is an inline element
 * @param {HTMLElement} element - The element to check
 * @returns {boolean} True if element is inline
 */
export function isInlineElement(element) {
  if (!element || !element.tagName) return false;

  const tagName = element.tagName.toUpperCase();

  // Exclude certain elements
  if (EXCLUDED_ELEMENTS.has(tagName)) {
    return false;
  }

  // Check if it's in our inline elements list
  if (INLINE_ELEMENTS.has(tagName)) {
    return true;
  }

  // Check computed style for inline display
  try {
    const style = window.getComputedStyle(element);
    return style.display === 'inline' || style.display === 'inline-block';
  } catch {
    return false;
  }
}

/**
 * Find the closest block-level container for an element
 * @param {HTMLElement} startElement - The starting element
 * @returns {HTMLElement} The block container or the start element if none found
 */
export function findBlockContainer(startElement) {
  let current = startElement;

  while (current && current !== document.body) {
    if (isBlockElement(current)) {
      logger.debug(`Found block container: ${current.tagName}`, {
        id: current.id,
        className: current.className
      });
      return current;
    }
    current = current.parentElement;
  }

  // Fallback to body if no block container found
  logger.debug('No block container found, using body');
  return document.body;
}

/**
 * Extract text from a block container with inline elements replaced by placeholders
 * @param {HTMLElement} blockContainer - The block container to extract from
 * @param {PlaceholderRegistry} registry - The placeholder registry
 * @param {string} format - The placeholder format ('ai', 'xml', or 'traditional')
 * @returns {Object} Object containing extracted text and metadata
 */
export function extractBlockWithPlaceholders(blockContainer, registry, format = 'ai') {
  logger.debug('Starting block-level extraction with placeholders', {
    tagName: blockContainer.tagName,
    className: blockContainer.className,
    format
  });

  const result = extractTextWithInlinePlaceholders(blockContainer, registry, format);
  const placeholderCount = registry.size;

  logger.debug('Block-level extraction complete', {
    textLength: result.text.length,
    placeholderCount,
    format,
    textPreview: result.text.substring(0, 100)
  });

  return {
    text: result.text,
    placeholderCount,
    blockContainer,
    hasPlaceholders: placeholderCount > 0,
    format
  };
}

/**
 * Recursively extract text from a node, replacing inline elements with placeholders
 * @param {Node} node - The node to extract from
 * @param {PlaceholderRegistry} registry - The placeholder registry
 * @param {string} format - The placeholder format ('ai', 'xml', or 'traditional')
 * @returns {string} The extracted text with placeholders
 */
export function extractTextWithInlinePlaceholders(node, registry, format = 'ai') {
  let result = '';

  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      // Preserve text content including whitespace
      result += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child;

      // Skip excluded elements
      if (EXCLUDED_ELEMENTS.has(element.tagName.toUpperCase())) {
        continue;
      }

      if (isInlineElement(element)) {
        // Register inline element as placeholder with format
        const placeholderId = registry.register(element, format);

        // Generate format-aware placeholder
        if (format === 'xml') {
          // CRITICAL: Always use lowercase 'x' and 'id' for XML
          result += `<x id="${placeholderId}"/>`;
        } else {
          // AI format (default, existing behavior)
          result += `[[AIWC-${placeholderId}]]`;
        }
      } else if (isBlockElement(element)) {
        // For nested block elements, extract recursively but add space
        result += extractTextWithInlinePlaceholders(element, registry, format) + ' ';
      } else {
        // For other elements, recurse into children
        result += extractTextWithInlinePlaceholders(element, registry, format);
      }
    }
  }

  return result;
}

/**
 * Extract multiple blocks from a container
 * Useful for handling complex layouts with multiple block-level elements
 * @param {HTMLElement} container - The container to extract from
 * @param {PlaceholderRegistry} registry - The placeholder registry
 * @param {string} format - The placeholder format ('ai', 'xml', or 'traditional')
 * @returns {Array} Array of extraction results
 */
export function extractMultipleBlocksWithPlaceholders(container, registry, format = 'ai') {
  const results = [];
  const blocks = container.querySelectorAll(Array.from(BLOCK_ELEMENTS).join(','));

  logger.debug(`Found ${blocks.length} block elements to extract`, { format });

  for (const block of blocks) {
    // Skip if block is nested inside another block we've already processed
    let isNested = false;
    for (const existing of results) {
      if (existing.blockContainer.contains(block)) {
        isNested = true;
        break;
      }
    }

    if (!isNested) {
      const result = extractBlockWithPlaceholders(block, registry, format);
      results.push(result);
    }
  }

  return results;
}

/**
 * Get text statistics for a block container
 * @param {HTMLElement} blockContainer - The block container
 * @returns {Object} Statistics about the block
 */
export function getBlockStatistics(blockContainer) {
  const textNodes = [];
  const inlineElements = [];
  const walker = document.createTreeWalker(
    blockContainer,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent.trim().length > 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (EXCLUDED_ELEMENTS.has(node.tagName.toUpperCase())) {
            return NodeFilter.FILTER_REJECT;
          }
          return isInlineElement(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_REJECT;
      }
    }
  );

  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node);
    } else {
      inlineElements.push(node);
    }
  }

  return {
    textNodeCount: textNodes.length,
    inlineElementCount: inlineElements.length,
    totalTextLength: textNodes.reduce((sum, n) => sum + n.textContent.length, 0),
    blockTagName: blockContainer.tagName
  };
}
