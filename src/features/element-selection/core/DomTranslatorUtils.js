/**
 * Utility functions for DOM analysis and manipulation
 * Specifically for the "Select Element" feature
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { SELECT_ELEMENT_BLOCK_TAGS } from '@/utils/dom/DomTranslatorConstants.js';

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
      return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
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
 * Generates a unique ID for element tracking during translation sessions
 * @returns {string} Unique ID
 */
export function generateElementId() {
  return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
