// DOM Manipulation Utilities for Element Selection
// Dedicated DOM operations for Select Element feature
// Independent from shared utilities

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { getElementSelectionCache } from './cache.js';
import { correctTextDirection } from './textDirection.js';

// Inject translation styles
let stylesInjected = false;
function injectTranslationStyles() {
  if (stylesInjected) return;

  try {
    const styleElement = document.createElement('style');
    styleElement.id = 'aiwc-translation-styles';
    styleElement.textContent = `
      /* Translation Styles - Minimal impact on original page styling */
      .aiwc-translation-wrapper {
        display: inline;
        unicode-bidi: isolate;
      }
      .aiwc-rtl-text {
        direction: rtl;
        text-align: right;
      }
      .aiwc-ltr-text {
        direction: ltr;
        text-align: left;
      }
      .aiwc-translated-text {
        unicode-bidi: isolate;
      }
      .aiwc-translation-wrapper *,
      .aiwc-rtl-text *,
      .aiwc-ltr-text * {
        font-family: inherit;
        font-size: inherit;
        font-weight: inherit;
        font-style: inherit;
        line-height: inherit;
        letter-spacing: inherit;
        color: inherit;
      }
      .aiwc-translation-wrapper code,
      .aiwc-translation-wrapper pre,
      .aiwc-rtl-text code,
      .aiwc-rtl-text pre,
      .aiwc-ltr-text code,
      .aiwc-ltr-text pre {
        font-family: inherit;
        direction: inherit;
        text-align: inherit;
        unicode-bidi: plaintext;
      }
      .aiwc-translation-wrapper table,
      .aiwc-rtl-text table,
      .aiwc-ltr-text table {
        border-collapse: inherit;
        border-spacing: inherit;
        width: inherit;
      }
      .aiwc-translation-wrapper td,
      .aiwc-translation-wrapper th,
      .aiwc-rtl-text td,
      .aiwc-rtl-text th,
      .aiwc-ltr-text td,
      .aiwc-ltr-text th {
        text-align: inherit;
        vertical-align: inherit;
        padding: inherit;
        border: inherit;
      }
      .aiwc-translation-wrapper li,
      .aiwc-rtl-text li,
      .aiwc-ltr-text li {
        list-style-type: inherit;
        list-style-position: inherit;
        margin: inherit;
        padding: inherit;
      }
      .aiwc-translation-wrapper[data-aiwc-direction="rtl"] {
        direction: rtl !important;
      }
      .aiwc-translation-wrapper[data-aiwc-direction="ltr"] {
        direction: ltr !important;
      }

      /* Preserve spacing between chunks */
      [data-aiwc-leading-space="true"]::before {
        content: " ";
        white-space: pre;
      }

      [data-aiwc-trailing-space="true"]::after {
        content: " ";
        white-space: pre;
      }

      /* Ensure proper spacing between adjacent translated spans */
      .aiwc-translation-wrapper span[data-aiwc-original-id] + span[data-aiwc-original-id] {
        margin-left: 0.25em;
      }

      .aiwc-translation-wrapper .aiwc-rtl-text + .aiwc-ltr-text,
      .aiwc-translation-wrapper .aiwc-ltr-text + .aiwc-rtl-text {
        margin-left: 0.25em;
      }
    `;
    document.head.appendChild(styleElement);
    stylesInjected = true;
    logger.debug('Translation styles injected');
  } catch (error) {
    logger.error('Failed to inject translation styles:', error);
  }
}

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

  // Inject styles before applying translations
  injectTranslationStyles();

  const cache = getElementSelectionCache();
  let processedCount = 0;

  // Filter out undefined or null text nodes to prevent errors
  const validTextNodes = textNodes.filter(node => node && node.nodeType === Node.TEXT_NODE);

  logger.debug('Filtered text nodes', {
    originalCount: textNodes.length,
    validCount: validTextNodes.length
  });

  // Handle chunked translations by maintaining node order
  validTextNodes.forEach((textNode, nodeIndex) => {
    if (!textNode.parentNode || textNode.nodeType !== Node.TEXT_NODE) {
      return;
    }

    const originalText = textNode.textContent;
    const trimmedOriginalText = originalText.trim();

    // Look for translation with chunk index support
    let translatedText = translations.get(trimmedOriginalText);

    // If not found directly, check for chunked translations
    if (!translatedText) {
      // Look for chunk identifier in the translation map
      const chunkPrefix = `chunk_${nodeIndex}_`;
      for (const [key, value] of translations.entries()) {
        if (key.startsWith(chunkPrefix) && key.endsWith(trimmedOriginalText)) {
          translatedText = value;
          break;
        }
      }
    }

    if (translatedText && trimmedOriginalText) {
      try {
        // Additional safety check for parentNode
        if (!textNode.parentNode) {
          logger.debug('Text node has no parent, skipping translation', {
            textContent: textNode.textContent.substring(0, 50)
          });
          return;
        }

        const parentElement = textNode.parentNode;
        const uniqueId = generateUniqueId();

        // Create outer wrapper (similar to working extension)
        const wrapperSpan = document.createElement("span");
        wrapperSpan.className = "aiwc-translation-wrapper";
        wrapperSpan.setAttribute("data-aiwc-original-id", uniqueId);

        // Create inner span for translated content
        const translationSpan = document.createElement("span");
        translationSpan.className = "aiwc-translation-inner";
        translationSpan.textContent = translatedText;

        // Apply text direction to the wrapper
        correctTextDirection(wrapperSpan, translatedText, {
          useWrapperElement: false,
          preserveExisting: true
        });

        // Add the translation span to the wrapper
        wrapperSpan.appendChild(translationSpan);

        // Replace the original text node with the wrapper
        // This is more atomic and reduces the chance of DOM interference
        try {
          // Store reference to next sibling before replacement
          const nextSibling = textNode.nextSibling;

          // Remove the original text node
          parentElement.removeChild(textNode);

          // Insert the wrapper at the same position
          if (nextSibling) {
            parentElement.insertBefore(wrapperSpan, nextSibling);
          } else {
            parentElement.appendChild(wrapperSpan);
          }

          // Store the original text content in the wrapper for potential revert
          wrapperSpan.setAttribute("data-aiwc-original-text", originalText);

          logger.debug('Successfully replaced text node with wrapper', {
            uniqueId: uniqueId,
            originalText: originalText.substring(0, 50)
          });
        } catch (error) {
          logger.error('Failed to replace text node with wrapper', error, {
            uniqueId: uniqueId,
            parentElement: parentElement.tagName
          });
          return;
        }

        // Store translation data in cache
        cache.storeOriginalText(uniqueId, {
          originalText: originalText,
          translatedText: translatedText,
          wrapperElement: wrapperSpan,
          originalTextNode: textNode,
          isWrapperBased: true
        });

        processedCount++;

        logger.debug('Translation applied with wrapper', {
          originalText: originalText.substring(0, 50),
          translatedText: translatedText.substring(0, 50),
          uniqueId: uniqueId
        });

      } catch (error) {
        logger.error('Error applying translation to text node:', error, {
          originalText: originalText.substring(0, 50),
          nodeIndex: nodeIndex
        });
      }
    }
  });

  logger.debug(`Applied translations to ${processedCount} text nodes using wrapper approach`);
}

