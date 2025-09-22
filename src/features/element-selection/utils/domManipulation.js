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

  // Handle chunked translations by maintaining node order
  textNodes.forEach((textNode, nodeIndex) => {
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
        const parentElement = textNode.parentNode;
        const uniqueId = generateUniqueId();

        // Create container span for translation
        const containerSpan = document.createElement("span");
        containerSpan.setAttribute("data-aiwc-original-id", uniqueId);
        containerSpan.setAttribute("data-aiwc-original-text", originalText);

        // Apply correct text direction to container using wrapper approach
        correctTextDirection(containerSpan, translatedText, {
          useWrapperElement: true,
          preserveExisting: true
        });

        // Check if parent is an inline element - if so, treat newlines as spaces
        const parentDisplay = window.getComputedStyle(parentElement).display;
        const isInlineContext = parentDisplay === 'inline' || parentDisplay === 'inline-block';

        // For inline contexts, convert newlines to spaces to prevent unwanted line breaks
        let processedOriginalText = originalText;
        let processedTranslatedText = translatedText;

        if (isInlineContext) {
          processedOriginalText = originalText.replace(/\n/g, ' ');
          processedTranslatedText = translatedText.replace(/\n/g, ' ');
        }

        // Handle multi-line text
        const originalLines = processedOriginalText.split("\n");
        const translatedLines = processedTranslatedText.split("\n");

        // Ensure we have the same number of lines
        while (translatedLines.length < originalLines.length) {
          translatedLines.push("");
        }

        originalLines.forEach((originalLine, index) => {
          const translatedLine = translatedLines[index] !== undefined ? translatedLines[index] : "";
          const innerSpan = document.createElement("span");

          // Check if this line had leading/trailing spaces in original
          const hasLeadingSpace = /^\s/.test(originalLine);
          const hasTrailingSpace = /\s$/.test(originalLine);

          // Add data attributes for spacing information
          if (hasLeadingSpace) {
            innerSpan.setAttribute("data-aiwc-leading-space", "true");
          }
          if (hasTrailingSpace) {
            innerSpan.setAttribute("data-aiwc-trailing-space", "true");
          }

          innerSpan.textContent = translatedLine;

          // Store original text data in cache with line info
          cache.storeOriginalText(`${uniqueId}_line_${index}`, {
            originalText: originalLine,
            translatedText: translatedLine,
            wrapperElement: innerSpan,
            lineIndex: index,
            totalLines: originalLines.length,
            hasLeadingSpace,
            hasTrailingSpace
          });

          containerSpan.appendChild(innerSpan);

          // Only add <br> if this is not the last line AND the next line is not empty
          if (index < originalLines.length - 1 && originalLines[index + 1].trim() !== "") {
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
  let failedReverts = 0;

  // Find all span elements with translation data
  const containers = document.querySelectorAll("span[data-aiwc-original-text]");

  logger.info(`Starting cleanup of ${containers.length} translated elements`);

  containers.forEach((container) => {
    const originalText = container.getAttribute("data-aiwc-original-text");
    const originalId = container.getAttribute("data-aiwc-original-id");

    if (originalText !== null) {
      try {
        const parentElement = container.parentNode;

        // Check if container is wrapped
        let elementToReplace = container;
        const wrapper = parentElement;
        if (wrapper && wrapper.classList.contains('aiwc-translation-wrapper')) {
          elementToReplace = wrapper;
        }

        // Store computed styles before removal for potential restoration
        const computedStyles = window.getComputedStyle(container);
        const savedStyles = {
          display: computedStyles.display,
          visibility: computedStyles.visibility,
          position: computedStyles.position,
          opacity: computedStyles.opacity
        };

        // Remove translation-related CSS classes from container and wrapper
        container.classList.remove('aiwc-translated-text', 'aiwc-rtl-text', 'aiwc-ltr-text');
        if (wrapper && wrapper.classList.contains('aiwc-translation-wrapper')) {
          wrapper.classList.remove('aiwc-rtl-text', 'aiwc-ltr-text');
        }

        // Remove any inline styles added during translation
        const inlineStylesToRemove = ['background-color', 'color', 'font-weight', 'text-decoration'];
        inlineStylesToRemove.forEach(style => {
          if (container.style[style]) {
            container.style[style] = '';
          }
        });

        // Create original text node
        const originalTextNode = document.createTextNode(originalText);

        // Ensure parent element exists and is valid
        if (!parentElement) {
          logger.warn('Container has no parent element, skipping removal', { originalId });
          failedReverts++;
          return;
        }

        parentElement.replaceChild(originalTextNode, elementToReplace);
        successfulReverts++;

        // Remove associated <br> elements
        let nextNode = originalTextNode.nextSibling;
        let removedBrCount = 0;
        while (
          nextNode &&
          nextNode.nodeName === "BR" &&
          nextNode.getAttribute("data-aiwc-br") === "true"
        ) {
          const nodeToRemove = nextNode;
          nextNode = nextNode.nextSibling;
          nodeToRemove.parentNode.removeChild(nodeToRemove);
          removedBrCount++;
        }

        if (removedBrCount > 0) {
          logger.debug(`Removed ${removedBrCount} associated <br> elements for element ${originalId}`);
        }

      } catch (error) {
        failedReverts++;
        logger.error('Failed to revert container:', error, {
          containerId: container.getAttribute("data-aiwc-original-id"),
          containerTagName: container.tagName,
          parentElement: container.parentNode?.tagName || 'null'
        });

        // Attempt cleanup even if revert fails
        try {
          if (container.parentNode) {
            // Fallback: just remove the translated element
            const fallbackNode = document.createTextNode(originalText || '');
            const parentNode = container.parentNode;
            const wrapperElement = parentNode.classList.contains('aiwc-translation-wrapper') ? parentNode : null;
            const elementToRemove = wrapperElement || container;
            parentNode.replaceChild(fallbackNode, elementToRemove);
            logger.info('Fallback cleanup completed for failed element');
          }
        } catch (fallbackError) {
          logger.error('Fallback cleanup also failed:', fallbackError);
        }

        if (context.errorHandler && typeof context.errorHandler.handle === "function") {
          context.errorHandler.handle(error, {
            type: 'UI',
            context: "element-selection-revert-translations",
            elementId: container.getAttribute("data-aiwc-original-id"),
            action: 'revert-failed'
          });
        }
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
    logger.warn('Failed to cleanup orphaned elements:', cleanupError);
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
    logger.warn('Failed to cleanup translation styles:', styleCleanupError);
  }

  logger.info(`Cleanup completed: ${successfulReverts} successful, ${failedReverts} failed`);

  // Dispatch event to notify UI of cleanup completion
  try {
    const cleanupEvent = new CustomEvent('aiwc-translation-cleanup', {
      detail: {
        successful: successfulReverts,
        failed: failedReverts,
        total: containers.length
      }
    });
    document.dispatchEvent(cleanupEvent);
  } catch (eventError) {
    logger.warn('Failed to dispatch cleanup event:', eventError);
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