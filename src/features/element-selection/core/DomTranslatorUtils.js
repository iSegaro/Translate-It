/**
 * Utility functions for DOM analysis and manipulation
 * Specifically for the "Select Element" feature
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { SELECT_ELEMENT_BLOCK_TAGS } from '@/utils/dom/DomTranslatorConstants.js';
import { DOM_FILTERS } from '@/utils/dom/DomFilters.js';
import { TranslationUnit } from '@/features/translation/ir/TranslationUnit.js';
import { detectDirectionFromContent } from '@/utils/dom/DomDirectionManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomTranslatorUtils');

/**
 * Finds the closest block-level parent for a node based on context boundaries
 * @param {Node} node - The DOM node to check
 * @returns {HTMLElement} - The block-level ancestor or document.body
 */
function findClosestBlockParent(node) {
  let parent = node.parentElement;
  while (parent) {
    if (SELECT_ELEMENT_BLOCK_TAGS.has(parent.tagName)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.body;
}

/**
 * Helper to determine if a node or any of its ancestors are preformatted (pre/code/textarea/etc.)
 * or have pre-computed white-space styling.
 * @param {Node} node - The DOM node to check
 * @returns {boolean}
 */
function isPreformatted(node) {
  let parent = node.parentElement;
  while (parent) {
    const tagName = parent.tagName.toUpperCase();
    if (['PRE', 'CODE', 'TEXTAREA', 'SAMP', 'KBD'].includes(tagName)) {
      return true;
    }
    try {
      const style = window.getComputedStyle(parent);
      if (['pre', 'pre-wrap', 'pre-line'].includes(style.whiteSpace)) {
        return true;
      }
    } catch {
      // computed style check failed, traverse parent
    }
    parent = parent.parentElement;
  }
  return false;
}

/**
 * Resolves the computed layout direction for a text node, inheriting parent attributes
 * before falling back to statistical content detection.
 * @param {Node} node - The text node to check
 * @returns {'rtl'|'ltr'|null}
 */
function getDirectionHint(node) {
  let parent = node.parentElement;
  while (parent) {
    const dir = parent.getAttribute('dir');
    if (dir === 'rtl' || dir === 'ltr') {
      return dir;
    }
    parent = parent.parentElement;
  }
  const text = node.textContent || '';
  try {
    return detectDirectionFromContent(text);
  } catch {
    // Simple fallback if service is unavailable
    const rtlRegex = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
    return rtlRegex.test(text) ? 'rtl' : 'ltr';
  }
}

/**
 * Collects an ordered array of inline ancestor tag names between the node and block parent.
 * @param {Node} node - The text node
 * @param {HTMLElement} blockParent - The block-level parent
 * @returns {string[]}
 */
function getInlineParentTags(node, blockParent) {
  const tags = [];
  let parent = node.parentElement;
  while (parent && parent !== blockParent) {
    tags.push(parent.tagName.toLowerCase());
    parent = parent.parentElement;
  }
  return tags;
}

/**
 * Extracts page and heading context to enrich translation requests (especially for AI)
 * @param {HTMLElement} element - The selected element
 * @returns {Object} - Metadata including page title, heading context and element role
 */
export function extractContextMetadata(element) {
  const metadata = {
    pageTitle: document.title,
    heading: '',
    role: element.tagName.toLowerCase(),
    contextSummary: ''
  };

  // Find the nearest preceding heading to provide semantic context
  try {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headings.length > 0) {
      const elementRect = element.getBoundingClientRect();
      let closestHeading = null;
      let minDistance = Infinity;

      for (const h of headings) {
        const hRect = h.getBoundingClientRect();
        const distance = elementRect.top - hRect.bottom;
        
        if (distance >= 0 && distance < minDistance) {
          minDistance = distance;
          closestHeading = h;
        }
      }
      
      if (closestHeading) {
        metadata.heading = closestHeading.textContent.trim().substring(0, 100);
      }
    }

    // Build context summary for providers like DeepL
    const parts = [];
    if (metadata.pageTitle) parts.push(`Page: ${metadata.pageTitle}`);
    if (metadata.heading) parts.push(`Section: ${metadata.heading}`);
    if (metadata.role) parts.push(`Role: ${metadata.role}`);
    
    // Add full text of the element for better phrase translation
    const fullText = element.textContent.trim().substring(0, 300);
    if (fullText) parts.push(`Full context: ${fullText}`);
    
    // Add parent context if available
    const parent = element.parentElement;
    if (parent && parent.tagName !== 'BODY') {
      parts.push(`Parent: ${parent.tagName.toLowerCase()}`);
    }

    metadata.contextSummary = parts.join(' | ').substring(0, 1000);

  } catch (e) {
    logger.debug('Failed to extract heading context', e);
  }

  return metadata;
}

/**
 * Collect all visible text nodes with unique structural IDs for accurate batch mapping
 * @param {HTMLElement} element - Root element to crawl
 * @returns {Object[]} Array of objects { node, text, uid, blockId, role }
 */
export function collectTextNodes(element) {
  const textNodesData = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      // Skip elements that shouldn't be translated (scripts, styles, invisible)
      const tagName = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(tagName)) {
        return NodeFilter.FILTER_REJECT;
      }

      try {
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }
      } catch {
        // Fallback to acceptance if style checking fails
      }

      // Filter out empty or whitespace-only nodes early
      const trimmed = node.textContent.trim();
      if (!trimmed) return NodeFilter.FILTER_REJECT;

      // Filter out technical patterns (Email, URL, etc.)
      if (DOM_FILTERS.isTechnicalPattern(trimmed)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node;
  let nodeCounter = 0;
  while ((node = walker.nextNode())) {
    const blockParent = findClosestBlockParent(node);
    
    // Ensure blockId persists for mapping back to the DOM
    // Use a shorter random string for blockId (6 chars total including prefix)
    if (!blockParent.dataset.blockId) {
      blockParent.dataset.blockId = `b${Math.random().toString(36).substr(2, 4)}`;
    }

    nodeCounter++;
    textNodesData.push({
      node,
      text: node.textContent || '',
      // Short UID: e.g., "n1", "n2" etc. to drastically reduce token usage
      uid: `n${nodeCounter}`,
      blockId: blockParent.dataset.blockId,
      role: blockParent.tagName.toLowerCase()
    });
  }

  logger.debug(`Collected ${textNodesData.length} text nodes with structural data`);
  return textNodesData;
}

