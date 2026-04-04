/**
 * DomDirectionManager - Shared logic for RTL/LTR direction management.
 */

import { RTL_LANGUAGES, BLOCK_TAGS, LAYOUT_TAGS, FORMATTING_TAGS, LAYOUT_DISPLAY_MODES, INTERACTIVE_TAGS } from './DomTranslatorConstants.js';

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

  // Count RTL and LTR STRONG characters
  let rtlStrongCount = 0;
  let ltrStrongCount = 0;
  let firstRTLIndex = -1;
  let firstLTRIndex = -1;

  for (let i = 0; i < trimmedText.length; i++) {
    const code = trimmedText.codePointAt(i);
    if (code > 0xFFFF) i++;

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

  // If no strong directional characters, default to LTR
  if (rtlStrongCount === 0 && ltrStrongCount === 0) return 'ltr';
  
  // If there are ANY RTL characters, and they appear reasonably early 
  // or the LTR count isn't overwhelmingly dominant (more than 4 to 1), 
  // we treat it as RTL. This handles mixed technical Farsi text like "WebAI به API".
  if (rtlStrongCount > 0) {
    if (ltrStrongCount === 0) return 'rtl';
    const ltrRatio = ltrStrongCount / (rtlStrongCount + ltrStrongCount);
    // Only force LTR if more than 85% of characters are LTR
    return ltrRatio > 0.85 ? 'ltr' : 'rtl';
  }

  return 'ltr';
}

/**
 * Identifies structural layout walls (should not be flipped)
 * @param {HTMLElement} el - Element to check
 */
function isLayoutContainer(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  
  // 1. Structural tags (Body, Main, Article) are always layout containers
  if (LAYOUT_TAGS.has(el.tagName.toUpperCase())) return true;

  const style = window.getComputedStyle(el);
  
  // 2. Any element with a layout-engine display (flex, grid) and multiple children
  // MUST be treated as a layout container to prevent physical swapping of its items.
  if (LAYOUT_DISPLAY_MODES.has(style.display) && el.children.length > 1) return true;

  // Helper to check if a node is a UI/Layout element (non-textual or interactive)
  const isUIElement = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = node.tagName.toUpperCase();
    
    // Non-textual tags (SVG, IMG, CANVAS, etc.)
    if (!FORMATTING_TAGS.has(tag) && !BLOCK_TAGS.has(tag)) return true;
    
    // Interactive tags that shouldn't be flipped as part of a text block
    if (INTERACTIVE_TAGS.has(tag)) return true;
    
    // Recursive check for formatting tags (SPAN, A) to see if they contain icons
    if (FORMATTING_TAGS.has(tag)) {
      return Array.from(node.children).some(isUIElement);
    }
    
    return false;
  };

  // 3. Mixed Content or UI Components
  // If ANY child is a UI element (SVG, IMG, etc.), this is a protected UI component.
  if (el.children.length > 0) {
    if (Array.from(el.children).some(isUIElement)) return true;
  }

  // 4. Formatting tags (span, strong, a, etc.) are NOT layout containers 
  if (FORMATTING_TAGS.has(el.tagName.toUpperCase())) return false;

  // 5. Rigid layout parts with explicit dimensions
  if (el.style.width || el.style.height || style.width.includes('px') || style.maxWidth !== 'none') {
    if (!BLOCK_TAGS.has(el.tagName.toUpperCase())) return true;
  }

  const hasBlockChildren = Array.from(el.children).some(child => {
    const childStyle = window.getComputedStyle(child);
    const tag = child.tagName.toUpperCase();
    return !FORMATTING_TAGS.has(tag) || childStyle.display === 'block' || childStyle.display === 'flex';
  });
  
  return hasBlockChildren;
}

/**
 * Checks if we should apply text-align: start to an element.
 * Respects existing 'center' or 'justify' alignments.
 */
function shouldApplyStartAlignment(element) {
  if (!BLOCK_TAGS.has(element.tagName.toUpperCase())) return false;
  
  // Check for legacy align attribute which might not be reflected in computedStyle immediately
  const alignAttr = element.getAttribute('align');
  if (alignAttr === 'center' || alignAttr === 'justify') return false;

  const computedStyle = window.getComputedStyle(element);
  const textAlign = computedStyle.textAlign;
  
  // If the element is already centered or justified, keep it that way.
  // We also check for vendor-specific center values.
  return (
    textAlign !== 'center' && 
    textAlign !== 'justify' && 
    textAlign !== '-webkit-center' && 
    textAlign !== '-moz-center'
  );
}

// --- 2. State Management (Internal) ---

/**
 * Saves original styles to data-attributes before modification
 */
function saveOriginalStyles(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE || element.hasAttribute('data-dir-original-saved')) return;
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
  // Priority 1: Detect direction from the actual translated text content
  // Priority 2: Fallback to the target language's default direction
  const detectedDir = detectDirectionFromContent(textNode.textContent);
  const isTargetRTL = isRTL(targetLanguage);
  const fallbackDir = isTargetRTL ? 'rtl' : 'ltr';
  
  const targetDir = (textNode.textContent && textNode.textContent.trim().length > 0) 
    ? detectedDir 
    : fallbackDir;
  
  let container = textNode.parentElement;
  let lastSafeContainer = null;

  while (container && container !== document.body) {
    // We respect isLayoutContainer strictly to ensure we don't flip layouts by accident.
    if (isLayoutContainer(container)) break;
    
    lastSafeContainer = container;

    // If we reached the root element selected by the user:
    // 1. If it's a block-level element, we stop here (as intended).
    // 2. If it's a formatting/inline element (like <a> or <span>), we try to go one level higher
    //    to its parent to ensure proper block-level RTL alignment, unless the parent is a layout barrier.
    if (rootElement && container === rootElement) {
      if (BLOCK_TAGS.has(container.tagName.toUpperCase())) {
        break;
      }
      // If it's inline, we don't break yet, allowing the loop to check the parent in the next iteration.
    }
    
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
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

  // Always check for layout container without bypass.
  if (isLayoutContainer(element)) return;

  // Detect direction from the text content of the element
  const detectedDir = detectDirectionFromContent(element.textContent);
  const isTargetRTL = isRTL(targetLanguage);
  const fallbackDir = isTargetRTL ? 'rtl' : 'ltr';

  const directionAttr = (element.textContent && element.textContent.trim().length > 0)
    ? detectedDir
    : fallbackDir;

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
