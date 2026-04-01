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
 * Removes BiDi control marks (RLM, LRM) from a string.
 * @param {string} text 
 * @returns {string}
 */
export function stripBiDiMarks(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/[\u200E\u200F]/g, '');
}

/**
 * Detect text direction from actual text content (more accurate for mixed content)
 * Uses strong directional character detection following Unicode Bidirectional Algorithm principles
 * @param {string} text - Text to analyze
 * @returns {string} 'rtl' or 'ltr'
 */
export function detectDirectionFromContent(text = '') {
  if (!text || typeof text !== 'string') return 'ltr';

  const trimmedText = text.trim();
  if (trimmedText.length === 0) return 'ltr';

  // Count RTL and LTR STRONG characters (ignore neutral/weak characters)
  let rtlStrongCount = 0;
  let ltrStrongCount = 0;

  // Track first strong character position
  let firstRTLIndex = -1;
  let firstLTRIndex = -1;

  for (let i = 0; i < trimmedText.length; i++) {
    const code = trimmedText.codePointAt(i);
    // Skip next surrogate if it's a high surrogate
    if (code > 0xFFFF) i++;

    // RTL Strong characters: Arabic, Hebrew, Syriac, Thaana, etc.
    const isRTLStrong = (
      (code >= 0x0590 && code <= 0x05FF) ||  // Hebrew
      (code >= 0x0600 && code <= 0x06FF) ||  // Arabic
      (code >= 0x0700 && code <= 0x074F) ||  // Syriac
      (code >= 0x0750 && code <= 0x077F) ||  // Arabic Supplement
      (code >= 0x0780 && code <= 0x07BF) ||  // Thaana
      (code >= 0x07C0 && code <= 0x07FF) ||  // NKo
      (code >= 0x08A0 && code <= 0x08FF) ||  // Arabic Extended
      (code >= 0xFB1D && code <= 0xFB4F) ||  // Hebrew Presentation Forms
      (code >= 0xFB50 && code <= 0xFDFF) ||  // Arabic Presentation Forms
      (code >= 0xFE70 && code <= 0xFEFF) ||  // Arabic Presentation Forms-B
      (code === 0x200F)                      // Right-to-Left Mark
    );

    // LTR Strong characters: Latin, Greek, Cyrillic, etc.
    const isLTRStrong = (
      (code >= 0x0041 && code <= 0x005A) ||  // Basic Latin uppercase
      (code >= 0x0061 && code <= 0x007A) ||  // Basic Latin lowercase
      (code >= 0x00C0 && code <= 0x00D6) ||  // Latin-1 Supplement letters
      (code >= 0x00D8 && code <= 0x00F6) ||  // Latin-1 Supplement letters
      (code >= 0x00F8 && code <= 0x00FF) ||  // Latin-1 Supplement letters
      (code >= 0x0100 && code <= 0x017F) ||  // Latin Extended-A
      (code >= 0x0180 && code <= 0x024F) ||  // Latin Extended-B
      (code >= 0x0250 && code <= 0x02AF) ||  // IPA Extensions
      (code >= 0x0370 && code <= 0x03FF) ||  // Greek and Coptic
      (code >= 0x0400 && code <= 0x04FF) ||  // Cyrillic
      (code >= 0x0500 && code <= 0x052F) ||  // Cyrillic Supplement
      (code >= 0x1E00 && code <= 0x1EFF) ||  // Latin Extended Additional
      (code === 0x200E)                      // Left-to-Right Mark
    );

    if (isRTLStrong) {
      rtlStrongCount++;
      if (firstRTLIndex === -1) firstRTLIndex = i;
    } else if (isLTRStrong) {
      ltrStrongCount++;
      if (firstLTRIndex === -1) firstLTRIndex = i;
    }
  }

  if (rtlStrongCount === 0 && ltrStrongCount === 0) return 'ltr';

  const totalStrong = rtlStrongCount + ltrStrongCount;
  const rtlRatio = rtlStrongCount / totalStrong;

  // Use majority with threshold
  if (rtlRatio >= 0.6) return 'rtl';
  if (rtlRatio <= 0.4) return 'ltr';

  // Balanced content - Follow first strong character
  return (firstRTLIndex !== -1 && (firstLTRIndex === -1 || firstRTLIndex < firstLTRIndex)) ? 'rtl' : 'ltr';
}

/**
 * Identifies structural layout walls (should not be flipped)
 */
function isLayoutContainer(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  
  // NEVER flip direction for the root structural elements as it often causes horizontal scroll/overflow
  if (el.tagName === 'BODY' || el.tagName === 'HTML' || el.tagName === 'MAIN' || el.tagName === 'ARTICLE' || el.tagName === 'SECTION') {
    return true;
  }
  
  if (LAYOUT_TAGS.has(el.tagName)) return true;

  const style = window.getComputedStyle(el);
  const isLayoutDisplay = style.display === 'flex' || style.display === 'grid';
  
  // If it's a layout engine (flex/grid) with multiple children, don't flip it
  if (isLayoutDisplay && el.children.length > 1) return true;

  // If it has explicit width or height, it might be a rigid layout part
  if (el.style.width || el.style.height || style.width.includes('px') || style.maxWidth !== 'none') {
    // Only allow if it's a very small text-centric tag
    if (!BLOCK_TAGS.has(el.tagName)) return true;
  }

  const hasBlockChildren = Array.from(el.children).some(child => {
    const childStyle = window.getComputedStyle(child);
    return !FORMATTING_TAGS.has(child.tagName) || childStyle.display === 'block' || childStyle.display === 'flex';
  });
  
  return hasBlockChildren;
}

/**
 * Checks if we should apply text-align: start to an element.
 * Respects existing 'center' or 'justify' alignments.
 */
function shouldApplyStartAlignment(element) {
  if (!BLOCK_TAGS.has(element.tagName)) return false;
  
  const computedStyle = window.getComputedStyle(element);
  const textAlign = computedStyle.textAlign;
  
  // If the element is already centered or justified, keep it that way.
  // These are positional intents that should persist across languages.
  return textAlign !== 'center' && textAlign !== 'justify';
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
      
      if (shouldApplyStartAlignment(lastSafeContainer)) {
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
  if (shouldApplyStartAlignment(element)) {
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
      el.removeAttribute('data-has-original');
    }
  };

  restore(element);
  element.querySelectorAll('[data-dir-original-saved]').forEach(restore);
}
