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

    // Logic: Apply 'dir' attribute ONLY if the element is not a complex widget container.
    // A complex container is one that has descendants like SVG, IMG, or UI widgets
    // that are sensitive to layout flipping.
    const hasWidgetDescendants = !!el.querySelector('svg, img, button, input, iframe, video, canvas, select');

    if (!hasWidgetDescendants) {
      el.setAttribute('dir', direction);
    }

    // Block-level alignment is safe: it aligns text without flipping child elements flow
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
    
    // Check for complex widgets in parent to avoid flipping layouts like GitHub icons
    const hasWidgetDescendants = !!parent.querySelector('svg, img, button, input, iframe, video, canvas, select');

    if (!hasWidgetDescendants) {
      parent.setAttribute('dir', direction);
    }

    if (BLOCK_TAGS.has(parent.tagName)) {
      parent.style.textAlign = 'start';
    }
  }
}
