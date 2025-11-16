// DOM Manipulation Utilities for Element Selection
// Dedicated DOM operations for Select Element feature
// Independent from shared utilities

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
// Note: Cache system has been removed from Select Element feature
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

        // Accept all visible text nodes, including empty ones (for structure preservation)
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false,
  );

  const textNodes = [];
  const originalTextsMap = new Map();
  let node;

  while ((node = walker.nextNode())) {
    const text = node.textContent;
    const trimmedText = text.trim();

    // Include empty nodes too for structure preservation
    if (trimmedText || text.length === 0 || (/^\s*$/.test(text) && text.length > 0)) {
      textNodes.push(node);

      // Use full text (including whitespace) to preserve structure
      const mapKey = text; // Keep original text with whitespace for structure preservation
      if (originalTextsMap.has(mapKey)) {
        originalTextsMap.get(mapKey).push(node);
      } else {
        originalTextsMap.set(mapKey, [node]);
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

        // Accept all visible text nodes, including empty ones (for structure preservation)
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false,
  );

  const textNodes = [];
  const originalTextsMap = new Map();
  let node;

  while ((node = walker.nextNode())) {
    const text = node.textContent;
    const trimmedText = text.trim();

    // Include empty nodes too for structure preservation
    if (trimmedText || text.length === 0 || (/^\s*$/.test(text) && text.length > 0)) {
      textNodes.push(node);

      // Use full text (including whitespace) to preserve structure
      const mapKey = text; // Keep original text with whitespace for structure preservation
      if (originalTextsMap.has(mapKey)) {
        originalTextsMap.get(mapKey).push(node);
      } else {
        originalTextsMap.set(mapKey, [node]);
      }
    }
  }

  // Enhanced structure preservation for Twitter-style layouts
  // Detect missing empty lines between block-level elements
  const enhancedTextNodes = enhanceTextNodeStructure(targetElement, textNodes, originalTextsMap);

  logger.debug(`Optimized collection with structure enhancement: ${enhancedTextNodes.length} nodes, ${originalTextsMap.size} unique texts`);
  return { textNodes: enhancedTextNodes, originalTextsMap };
}

/**
 * Enhance text node structure to preserve empty lines between elements
 * @param {HTMLElement} targetElement - Target element
 * @param {Array} textNodes - Original text nodes
 * @param {Map} originalTextsMap - Original texts map
 * @returns {Array} Enhanced text nodes
 */
function enhanceTextNodeStructure(targetElement, textNodes, originalTextsMap) {
  const enhancedNodes = [...textNodes];

  // Look for adjacent block elements that should have empty lines between them
  const walker = document.createTreeWalker(
    targetElement,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        // Skip hidden elements
        try {
          if (typeof window !== 'undefined') {
            const style = window.getComputedStyle(node);
            if (style.display === "none" || style.visibility === "hidden") {
              return NodeFilter.FILTER_REJECT;
            }
          }
        } catch {
          // If getComputedStyle fails, accept the node
        }

        // Focus on block-level and inline-block elements
        const tagName = node.tagName.toLowerCase();
        const display = node.style?.display || window.getComputedStyle?.(node)?.display;

        // Twitter-specific: look for spans and anchors that might need spacing
        if (tagName === 'span' || tagName === 'a' || display === 'inline-block' || display === 'block') {
          return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_REJECT;
      }
    },
    false
  );

  let previousElement = null;
  let element;

  while ((element = walker.nextNode())) {
    if (previousElement && shouldInsertEmptyLine(previousElement, element)) {
      // Check if there's already a text node with only whitespace between these elements
      const hasEmptyTextNode = checkForEmptyTextNodeBetween(previousElement, element);

      if (!hasEmptyTextNode) {
        // Create a synthetic text node for the empty line
        const syntheticTextNode = document.createTextNode('\n\n');
        syntheticTextNode._syntheticEmptyLine = true;

        // Create a wrapper for the synthetic empty line to ensure proper spacing
        const emptyLineWrapper = document.createElement('div');
        emptyLineWrapper.className = 'aiwc-synthetic-empty-line';
        emptyLineWrapper.style.display = 'block';
        emptyLineWrapper.style.height = '1em';
        emptyLineWrapper.setAttribute('data-aiwc-synthetic', 'true');

        // Insert the synthetic node and wrapper in the DOM temporarily for processing
        if (element.parentNode && previousElement.parentNode === element.parentNode) {
          try {
            // Insert the wrapper first
            element.parentNode.insertBefore(emptyLineWrapper, element);
            // Insert the text node inside the wrapper
            emptyLineWrapper.appendChild(syntheticTextNode);

            enhancedNodes.push(syntheticTextNode);

            // Add to texts map
            originalTextsMap.set('\n\n', [syntheticTextNode]);

            logger.debug('Inserted synthetic empty line wrapper between elements', {
              prevTag: previousElement.tagName,
              nextTag: element.tagName
            });
          } catch (error) {
            logger.debug('Failed to insert synthetic empty line:', error);
          }
        }
      }
    }

    previousElement = element;
  }

  return enhancedNodes;
}

/**
 * Check if empty line should be inserted between two elements
 * @param {Element} prevElement - Previous element
 * @param {Element} nextElement - Next element
 * @returns {boolean} Whether to insert empty line
 */
