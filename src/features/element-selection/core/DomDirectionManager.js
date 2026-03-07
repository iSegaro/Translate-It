/**
 * DomDirectionManager - Robust direction management for Select Element
 * Uses explicit 'dir="rtl"' or 'dir="ltr"' for reliable BiDi handling
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { RTL_LANGUAGES, BLOCK_TAGS } from './DomTranslatorConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomDirectionManager');

/**
 * Check if a language code is RTL
 * @param {string} langCode - Language code
 * @returns {boolean}
 */
export function isRTL(langCode) {
  if (!langCode) return false;
  const base = langCode.toLowerCase().split('-')[0];
  return RTL_LANGUAGES.has(base);
}

/**
 * Apply explicit direction and alignment to an element
 * Strategy: Force the direction based on target language to ensure correct 
 * segment ordering in complex layouts (like Twitter/X).
 * 
 * @param {HTMLElement} element 
 * @param {string} targetLanguage 
 */
export function applyDirection(element, targetLanguage) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

  const isTargetRTL = isRTL(targetLanguage);
  const directionAttr = isTargetRTL ? 'rtl' : 'ltr';

  // Apply explicit direction to main element
  // This is crucial for fixing the "swapped segments" issue
  element.setAttribute('dir', directionAttr);
  
  // Apply text-align to block elements to ensure they align to the correct side
  if (BLOCK_TAGS.has(element.tagName)) {
    element.style.textAlign = 'start';
  }

  // Set meta-data for potential custom CSS/tracking
  element.setAttribute('data-translate-dir', directionAttr);
  
  logger.debug(`Applied explicit ${directionAttr} direction to ${element.tagName}`);
}

/**
 * Apply direction to a single node's parent (for streaming)
 * In simplified mode, we prioritize setting the root element's direction.
 * @param {Node} textNode 
 * @param {string} targetLanguage 
 * @param {HTMLElement} rootElement - Optional root element of the translation
 */
export function applyNodeDirection(textNode, targetLanguage, rootElement = null) {
  // 1. If we have a root element, ensure IT has the correct explicit direction
  if (rootElement && rootElement.nodeType === Node.ELEMENT_NODE) {
    const targetDir = isRTL(targetLanguage) ? 'rtl' : 'ltr';
    if (rootElement.getAttribute('dir') !== targetDir) {
      applyDirection(rootElement, targetLanguage);
    }
  }

  // 2. Also ensure immediate parent is not fighting the direction
  const parent = textNode.parentElement;
  if (parent && parent.nodeType === Node.ELEMENT_NODE && parent !== rootElement) {
    // We only touch parent's dir if it's explicitly wrong (e.g. site set dir="ltr" on a span)
    // But generally, we want to avoid over-engineering here.
    // For now, let's just make sure it doesn't have a conflicting fixed dir.
    const currentDir = parent.getAttribute('dir');
    if (currentDir && currentDir !== 'auto' && currentDir !== (isRTL(targetLanguage) ? 'rtl' : 'ltr')) {
      parent.setAttribute('dir', 'auto');
    }
  }
}


