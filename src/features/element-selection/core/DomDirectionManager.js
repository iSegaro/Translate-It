/**
 * Manages direction (RTL/LTR) and text alignment for DOM elements
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { RTL_LANGUAGES, TEXT_TAGS, FORMATTING_TAGS, BLOCK_TAGS } from './DomTranslatorConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomDirectionManager');

/**
 * Check if a language code is RTL
 * @param {string} langCode - Language code
 * @returns {boolean}
 */
export function isRTL(langCode) {
  const base = langCode.toLowerCase().split('-')[0];
  return RTL_LANGUAGES.has(base);
}

/**
 * Apply surgical direction and alignment to an element and its descendants
 * @param {HTMLElement} element 
 * @param {string} targetLanguage 
 */
export function applyDirection(element, targetLanguage) {
  const direction = isRTL(targetLanguage) ? 'rtl' : 'ltr';

  const processElement = (el) => {
    if (!TEXT_TAGS.has(el.tagName)) return;

    // Logic: Apply 'dir' only to text-holders, avoid flipping layout containers
    const isLayoutTag = ['DIV', 'LI', 'TD', 'TH'].includes(el.tagName);
    const hasComplexChildren = Array.from(el.children).some(child => !FORMATTING_TAGS.has(child.tagName));

    if (!isLayoutTag || !hasComplexChildren) {
      el.setAttribute('dir', direction);
    }

    if (BLOCK_TAGS.has(el.tagName)) {
      el.style.textAlign = 'start';
    }
  };

  processElement(element);
  const descendants = element.querySelectorAll(Array.from(TEXT_TAGS).join(','));
  descendants.forEach(processElement);

  element.setAttribute('data-translate-dir', direction);
  logger.debug(`Applied surgical direction: ${direction}`);
}

/**
 * Apply direction to a single node's parent (for streaming)
 * @param {Node} textNode 
 * @param {string} targetLanguage 
 */
export function applyNodeDirection(textNode, targetLanguage) {
  const parent = textNode.parentElement;
  if (parent && TEXT_TAGS.has(parent.tagName)) {
    const direction = isRTL(targetLanguage) ? 'rtl' : 'ltr';
    const isLayoutTag = ['DIV', 'LI', 'TD', 'TH'].includes(parent.tagName);
    const hasComplexChildren = Array.from(parent.children).some(child => !FORMATTING_TAGS.has(child.tagName));

    if (!isLayoutTag || !hasComplexChildren) {
      parent.setAttribute('dir', direction);
    }

    if (BLOCK_TAGS.has(parent.tagName)) {
      parent.style.textAlign = 'start';
    }
  }
}
