/**
 * Utility functions for DOM analysis and manipulation
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomTranslatorUtils');

/**
 * Block-level tags for logical grouping
 */
const BLOCK_TAGS = new Set([
  'ARTICLE', 'SECTION', 'DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 
  'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'BLOCKQUOTE', 'PRE', 'TABLE', 'TR', 'TD', 'TH'
]);

/**
 * Finds the closest block-level parent for a node
 * @param {Node} node - The node to check
 * @returns {HTMLElement} - The block-level parent
 */
function findClosestBlockParent(node) {
  let parent = node.parentElement;
  while (parent) {
    if (BLOCK_TAGS.has(parent.tagName)) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.body;
}

/**
 * Extracts page and heading context for an element
 * @param {HTMLElement} element - The selected element
 * @returns {Object} - Context metadata
 */
export function extractContextMetadata(element) {
  const metadata = {
    pageTitle: document.title,
    heading: '',
    role: element.tagName.toLowerCase()
  };

  // Find the nearest preceding heading
  try {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headings.length > 0) {
      // Find the heading that is physically closest above the element
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
  } catch (e) {
    logger.debug('Failed to extract heading context', e);
  }

  return metadata;
}

/**
 * Collect all visible text nodes within an element with structural metadata
 * @param {HTMLElement} element - Root element
 * @returns {Object[]} Array of objects { node, text, uid, blockId, role }
 */
export function collectTextNodes(element) {
  const textNodesData = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      // Skip certain element types
      const tagName = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(tagName)) {
        return NodeFilter.FILTER_REJECT;
      }

      // Check visibility
      try {
        const style = window.getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }
      } catch {
        // If getComputedStyle fails, accept the node
      }

      // Accept nodes with non-whitespace content
      return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  let node;
  while ((node = walker.nextNode())) {
    const blockParent = findClosestBlockParent(node);
    
    // Generate a blockId based on the block parent
    if (!blockParent.dataset.blockId) {
      blockParent.dataset.blockId = `block-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    }

    textNodesData.push({
      node,
      text: node.textContent,
      uid: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      blockId: blockParent.dataset.blockId,
      role: blockParent.tagName.toLowerCase()
    });
  }

  logger.debug(`Collected ${textNodesData.length} text nodes with structural data`);
  return textNodesData;
}

/**
 * Generate unique element ID
 * @returns {string} Unique ID
 */
export function generateElementId() {
  return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