function shouldInsertEmptyLine(prevElement, nextElement) {
  const prevTag = prevElement.tagName.toLowerCase();
  const nextTag = nextElement.tagName.toLowerCase();

  // Twitter-specific patterns
  // If we have a content-containing element followed by a link, likely need empty line
  const prevHasSubstantialText = prevElement.textContent && prevElement.textContent.trim().length > 20;
  const nextIsLink = nextTag === 'a' || (nextTag === 'span' && nextElement.querySelector('a'));

  // Check if previous element ends with substantial content and next is a different type
  if (prevHasSubstantialText && nextIsLink) {
    return true;
  }

  // Other block-level transitions
  const blockTags = ['div', 'p', 'section', 'article'];
  const prevIsBlock = blockTags.includes(prevTag);
  const nextIsBlock = blockTags.includes(nextTag);

  if (prevIsBlock && nextIsBlock) {
    return true;
  }

  return false;
}

/**
 * Check if there's already an empty text node between two elements
 * @param {Element} prevElement - Previous element
 * @param {Element} nextElement - Next element
 * @returns {boolean} Whether empty text node exists
 */
function checkForEmptyTextNodeBetween(prevElement, nextElement) {
  // Find sibling relationship
  if (prevElement.nextSibling === nextElement) {
    // Direct siblings - no text node between them
    return false;
  }

  // Check if the next sibling is a text node with only whitespace
  const nextSibling = prevElement.nextSibling;
  if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
    const text = nextSibling.textContent.trim();
    if (text.length === 0) {
      return true; // Already has empty text node
    }

    // Check if the next sibling after this text node is our target element
    if (nextSibling.nextSibling === nextElement) {
      return true; // Text node exists between elements
    }
  }

  return false;
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

    // Handle empty lines and whitespace-only text (preserve structure but don't translate)
    if (textNode._syntheticEmptyLine || originalText === '\n\n' || originalText === '\n' || /^\s*$/.test(originalText)) {
      logger.debug('Preserving empty line or whitespace text node', {
        originalText: JSON.stringify(originalText),
        isSynthetic: !!textNode._syntheticEmptyLine
      });

      // For synthetic empty lines, we need to preserve their wrapper structure
      if (textNode._syntheticEmptyLine && textNode.parentNode) {
        const wrapper = textNode.parentNode;
        if (wrapper.getAttribute('data-aiwc-synthetic') === 'true') {
          // Ensure the wrapper maintains its styling
          wrapper.style.display = 'block';
          wrapper.style.height = '1em';
          processedCount++;
          return;
        }
      }

      // For regular whitespace text nodes, ensure they maintain their structure
      // Don't translate them, just count them as processed
      processedCount++;
      return; // Don't translate empty lines, just preserve them
    }

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

        // Preserve original whitespace by reconstructing it
        // If original had leading/trailing spaces, preserve them in the translation
        let finalTranslatedText = translatedText;

        // Check if original text had leading spaces
        if (originalText !== trimmedOriginalText && originalText.startsWith(' ')) {
          finalTranslatedText = ' ' + finalTranslatedText;
        }

        // Check if original text had trailing spaces
        if (originalText !== trimmedOriginalText && originalText.endsWith(' ')) {
          finalTranslatedText = finalTranslatedText + ' ';
        }

        // Create outer wrapper (similar to working extension)
        const wrapperSpan = document.createElement("span");
        wrapperSpan.className = "aiwc-translation-wrapper";
        wrapperSpan.setAttribute("data-aiwc-original-id", uniqueId);

        // Create inner span for translated content
        const translationSpan = document.createElement("span");
        translationSpan.className = "aiwc-translation-inner";

        // Preserve leading whitespace from original text
        const leadingWhitespace = originalText.match(/^\s*/)[0];

        // Check if the original text ends with whitespace that should create a visual line break
        originalText.match(/\s*$/)[0];

        // Start with leading whitespace
        let processedText = leadingWhitespace + finalTranslatedText;

        // No additional spacing logic here - let text processing handle spacing
        // This prevents double newline issues

        translationSpan.textContent = processedText;

        // Apply text direction to the wrapper with target language if available
        const detectOptions = context.targetLanguage ? {
          targetLanguage: context.targetLanguage,
          simpleDetection: true  // Use simple detection for RTL languages
        } : {};

        correctTextDirection(wrapperSpan, translatedText, {
          useWrapperElement: false,
          preserveExisting: true,
          detectOptions: detectOptions
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

        // Note: Cache system has been removed - no storage of translation data

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

  // Note: Cache system has been removed - no cache to clear

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

  // Clean up synthetic empty lines - new improved cleanup
  try {
    // Clean up synthetic empty line wrappers first
    const syntheticWrappers = document.querySelectorAll('[data-aiwc-synthetic="true"]');
    syntheticWrappers.forEach(wrapper => {
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
        logger.debug('Removed synthetic empty line wrapper');
      }
    });

    // Find all text nodes that are synthetic empty lines (fallback)
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          return node._syntheticEmptyLine ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    let syntheticNode;
    const syntheticNodesToRemove = [];
    while ((syntheticNode = walker.nextNode())) {
      syntheticNodesToRemove.push(syntheticNode);
    }

    syntheticNodesToRemove.forEach(node => {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
        logger.debug('Removed synthetic empty line');
      }
    });

    const totalCleaned = syntheticWrappers.length + syntheticNodesToRemove.length;
    if (totalCleaned > 0) {
      logger.info(`Cleaned up ${totalCleaned} synthetic empty line elements`);
    }
  } catch (cleanupError) {
    logger.debug('Failed to cleanup synthetic empty lines:', cleanupError);
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

  // Note: Cache system has been removed - no caching of validation results
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

  // Note: Cache system has been removed - no caching of text content

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

  // Note: Cache system has been removed - no caching of text content
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