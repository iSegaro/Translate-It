/**
 * DomDirectionManager - Simplified direction management for Select Element
 * Uses native 'dir="auto"' for reliable BiDi handling instead of surgical injection
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
 * Apply direction and alignment to an element
 * Strategy: Use 'dir="auto"' to let browser handle the punctuation and BiDi logic
 * This is the most robust way to handle mixed LTR/RTL content.
 * 
 * @param {HTMLElement} element 
 * @param {string} targetLanguage 
 */
export function applyDirection(element, targetLanguage) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

  const isTargetRTL = isRTL(targetLanguage);
  const directionAttr = 'auto'; // Browser-native BiDi detection

  // Apply to main element
  element.setAttribute('dir', directionAttr);
  
  // Apply text-align only to block elements to ensure they start from correct side
  if (BLOCK_TAGS.has(element.tagName)) {
    element.style.textAlign = 'start';
  }

  // Set meta-data for potential custom CSS/tracking
  element.setAttribute('data-translate-dir', isTargetRTL ? 'rtl' : 'ltr');
  
  logger.debug(`Applied native auto-direction to ${element.tagName}`);
}

/**
 * Apply direction to a single node's parent (for streaming)
 * Simplified to only target immediate parent if it lacks 'dir'
 * @param {Node} textNode 
 * @param {string} targetLanguage 
 */
export function applyNodeDirection(textNode, targetLanguage) {
  const parent = textNode.parentElement;
  if (parent && parent.nodeType === Node.ELEMENT_NODE) {
    // If parent doesn't have dir="auto", apply it once
    if (parent.getAttribute('dir') !== 'auto') {
      parent.setAttribute('dir', 'auto');
      
      if (BLOCK_TAGS.has(parent.tagName)) {
        parent.style.textAlign = 'start';
      }
    }
  }
}

