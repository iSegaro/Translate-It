/**
 * Utility functions for DOM analysis and manipulation
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomTranslatorUtils');

/**
 * Collect all visible text nodes within an element
 * @param {HTMLElement} element - Root element
 * @returns {Text[]} Array of text nodes
 */
export function collectTextNodes(element) {
  const textNodes = [];
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
    textNodes.push(node);
  }

  logger.debug(`Collected ${textNodes.length} text nodes`);
  return textNodes;
}

/**
 * Generate unique element ID
 * @returns {string} Unique ID
 */
export function generateElementId() {
  return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
