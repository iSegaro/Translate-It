/**
 * DomDirectionManager - Shared logic for RTL/LTR direction management.
 */

import { RTL_LANGUAGES, BLOCK_TAGS, LAYOUT_TAGS, FORMATTING_TAGS } from './DomTranslatorConstants.js';

// --- 1. Core Utilities (Shared) ---

/**
 * Checks if a language code is RTL
 */
export function isRTL(langCode) {
  if (!langCode) return false;
  const base = langCode.toLowerCase().split('-')[0];
  return RTL_LANGUAGES.has(base);
}

/**
 * Standard Unicode Marks for BiDi control
 */
export const BIDI_MARKS = {
  RLM: '\u200F', // Right-to-Left Mark
  LRM: '\u200E'  // Left-to-Right Mark
};

/**
 * Identifies structural layout walls (should not be flipped)
 */
function isLayoutContainer(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  if (LAYOUT_TAGS.has(el.tagName)) return true;

  const style = window.getComputedStyle(el);
  const isLayoutDisplay = style.display === 'flex' || style.display === 'grid';
  if (isLayoutDisplay && el.children.length > 1) return true;

  const hasBlockChildren = Array.from(el.children).some(child => {
    const childStyle = window.getComputedStyle(child);
    return !FORMATTING_TAGS.has(child.tagName) || childStyle.display === 'block' || childStyle.display === 'flex';
  });
  
  return hasBlockChildren;
}

// --- 2. State Management (Internal) ---

/**
 * Saves original styles to data-attributes before modification
 */
function saveOriginalStyles(element) {
  if (!element || element.hasAttribute('data-dir-original-saved')) return;
  element.setAttribute('data-original-direction', element.style.direction || '');
  element.setAttribute('data-original-text-align', element.style.textAlign || '');
  element.setAttribute('data-dir-original-saved', 'true');
}

// --- 3. Application Logic ---

/**
 * Surgical Application: Finds the smallest safe container for a text node and aligns it.
 * Commonly used by both Select Element and Page Translation.
 */
export function applyNodeDirection(textNode, targetLanguage, rootElement = null) {
  const isTargetRTL = isRTL(targetLanguage);
  const targetDir = isTargetRTL ? 'rtl' : 'ltr';
  
  let container = textNode.parentElement;
  let lastSafeContainer = null;

  while (container && container !== document.body) {
    if (isLayoutContainer(container)) break;
    lastSafeContainer = container;
    if (container === rootElement) break;
    container = container.parentElement;
  }

  if (lastSafeContainer) {
    if (lastSafeContainer.style.direction !== targetDir) {
      saveOriginalStyles(lastSafeContainer);
      lastSafeContainer.style.direction = targetDir;
      if (BLOCK_TAGS.has(lastSafeContainer.tagName)) {
        lastSafeContainer.style.textAlign = 'start';
      }
      lastSafeContainer.setAttribute('data-translate-dir', targetDir);
    }
  }
}

/**
 * Direct Application: Applies direction to a specific element container.
 * Primarily used by Select Element for high-level container management.
 */
export function applyElementDirection(element, targetLanguage) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE || isLayoutContainer(element)) return;

  const isTargetRTL = isRTL(targetLanguage);
  const directionAttr = isTargetRTL ? 'rtl' : 'ltr';

  saveOriginalStyles(element);

  element.style.direction = directionAttr;
  if (BLOCK_TAGS.has(element.tagName)) {
    element.style.textAlign = 'start';
  }
  element.setAttribute('data-translate-dir', directionAttr);
}

// --- 4. Restoration Logic ---

/**
 * Reverts CSS direction changes using the saved original styles.
 * Primarily used by Page Translation to restore the whole page state.
 */
export function restoreElementDirection(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

  const restore = (el) => {
    if (el.hasAttribute('data-dir-original-saved')) {
      el.style.direction = el.getAttribute('data-original-direction') || '';
      el.style.textAlign = el.getAttribute('data-original-text-align') || '';
      
      el.removeAttribute('data-original-direction');
      el.removeAttribute('data-original-text-align');
      el.removeAttribute('data-dir-original-saved');
      el.removeAttribute('data-translate-dir');
      el.removeAttribute('data-page-translated');
    }
  };

  restore(element);
  element.querySelectorAll('[data-dir-original-saved]').forEach(restore);
}