/**
 * Collect visible text nodes grouped and enriched into TranslationUnit objects.
 * Employs a session-scoped WeakMap context to track blockIds cleanly without DOM mutation.
 *
 * @param {HTMLElement} element - Root element to crawl
 * @param {Object} [sessionContext={}] - Session-scoped context to track block IDs across calls
 * @param {WeakMap} [sessionContext.blockMap] - Maps elements to blockIds
 * @param {Object} [sessionContext.blockCounter] - Sequential counter object { value: number }
 * @returns {TranslationUnit[]} Array of enriched TranslationUnits
 */
export function collectBlockGroups(element, sessionContext = {}) {
  if (!sessionContext.blockMap) {
    sessionContext.blockMap = new WeakMap();
  }
  if (!sessionContext.blockCounter) {
    sessionContext.blockCounter = { value: 0 };
  }

  const units = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      // Skip elements that shouldn't be translated (scripts, styles, invisible)
      const tagName = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(tagName)) {
        return NodeFilter.FILTER_REJECT;
      }

      try {
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }
      } catch {
        // Fallback to acceptance if style checking fails
      }

      // Filter out empty or whitespace-only nodes early
      const trimmed = node.textContent.trim();
      if (!trimmed) return NodeFilter.FILTER_REJECT;

      // Filter out technical patterns (Email, URL, etc.)
      if (DOM_FILTERS.isTechnicalPattern(trimmed)) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node;
  let nodeCounter = 0;
  while ((node = walker.nextNode())) {
    const blockParent = findClosestBlockParent(node);
    
    // Assign blockId using WeakMap session context (no DOM writes)
    let blockId = sessionContext.blockMap.get(blockParent);
    if (!blockId) {
      sessionContext.blockCounter.value++;
      blockId = `g${sessionContext.blockCounter.value}`;
      sessionContext.blockMap.set(blockParent, blockId);
    }

    nodeCounter++;
    const uid = `n${nodeCounter}`;
    const rawText = node.textContent || '';
    
    // Boundary strip-and-restore model
    const leadingWS = (rawText.match(/^(\s*)/) || [''])[0];
    const trailingWS = (rawText.match(/(\s*)$/) || [''])[0];
    const trimmedText = rawText.trim();

    // Reversible escaping: escape sequence "[--SEG:" to "[--ESCAPED_SEG:"
    const escapedText = trimmedText.replace(/\[--SEG:/g, '[--ESCAPED_SEG:');

    // Preformatted preWhitespace tag & CSS checks
    const preWhitespace = isPreformatted(node);

    // Direction Hint extraction
    const directionHint = getDirectionHint(node);

    // Inline parent tags collection
    const inlineParentTags = getInlineParentTags(node, blockParent);

    // Build the unit using the TranslationUnit class
    const unit = new TranslationUnit({
      id: uid,
      blockId,
      text: escapedText,
      leadingWS,
      trailingWS,
      preWhitespace,
      directionHint,
      inlineParentTags,
      mode: preWhitespace ? 'V2_PASSTHROUGH' : 'standard'
    });
    unit.node = node;

    units.push(unit);
  }

  logger.debug(`[collectBlockGroups] Collected ${units.length} units cleanly in session`);
  return units;
}

/**
 * Generates a unique ID for element tracking during translation sessions
 * @returns {string} Unique ID
 */
export function generateElementId() {
  return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
