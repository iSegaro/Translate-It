// DOM Manipulation Utilities for Element Selection
// Dedicated DOM operations for Select Element feature
// Independent from shared utilities

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getElementSelectionCache } from './cache.js';
import { correctTextDirection } from './textDirection.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'domManipulation');

/**
 * Generate a unique ID for tracking translated elements
 * @returns {string} A unique identifier string
 */
export function generateUniqueId() {
  return `aiwc-${Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
}

/**
 * Collect all text nodes from target element with intelligent grouping
 * @param {HTMLElement} targetElement - Element to collect text nodes from
 * @param {boolean} useIntelligentGrouping - Whether to use optimized collection
 * @returns {Object} Object containing textNodes array and originalTextsMap
 */
export function collectTextNodes(targetElement, useIntelligentGrouping = true) {
  if (!targetElement) {
    logger.error('collectTextNodes: No target element provided');
    return { textNodes: [], originalTextsMap: new Map() };
  }

  logger.debug('Starting text node collection', {
    element: targetElement.tagName,
    useOptimized: useIntelligentGrouping
  });

  // For large elements, always use optimized version
  if (useIntelligentGrouping) {
    return collectTextNodesOptimized(targetElement);
  }

  // Original implementation for backward compatibility
  return collectTextNodesBasic(targetElement);
}

/**
 * Basic text node collection (backward compatibility)
 * @param {HTMLElement} targetElement - Element to collect from
 * @returns {Object} Collection result
 */
function collectTextNodesBasic(targetElement) {
  const walker = document.createTreeWalker(
    targetElement,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Skip hidden elements
        try {
          if (typeof window !== 'undefined') {
            const style = window.getComputedStyle(parent);
            if (style.display === "none" || style.visibility === "hidden") {
              return NodeFilter.FILTER_REJECT;
            }
          }
        } catch {
          // If getComputedStyle fails, accept the node
        }

        // Accept all visible text nodes
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    },
    false,
  );

  const textNodes = [];
  const originalTextsMap = new Map();
  let node;

  while ((node = walker.nextNode())) {
    const trimmedText = node.textContent.trim();
    if (trimmedText) {
      textNodes.push(node);

      if (originalTextsMap.has(trimmedText)) {
        originalTextsMap.get(trimmedText).push(node);
      } else {
        originalTextsMap.set(trimmedText, [node]);
      }
    }
  }

  logger.debug(`Basic collection: ${textNodes.length} nodes, ${originalTextsMap.size} unique texts`);
  return { textNodes, originalTextsMap };
}

/**
 * Optimized text node collection with intelligent grouping
 * @param {HTMLElement} targetElement - Element to collect from
 * @returns {Object} Collection result
 */
function collectTextNodesOptimized(targetElement) {
  const walker = document.createTreeWalker(
    targetElement,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Skip hidden elements
        try {
          if (typeof window !== 'undefined') {
            const style = window.getComputedStyle(parent);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
              return NodeFilter.FILTER_REJECT;
            }
          }
        } catch {
          // If getComputedStyle fails, accept the node
        }

        // Skip script/style content
        if (parent.closest('script, style, noscript, [aria-hidden="true"]')) {
          return NodeFilter.FILTER_REJECT;
        }

        // Accept all visible text nodes
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    },
    false,
  );

  const textNodes = [];
  const originalTextsMap = new Map();
  let node;

  while ((node = walker.nextNode())) {
    const trimmedText = node.textContent.trim();
    if (trimmedText) {
      textNodes.push(node);
      if (originalTextsMap.has(trimmedText)) {
        originalTextsMap.get(trimmedText).push(node);
      } else {
        originalTextsMap.set(trimmedText, [node]);
      }
    }
  }

  logger.debug(`Optimized collection: ${textNodes.length} nodes, ${originalTextsMap.size} unique texts`);
  return { textNodes, originalTextsMap };
}

/**
 * Apply translations to DOM nodes with span replacement
 * @param {Node[]} textNodes - Array of text nodes to replace
 * @param {Map} translations - Map of original text to translated text
 * @param {Object} context - Context object with state and error handling
 */
export function applyTranslationsToNodes(textNodes, translations, context) {
  if (!textNodes || !translations || !context) {
    logger.error('applyTranslationsToNodes: Missing required parameters');
    return;
  }

  const cache = getElementSelectionCache();
  let processedCount = 0;

  textNodes.forEach((textNode) => {
    if (!textNode.parentNode || textNode.nodeType !== Node.TEXT_NODE) {
      return;
    }

    const originalText = textNode.textContent;
    const trimmedOriginalText = originalText.trim();
    const translatedText = translations.get(trimmedOriginalText);

    if (translatedText && trimmedOriginalText) {
      try {
        const parentElement = textNode.parentNode;
        const uniqueId = generateUniqueId();

        // Create container span for translation
        const containerSpan = document.createElement("span");
        containerSpan.setAttribute("data-aiwc-original-id", uniqueId);
        containerSpan.setAttribute("data-aiwc-original-text", originalText);

        // Apply correct text direction to container
        correctTextDirection(containerSpan, translatedText);

        // Handle multi-line text
        const originalLines = originalText.split("\n");
        const translatedLines = translatedText.split("\n");

        originalLines.forEach((originalLine, index) => {
          const translatedLine = translatedLines[index] !== undefined ? translatedLines[index] : "";
          const innerSpan = document.createElement("span");
          innerSpan.textContent = translatedLine;

          // Store original text data in cache
          cache.storeOriginalText(uniqueId, {
            originalText: originalLine,
            wrapperElement: innerSpan,
          });

          containerSpan.appendChild(innerSpan);

          if (index < originalLines.length - 1) {
            const br = document.createElement("br");
            br.setAttribute("data-aiwc-br", "true");
            containerSpan.appendChild(br);
          }
        });

        // Replace text node with container
        parentElement.replaceChild(containerSpan, textNode);
        processedCount++;

      } catch (error) {
        logger.error('Error replacing text node:', error, {
          textNode,
          originalText: originalText.substring(0, 50)
        });

        // Handle error through context if available
        if (context.errorHandler && typeof context.errorHandler.handle === "function") {
          context.errorHandler.handle(error, {
            type: 'UI',
            context: "element-selection-apply-translations",
            elementId: "text-node-replacement",
          });
        }
      }
    }
  });

  logger.debug(`Applied translations to ${processedCount} text nodes`);
}

/**
 * Revert all translations by finding and replacing span elements
 * @param {Object} context - Context object with state and error handling
 * @returns {Promise<number>} Number of successfully reverted elements
 */
export async function revertTranslations(context) {
  const cache = getElementSelectionCache();
  let successfulReverts = 0;

  // Find all span elements with translation data
  const containers = document.querySelectorAll("span[data-aiwc-original-text]");

  containers.forEach((container) => {
    const originalText = container.getAttribute("data-aiwc-original-text");
    if (originalText !== null) {
      try {
        const parentElement = container.parentNode;

        // Remove translation-related CSS classes
        container.classList.remove('aiwc-translated-text', 'aiwc-rtl-text', 'aiwc-ltr-text');

        // Create original text node
        const originalTextNode = document.createTextNode(originalText);
        parentElement.replaceChild(originalTextNode, container);
        successfulReverts++;

        // Remove associated <br> elements
        let nextNode = originalTextNode.nextSibling;
        while (
          nextNode &&
          nextNode.nodeName === "BR" &&
          nextNode.getAttribute("data-aiwc-br") === "true"
        ) {
          const nodeToRemove = nextNode;
          nextNode = nextNode.nextSibling;
          nodeToRemove.parentNode.removeChild(nodeToRemove);
        }
      } catch (error) {
        logger.error('Failed to revert container:', error, {
          containerId: container.getAttribute("data-aiwc-original-id")
        });

        if (context.errorHandler && typeof context.errorHandler.handle === "function") {
          context.errorHandler.handle(error, {
            type: 'UI',
            context: "element-selection-revert-translations",
            elementId: container.getAttribute("data-aiwc-original-id"),
          });
        }
      }
    }
  });

  // Clear cache
  cache.clearOriginalTexts();

  logger.debug(`Reverted ${successfulReverts} translated elements`);
  return successfulReverts;
}

/**
 * Find the best text container element for translation
 * @param {HTMLElement} startElement - Starting element
 * @returns {HTMLElement} Best container element
 */
export function findBestTextContainer(startElement) {
  if (!startElement) return null;

  let element = startElement;

  // Move up the DOM tree to find a good container
  while (element && element !== document.body) {
    // Check if element has meaningful direct text content
    const immediateText = getImmediateTextContent(element);
    if (immediateText && immediateText.trim().length > 10) {
      return element;
    }

    // Check if element is a good container candidate
    if (isGoodContainerElement(element)) {
      return element;
    }

    element = element.parentElement;
  }

  return startElement;
}

/**
 * Get immediate text content of element (excluding children)
 * @param {HTMLElement} element - Element to get text from
 * @returns {string} Immediate text content
 */
function getImmediateTextContent(element) {
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    }
  }
  return text.trim();
}

/**
 * Check if element is a good container for translation
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} Whether element is a good container
 */
function isGoodContainerElement(element) {
  const tagName = element.tagName.toLowerCase();

  // Good container elements
  const goodContainers = ['p', 'div', 'article', 'section', 'li', 'td', 'th', 'blockquote'];
  if (goodContainers.includes(tagName)) {
    return true;
  }

  // Check for content-rich elements
  const textLength = element.textContent?.trim().length || 0;
  const childCount = element.children.length;

  // Element with substantial text and not too many children
  return textLength > 50 && childCount < 10;
}

/**
 * Check if element is valid for text extraction
 * @param {HTMLElement} element - Element to validate
 * @returns {boolean} Whether element is valid
 */
export function isValidTextElement(element) {
  if (!element) return false;

  const cache = getElementSelectionCache();

  // Check cache first
  const cached = cache.getCachedElementValidation(element);
  if (cached !== undefined) {
    return cached;
  }

  let isValid = false;

  try {
    // Skip script, style, and other non-text elements
    const invalidTags = ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"];
    if (invalidTags.includes(element.tagName)) {
      isValid = false;
    } else {
      // Skip invisible elements
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        isValid = false;
      } else {
        // Check for meaningful text content
        const hasText = element.textContent && element.textContent.trim().length > 0;
        const isTextInput = element.tagName === "INPUT" && element.type === "text";
        const isTextArea = element.tagName === "TEXTAREA";

        isValid = hasText || isTextInput || isTextArea;
      }
    }
  } catch (error) {
    logger.debug("Error validating element:", error);
    isValid = false;
  }

  // Cache the result
  cache.cacheElementValidation(element, isValid);
  return isValid;
}

/**
 * Extract visible text from element with multiple strategies
 * @param {HTMLElement} element - Element to extract text from
 * @param {Object} options - Extraction options
 * @returns {string} Extracted text
 */
export function extractElementText(element, options = {}) {
  if (!element) return '';

  const {
    useTreeWalker = false,
    respectVisibility = true,
    trimWhitespace = true
  } = options;

  const cache = getElementSelectionCache();

  // Check cache first
  const cached = cache.getCachedTextContent(element);
  if (cached !== undefined) {
    return cached;
  }

  let text = '';

  try {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      text = element.value || "";
    } else if (useTreeWalker) {
      text = extractTextWithTreeWalker(element, respectVisibility);
    } else if (respectVisibility && element.innerText) {
      text = element.innerText;
    } else {
      text = element.textContent || "";
    }

    if (trimWhitespace) {
      text = text.trim();
    }
  } catch (error) {
    logger.debug("Error extracting text:", error);
    text = '';
  }

  // Cache the result
  cache.cacheTextContent(element, text);
  return text;
}

/**
 * Extract text using tree walker with visibility respect
 * @param {HTMLElement} element - Element to extract from
 * @param {boolean} respectVisibility - Whether to skip hidden elements
 * @returns {string} Extracted text
 */
function extractTextWithTreeWalker(element, respectVisibility = true) {
  let text = "";

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      if (respectVisibility) {
        try {
          const style = window.getComputedStyle(parent);
          if (style.display === "none" || style.visibility === "hidden") {
            return NodeFilter.FILTER_REJECT;
          }
        } catch {
          // If getComputedStyle fails, accept the node
        }
      }

      // Skip empty text nodes
      const textContent = node.textContent.trim();
      if (!textContent) return NodeFilter.FILTER_REJECT;

      // Skip text from script or style tags
      if (parent.closest('script, style, noscript')) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    const nodeText = node.textContent.trim();
    if (nodeText) {
      text += nodeText + " ";
    }
  }

  return text.trim();
}

/**
 * Utility object with commonly used DOM functions
 */
export const ElementDOMUtils = {
  collect: collectTextNodes,
  apply: applyTranslationsToNodes,
  revert: revertTranslations,
  extract: extractElementText,
  validate: isValidTextElement,
  findContainer: findBestTextContainer,
  generateId: generateUniqueId
};