/**
 * Revert all translations by removing wrapper elements and showing original text nodes
 * @param {Object} context - Context object with state and error handling
 * @returns {Promise<number>} Number of successfully reverted elements
 */
export async function revertTranslations(context) {
  const cache = getElementSelectionCache();
  let successfulReverts = 0;
  let failedReverts = 0;

  // Find all wrapper elements with translation data
  const wrappers = document.querySelectorAll("span.aiwc-translation-wrapper");

  logger.info(`Starting cleanup of ${wrappers.length} translated wrapper elements`);

  wrappers.forEach((wrapper) => {
    const originalId = wrapper.getAttribute("data-aiwc-original-id");

    if (originalId) {
      try {
        const parentElement = wrapper.parentNode;

        // Find the hidden original text node
        const originalTextNode = document.querySelector(`[data-aiwc-translation-id="${originalId}"]`);

        if (!originalTextNode) {
          logger.debug('Original text node not found for wrapper - likely removed by page DOM manipulation', { originalId });
          failedReverts++;
          return;
        }

        // Ensure parent element exists and is valid
        if (!parentElement) {
          logger.debug('Wrapper has no parent element, skipping removal', { originalId });
          failedReverts++;
          return;
        }

        // Show the original text node again
        originalTextNode.style.display = "";
        originalTextNode.removeAttribute("data-aiwc-translation-id");

        // Remove the wrapper element
        parentElement.removeChild(wrapper);
        successfulReverts++;

        logger.debug(`Reverted translation for element ${originalId}`);

      } catch (error) {
        failedReverts++;
        logger.error('Failed to revert wrapper:', error, {
          wrapperId: originalId,
          parentElement: wrapper.parentNode?.tagName || 'null'
        });

        // Attempt cleanup even if revert fails
        try {
          if (wrapper.parentNode) {
            // Find and show the original text node
            const originalTextNode = document.querySelector(`[data-aiwc-translation-id="${originalId}"]`);
            if (originalTextNode) {
              originalTextNode.style.display = "";
              originalTextNode.removeAttribute("data-aiwc-translation-id");
            }
            // Remove the wrapper
            wrapper.parentNode.removeChild(wrapper);
            logger.info('Fallback cleanup completed for failed wrapper');
          }
        } catch (fallbackError) {
          logger.error('Fallback cleanup also failed:', fallbackError);
        }

        if (context.errorHandler && typeof context.errorHandler.handle === "function") {
          context.errorHandler.handle(error, {
            type: 'UI',
            context: "element-selection-revert-translations",
            elementId: originalId,
            action: 'revert-failed'
          });
        }
      }
    }
  });

  // Also clean up any old-style translations for backward compatibility
  const oldStyleContainers = document.querySelectorAll("span[data-aiwc-original-text]");
  oldStyleContainers.forEach((container) => {
    const originalText = container.getAttribute("data-aiwc-original-text");
    const containerId = container.getAttribute("data-aiwc-original-id");

    if (originalText !== null) {
      try {
        const parentElement = container.parentNode;
        let elementToReplace = container;
        const wrapper = parentElement;
        if (wrapper && wrapper.classList.contains('aiwc-translation-wrapper')) {
          elementToReplace = wrapper;
        }

        if (parentElement) {
          const originalTextNode = document.createTextNode(originalText);
          parentElement.replaceChild(originalTextNode, elementToReplace);
          successfulReverts++;
        }
      } catch (error) {
        failedReverts++;
        logger.error('Failed to revert old-style container:', error);
      }
    }
  });

  // Clear cache
  cache.clearOriginalTexts();

  // Clean up any orphaned translation elements
  try {
    const orphanedElements = document.querySelectorAll('.aiwc-translated-text:not([data-aiwc-original-text])');
    orphanedElements.forEach(element => {
      element.remove();
      logger.debug('Removed orphaned translation element');
    });
  } catch (cleanupError) {
    logger.debug('Failed to cleanup orphaned elements:', cleanupError);
  }

  // Clean up injected styles if no translations remain
  try {
    const remainingTranslations = document.querySelectorAll('[data-aiwc-original-text]').length;
    if (remainingTranslations === 0 && stylesInjected) {
      const styleElement = document.getElementById('aiwc-translation-styles');
      if (styleElement) {
        styleElement.remove();
        stylesInjected = false;
        logger.debug('Translation styles removed');
      }
    }
  } catch (styleCleanupError) {
    logger.debug('Failed to cleanup translation styles:', styleCleanupError);
  }

  logger.info(`Cleanup completed: ${successfulReverts} successful, ${failedReverts} failed`);

  // Dispatch event to notify UI of cleanup completion
  try {
    const cleanupEvent = new CustomEvent('aiwc-translation-cleanup', {
      detail: {
        successful: successfulReverts,
        failed: failedReverts,
        total: wrappers.length
      }
    });
    document.dispatchEvent(cleanupEvent);
  } catch (eventError) {
    logger.debug('Failed to dispatch cleanup event:', eventError);
  }

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