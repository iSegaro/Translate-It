// DOM Manipulation Utilities for Element Selection
// Dedicated DOM operations for Select Element feature
// Independent from shared utilities

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
// Note: Cache system has been removed from Select Element feature
import { applyContainerDirection, isRTLLanguage } from './textDirection.js';

// Inject translation styles
let stylesInjected = false;
function injectTranslationStyles() {
  if (stylesInjected) return;

  try {
    const styleElement = document.createElement('style');
    styleElement.id = 'aiwc-translation-styles';
    styleElement.textContent = `
      /* Translation Styles - Matching Immersive Translate pattern */
      /* Each segment wrapper has its own dir attribute (Immersive Translate pattern) */
      .aiwc-translation-wrapper {
        display: inline;
        unicode-bidi: isolate;
      }

      .aiwc-translation-wrapper[dir="rtl"] {
        unicode-bidi: embed;
      }

      .aiwc-translation-wrapper[dir="ltr"] {
        unicode-bidi: embed;
      }

      .aiwc-translation-background {
        display: inline;
        unicode-bidi: embed;
        direction: inherit;  /* Inherit from wrapper */
      }

      /* Inner translation content inherits direction from wrapper */
      .aiwc-translation-inner {
        display: inline;
        unicode-bidi: embed;
        direction: inherit;  /* Inherit from background/wrapper */
        text-align: inherit;
      }

      .aiwc-translated-text {
        unicode-bidi: isolate;
      }
      .aiwc-translation-final {
        unicode-bidi: isolate;
      }

      /* Inherit styling from parent elements */
      .aiwc-translation-wrapper *,
      .aiwc-translated-text *,
      .aiwc-translation-final * {
        font-family: inherit;
        font-size: inherit;
        font-weight: inherit;
        font-style: inherit;
        line-height: inherit;
        letter-spacing: inherit;
        color: inherit;
      }

      /* Code blocks should maintain their direction */
      .aiwc-translation-wrapper code,
      .aiwc-translation-wrapper pre {
        font-family: inherit;
        direction: inherit;
        text-align: inherit;
        unicode-bidi: plaintext;
      }

      /* Table elements */
      .aiwc-translation-wrapper table {
        border-collapse: inherit;
        border-spacing: inherit;
        width: inherit;
      }

      .aiwc-translation-wrapper td,
      .aiwc-translation-wrapper th {
        text-align: inherit;
        vertical-align: inherit;
        padding: inherit;
        border: inherit;
      }

      /* List elements */
      .aiwc-translation-wrapper li {
        list-style-type: inherit;
        list-style-position: inherit;
        margin: inherit;
        padding: inherit;
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

      /* Ensure proper spacing between adjacent translated elements */
      .aiwc-translation-wrapper + .aiwc-translation-wrapper {
        margin-left: 0.25em;
      }

      /* Immersive Translate pattern styles - parent text element wrappers */
      .aiwc-immersive-translate-wrapper {
        display: inline;
        unicode-bidi: isolate;
      }

      .aiwc-immersive-translate-wrapper[dir="rtl"] {
        unicode-bidi: embed;
      }

      .aiwc-immersive-translate-wrapper[dir="ltr"] {
        unicode-bidi: embed;
      }

      .aiwc-immersive-translate-background {
        display: inline;
        unicode-bidi: embed;
        direction: inherit;
      }

      .aiwc-immersive-translate-inner {
        display: inline;
        unicode-bidi: embed;
        direction: inherit;
        text-align: inherit;
      }

      /* Inherit styling for Immersive Translate wrappers */
      .aiwc-immersive-translate-wrapper *,
      .aiwc-immersive-translate-background *,
      .aiwc-immersive-translate-inner * {
        font-family: inherit;
        font-size: inherit;
        font-weight: inherit;
        font-style: inherit;
        line-height: inherit;
        letter-spacing: inherit;
        color: inherit;
      }

      /* Segment translation wrapper - preserves spacing with inline display */
      .aiwc-segment-translation {
        display: inline;
        unicode-bidi: embed;
        direction: inherit;
      }

      /* CRITICAL FIX: Segment elements with RTL/LTR direction need isolate
         to prevent parent dir="auto" from affecting their display */
      [data-segment-id][dir="rtl"],
      [data-segment-id][dir="ltr"] {
        unicode-bidi: isolate;
      }

      /* CRITICAL: Preserve spacing between adjacent inline RTL elements */
      /* Use word-spacing to ensure spaces between words are not collapsed */
      [dir="rtl"] {
        word-spacing: normal;
      }

      /* Ensure adjacent inline elements maintain spacing */
      [dir="rtl"] > * {
        display: inline;
      }

      /* CRITICAL: Add spacing between adjacent inline RTL segments */
      [dir="rtl"] > [data-segment-id] + [data-segment-id],
      [dir="rtl"] > [data-segment-id]:not(:last-child) {
        margin-right: 0.25em;
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

  // Filter out undefined or null nodes to prevent errors
    // Accept both TEXT_NODE (legacy) and ELEMENT_NODE with segment-id (new approach)
    const validTextNodes = textNodes.filter(node =>
      node && (
        node.nodeType === Node.TEXT_NODE ||
        (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute && node.hasAttribute('data-segment-id'))
      )
    );

    logger.debug('Filtered text nodes', {
      originalCount: textNodes.length,
      validCount: validTextNodes.length
    });

    // Handle chunked translations by maintaining node order
    validTextNodes.forEach((textNode, nodeIndex) => {
      if (!textNode.parentNode) {
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

        // Create outer wrapper (FONT tag to match structure)
        const wrapperSpan = document.createElement("font");
        wrapperSpan.className = "aiwc-translation-wrapper";
        wrapperSpan.setAttribute("data-aiwc-original-id", uniqueId);
        
        // Apply direction to wrapper (matches reference pattern: outer AND inner have dir)
        if (context.targetLanguage) {
          wrapperSpan.setAttribute("dir", isRTLLanguage(context.targetLanguage) ? "rtl" : "ltr");
          wrapperSpan.setAttribute("lang", context.targetLanguage);
        }

        // Add hidden BR
        const br = document.createElement("br");
        br.hidden = true;
        wrapperSpan.appendChild(br);

        // Create background wrapper
        const bgFont = document.createElement("font");
        bgFont.className = "aiwc-translation-background";

        // Create inner span for translated content
        const translationSpan = document.createElement("font");
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

        // Apply container-level direction following Immersive Translate pattern
        if (context.targetLanguage) {
          applyContainerDirection(translationSpan, context.targetLanguage, translatedText);
        }

        // Add the translation span to the background, then wrapper
        bgFont.appendChild(translationSpan);
        wrapperSpan.appendChild(bgFont);

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

  // Find all wrapper elements with translation data (legacy system)
  const wrappers = document.querySelectorAll(".aiwc-translation-wrapper");

  // Find all Immersive Translate wrapper elements (new pattern)
  const immersiveWrappers = document.querySelectorAll(".aiwc-immersive-translate-wrapper");

  // Find all segment elements with translations (new system)
  const segmentElements = document.querySelectorAll("span[data-segment-id]");

  logger.info(`Starting cleanup of ${wrappers.length} legacy wrapper elements, ${immersiveWrappers.length} immersive wrappers, and ${segmentElements.length} segment elements`);

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
  const oldStyleContainers = document.querySelectorAll("[data-aiwc-original-text]");
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

  // Handle segment elements (new system)
  segmentElements.forEach((segmentElement) => {
    try {
      const parentElement = segmentElement.parentNode;

      if (!parentElement) {
        logger.debug('Segment element has no parent, skipping');
        failedReverts++;
        return;
      }

      // Check if this element has been translated (has direction attributes or is marked as final)
      const isTranslated = segmentElement.hasAttribute('dir') ||
                           segmentElement.classList.contains('aiwc-translation-final') ||
                           (segmentElement.textContent !== segmentElement.getAttribute('data-original-text'));

      if (isTranslated) {
        // Get the original text from the data-original-text attribute if it exists
        const originalText = segmentElement.getAttribute('data-original-text');

        // Create a new text node with the original content
        const textNode = document.createTextNode(originalText || segmentElement.textContent);

        // Replace the segment element with the text node
        parentElement.replaceChild(textNode, segmentElement);

        // CRITICAL FIX: Remove dir and lang attributes from parent element if they were
        // added during RTL translation. Check if parent has these attributes and no other
        // translated children remain.
        if (parentElement.hasAttribute('dir')) {
          // Check if parent still has any segment children that are translated
          const remainingTranslatedSegments = parentElement.querySelectorAll(
            '[data-segment-id][data-original-text], [data-segment-id][dir]'
          );

          // If no remaining translated segments, restore original dir/lang from parent
          if (remainingTranslatedSegments.length === 0) {
            // Restore original direction if it was stored, otherwise remove
            const hasOriginalDir = parentElement.hasAttribute('data-original-direction');
            const originalDir = parentElement.getAttribute('data-original-direction');

            const dirBefore = parentElement.getAttribute('dir');
            const hasDirBefore = parentElement.hasAttribute('dir');

            logger.debug(`Restoring direction on parent`, {
              tagName: parentElement.tagName,
              hasOriginalDir,
              originalDir: originalDir || '(empty)',
              hasDirBefore,
              dirBefore,
              className: parentElement.className
            });

            // If there was an actual direction value stored (not empty), restore it
            // Otherwise remove the dir attribute entirely
            if (hasOriginalDir && originalDir && originalDir.trim() !== '') {
              parentElement.setAttribute('dir', originalDir);
              logger.debug(`Restored dir to: ${originalDir}`, {
                dirAfter: parentElement.getAttribute('dir')
              });
            } else {
              parentElement.removeAttribute('dir');
              const hasDirAfter = parentElement.hasAttribute('dir');
              const dirAfter = parentElement.getAttribute('dir');
              logger.debug(`Removed dir attribute`, {
                hasDirAfter,
                dirAfter,
                wasRemoved: !hasDirAfter
              });
            }
            parentElement.removeAttribute('data-original-direction');

            // Restore original language if it was stored, otherwise remove
            const hasOriginalLang = parentElement.hasAttribute('data-original-lang');
            const originalLang = parentElement.getAttribute('data-original-lang');

            if (hasOriginalLang && originalLang && originalLang.trim() !== '') {
              parentElement.setAttribute('lang', originalLang);
            } else {
              parentElement.removeAttribute('lang');
            }
            parentElement.removeAttribute('data-original-lang');
          }
        }

        successfulReverts++;
        logger.debug(`Reverted segment element to original text`);
      } else {
        // Not translated, just remove all translation-related attributes
        segmentElement.removeAttribute('data-segment-id');
        segmentElement.removeAttribute('data-original-text');
        segmentElement.removeAttribute('data-original-direction');
        segmentElement.removeAttribute('data-original-lang');
        segmentElement.removeAttribute('data-original-text-align');
        segmentElement.removeAttribute('data-original-unicode-bidi');
        successfulReverts++;
      }
    } catch (error) {
      failedReverts++;
      logger.error('Failed to revert segment element:', error);
    }
  });

  // Handle Immersive Translate wrappers (new pattern)
  immersiveWrappers.forEach((immersiveWrapper) => {
    try {
      const parentElement = immersiveWrapper.parentNode;

      if (!parentElement) {
        logger.debug('Immersive wrapper has no parent, skipping');
        failedReverts++;
        return;
      }

      // The inner wrapper should contain the original translated content
      // We need to restore the original text from segment elements
      const innerWrapper = immersiveWrapper.querySelector('.aiwc-immersive-translate-inner');
      if (innerWrapper) {
        // Find all segments within and restore their original text
        const segments = innerWrapper.querySelectorAll('[data-segment-id]');
        let hasOriginalText = false;

        segments.forEach((segment) => {
          const originalText = segment.getAttribute('data-original-text');
          if (originalText) {
            segment.textContent = originalText;
            segment.removeAttribute('dir');
            segment.removeAttribute('lang');
            segment.removeAttribute('data-segment-id');
            segment.removeAttribute('data-original-text');
            segment.removeAttribute('data-original-direction');
            segment.removeAttribute('data-original-lang');
            segment.removeAttribute('data-original-text-align');
            segment.removeAttribute('data-original-unicode-bidi');
            hasOriginalText = true;
          }
        });

        // Replace the immersive wrapper with the inner content
        if (hasOriginalText || innerWrapper.childNodes.length > 0) {
          // Move all children from innerWrapper to parentElement
          while (innerWrapper.firstChild) {
            parentElement.insertBefore(innerWrapper.firstChild, immersiveWrapper);
          }
          // Remove the immersive wrapper
          parentElement.removeChild(immersiveWrapper);
          successfulReverts++;
          logger.debug('Reverted Immersive Translate wrapper');
        }
      } else {
        // No inner wrapper, just remove the immersive wrapper
        parentElement.removeChild(immersiveWrapper);
        successfulReverts++;
        logger.debug('Removed empty Immersive Translate wrapper');
      }
    } catch (error) {
      failedReverts++;
      logger.error('Failed to revert Immersive Translate wrapper:', error);
    }
  });

  // CRITICAL FIX: Final cleanup pass - Remove dir/lang attributes from parent elements
  // that no longer have any translated segments but still retain these attributes
  try {
    // Select elements that have our tracking attributes OR the standard dir/lang combo
    // This ensures we catch block-level parents that we modified (which might not have lang set)
    const elementsToCleanup = document.querySelectorAll(
      '[dir][lang], [data-original-direction], [data-original-text-align], [data-original-unicode-bidi], [data-original-lang]'
    );
    let dirCleanupCount = 0;

    elementsToCleanup.forEach((element) => {
      // Skip if this is a wrapper element (will be handled separately)
      if (element.classList.contains('aiwc-translation-wrapper') ||
          element.classList.contains('aiwc-immersive-translate-wrapper')) {
        return;
      }

      // Check if this element has any remaining translated segments
      // We look for any indicators of active translation within this element
      const remainingTranslatedSegments = element.querySelectorAll(
        '[data-segment-id][data-original-text], [data-segment-id][dir], .aiwc-translation-wrapper, .aiwc-immersive-translate-wrapper'
      );

      // Also check if the element itself has segment-related attributes
      const hasSegmentId = element.hasAttribute('data-segment-id');
      const hasOriginalText = element.hasAttribute('data-original-text');
      const isTranslationWrapper = element.classList.contains('aiwc-translation-wrapper') ||
                                  element.classList.contains('aiwc-immersive-translate-wrapper');

      // If no translated content remains and this isn't a translation wrapper itself, clean up details
      if (remainingTranslatedSegments.length === 0 && !hasSegmentId && !hasOriginalText && !isTranslationWrapper) {

        // 1. Restore/Remove Direction
        if (element.hasAttribute('data-original-direction')) {
          const originalDir = element.getAttribute('data-original-direction');
           // If there was an actual direction value stored (not empty), restore it
           if (originalDir && originalDir.trim() !== '') {
             element.setAttribute('dir', originalDir);
           } else {
             // If original was empty/null, remove the dir attribute entirely
             element.removeAttribute('dir');
           }
           element.removeAttribute('data-original-direction');
           dirCleanupCount++;
        }

        // 2. Restore/Remove Language Attribute
        if (element.hasAttribute('data-original-lang')) {
          const originalLang = element.getAttribute('data-original-lang');
          // If there was an actual language value stored (not empty), restore it
          if (originalLang && originalLang.trim() !== '') {
            element.setAttribute('lang', originalLang);
          } else {
            // If original was empty/null, remove the lang attribute entirely
            element.removeAttribute('lang');
          }
          element.removeAttribute('data-original-lang');
          dirCleanupCount++;
        } else if (element.hasAttribute('data-original-direction') && element.hasAttribute('lang')) {
          // If we tracked direction but not language explicitly, and lang is present, remove it
          // This handles cases where lang was added by translation but data-original-lang wasn't set
          element.removeAttribute('lang');
        }

        // 3. Restore/Remove Text Align
        if (element.hasAttribute('data-original-text-align')) {
             const originalAlign = element.getAttribute('data-original-text-align');
             if (originalAlign && originalAlign.trim() !== '') {
               element.style.textAlign = originalAlign;
             } else {
               element.style.textAlign = '';
             }
             element.removeAttribute('data-original-text-align');
        }

        // 4. Restore/Remove Unicode Bidi
        if (element.hasAttribute('data-original-unicode-bidi')) {
            const originalBidi = element.getAttribute('data-original-unicode-bidi');
            if (originalBidi && originalBidi.trim() !== '') {
                element.style.unicodeBidi = originalBidi;
            } else {
                element.style.unicodeBidi = '';
            }
            element.removeAttribute('data-original-unicode-bidi');
        }

        // 5. Clean up empty style attribute
        // After clearing inline styles, remove the style attribute if it's empty
        if (element.hasAttribute('style') && element.getAttribute('style').trim() === '') {
          element.removeAttribute('style');
        }
      }
    });

    if (dirCleanupCount > 0) {
      logger.info(`Cleaned up attributes from ${dirCleanupCount} parent elements`);
    }
  } catch (dirCleanupError) {
    logger.debug('Failed to cleanup parent attributes:', dirCleanupError);
  }

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

  // CRITICAL FIX: Clean up text-align on target elements
  // This ensures text alignment is restored to original after revert
  const elementsWithAlign = document.querySelectorAll('[data-original-text-align]');
  elementsWithAlign.forEach((element) => {
    try {
      const hasOriginalAlign = element.hasAttribute('data-original-text-align');
      const originalAlign = element.getAttribute('data-original-text-align');

      if (hasOriginalAlign) {
        // Restore original text-align
        if (originalAlign && originalAlign.trim() !== '') {
          element.style.textAlign = originalAlign;
        } else {
          // If original was empty, remove the inline style
          element.style.textAlign = '';
        }

        // Clean up the data attribute
        element.removeAttribute('data-original-text-align');
      }
    } catch (error) {
      logger.debug('Failed to cleanup text-align for element:', error);
    }
  });

  if (elementsWithAlign.length > 0) {
    logger.debug(`Cleaned up text-align from ${elementsWithAlign.length} elements`);
  }

  // FINAL AGGRESSIVE CLEANUP: Remove any remaining data-original-* attributes
  // This catches any orphaned attributes that might have been missed by previous cleanup passes
  try {
    const allElementsWithOriginalAttrs = document.querySelectorAll(
      '[data-original-text], [data-original-direction], [data-original-lang], [data-original-text-align], [data-original-unicode-bidi]'
    );
    let aggressiveCleanupCount = 0;

    allElementsWithOriginalAttrs.forEach((element) => {
      // Skip wrapper elements
      if (element.classList.contains('aiwc-translation-wrapper') ||
          element.classList.contains('aiwc-immersive-translate-wrapper')) {
        return;
      }

      const hadOriginalLang = element.hasAttribute('data-original-lang');
      const hadOriginalDir = element.hasAttribute('data-original-direction');

      // Remove all data-original-* attributes
      element.removeAttribute('data-original-text');
      element.removeAttribute('data-original-direction');
      element.removeAttribute('data-original-lang');
      element.removeAttribute('data-original-text-align');
      element.removeAttribute('data-original-unicode-bidi');

      // Remove lang if we had data-original-lang (even if empty)
      // This ensures lang attributes we added are always removed
      if (hadOriginalLang) {
        element.removeAttribute('lang');
      }

      // Also remove dir if it looks like it was added by us
      // (heuristic: if we removed the tracking attribute, also remove the corresponding live attribute)
      if (hadOriginalDir && element.hasAttribute('dir')) {
        const dir = element.getAttribute('dir');
        // Only remove if it's one of our common values
        if (dir === 'rtl' || dir === 'ltr') {
          element.removeAttribute('dir');
        }
      }

      // Clean up empty style attribute
      if (element.hasAttribute('style') && element.getAttribute('style').trim() === '') {
        element.removeAttribute('style');
      }

      aggressiveCleanupCount++;
    });

    if (aggressiveCleanupCount > 0) {
      logger.info(`Aggressive cleanup: removed attributes from ${aggressiveCleanupCount} elements`);
    }
  } catch (aggressiveCleanupError) {
    logger.debug('Failed to perform aggressive cleanup:', aggressiveCleanupError);
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