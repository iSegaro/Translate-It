/**
 * DomDirectionManager - Shared logic for RTL/LTR direction management.
 */

import { 
  RTL_LANGUAGES, 
  BLOCK_TAGS, 
  LAYOUT_TAGS, 
  FORMATTING_TAGS, 
  LAYOUT_DISPLAY_MODES, 
  INTERACTIVE_TAGS,
  isRTLStrongCharacter,
  isLTRStrongCharacter
} from './DomTranslatorConstants.js';

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

  for (let i = 0; i < trimmedText.length; i++) {
    const code = trimmedText.codePointAt(i);
    // If the character is outside the BMP (Basic Multilingual Plane), 
    // it's represented as a surrogate pair (occupies 2 units in string length).
    // codePointAt returns the full code, so we skip the next surrogate unit.
    if (code > 0xFFFF) i++;

    if (isRTLStrongCharacter(code)) {
      rtlStrongCount++;
    } else if (isLTRStrongCharacter(code)) {
      ltrStrongCount++;
    }
  }

  // If no strong directional characters, default to LTR
  if (rtlStrongCount === 0 && ltrStrongCount === 0) return 'ltr';
  
  // If there are ANY RTL characters, and the LTR count isn't overwhelmingly dominant
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
    
    // Interactive tags
    if (INTERACTIVE_TAGS.has(tag)) return true;
    
    // NEW: If a formatting element has multiple element children, it's likely a complex 
    // UI component (like a header bar or metadata row) where item order must be preserved.
    if (FORMATTING_TAGS.has(tag) && node.children.length > 1) return true;

    // Recursive check for formatting tags to see if they contain icons
    if (FORMATTING_TAGS.has(tag)) {
      return Array.from(node.children).some(isUIElement);
    }
    
    return false;
  };

  // 3. Mixed Content or UI Components
  // If the element itself is a UI component or contains any, it's a layout barrier.
  if (isUIElement(el)) return true;
  if (el.children.length > 0 && Array.from(el.children).some(isUIElement)) return true;

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
 * Determines the best text alignment to preserve the original layout intent.
 * If the element was originally left-aligned, it should stay left-aligned even in RTL.
 * @param {HTMLElement} element 
 * @returns {string|null} The alignment value to apply, or null if no change needed.
 */
function getPreservedAlignment(element) {
  if (!BLOCK_TAGS.has(element.tagName.toUpperCase())) return null;

  const computedStyle = window.getComputedStyle(element);
  const textAlign = computedStyle.textAlign;
  const currentDir = computedStyle.direction; // 'ltr' or 'rtl'
  
  // If the element is centered or justified, definitely keep it that way.
  if (textAlign === 'center' || textAlign === 'justify' || 
      textAlign === '-webkit-center' || textAlign === '-moz-center') {
    return textAlign;
  }

  // Check for legacy align attribute
  const alignAttr = element.getAttribute('align');
  if (alignAttr === 'center' || alignAttr === 'justify') return alignAttr;

  // Resolve logical 'start'/'end' to physical 'left'/'right' 
  // based on the current direction BEFORE we change it.
  if (textAlign === 'start') {
    return currentDir === 'rtl' ? 'right' : 'left';
  }
  if (textAlign === 'end') {
    return currentDir === 'rtl' ? 'left' : 'right';
  }

  // For other cases (already left or right), return the value as is
  return textAlign;
}

// --- 2. State Management (Internal) ---

/**
 * Saves original styles to data-attributes before modification
 */
function saveOriginalStyles(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE || element.hasAttribute('data-dir-original-saved')) return;
  element.setAttribute('data-original-direction', element.style.direction || '');
  element.setAttribute('data-original-text-align', element.style.textAlign || '');
  
  // Also save original dir attribute if it exists
  const originalDir = element.getAttribute('dir');
  if (originalDir !== null) {
    element.setAttribute('data-original-dir', originalDir);
  }
  
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

  // Apply direction to the entire safe ancestry chain
  while (container && container !== document.body) {
    // We respect isLayoutContainer strictly to ensure we don't flip layouts by accident.
    if (isLayoutContainer(container)) break;
    
    // RTL Dominance Rule: In mixed-direction content, we prioritize RTL for the container
    // to ensure correct punctuation and BiDi flow for translated Persian/Arabic text.
    // If we've already set this container to RTL, don't let a subsequent LTR node override it.
    const currentAppliedDir = container.getAttribute('data-translate-dir');
    if (!(targetDir === 'ltr' && currentAppliedDir === 'rtl')) {
      
      // Only apply if different to avoid redundant DOM operations
      if (container.style.direction !== targetDir) {
        // Capture alignment BEFORE changing direction
        const preservedAlign = getPreservedAlignment(container);
        
        saveOriginalStyles(container);
        container.style.direction = targetDir;
        
        if (preservedAlign) {
          container.style.textAlign = preservedAlign;
        }
        
        container.setAttribute('data-translate-dir', targetDir);
      }
    }

    // SURGICAL STOP: In Select Element mode, we NEVER apply direction above the 
    // element explicitly selected by the user. This preserves the page's overall layout.
    if (rootElement && container === rootElement) break;
    
    container = container.parentElement;
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

  // Capture alignment BEFORE changing direction
  const preservedAlign = getPreservedAlignment(element);

  saveOriginalStyles(element);

  element.style.direction = directionAttr;
  
  if (preservedAlign) {
    element.style.textAlign = preservedAlign;
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
       // Restore from saved attributes
       const origDir = el.getAttribute('data-original-direction');
       const origAlign = el.getAttribute('data-original-text-align');

       if (origDir) el.style.direction = origDir;
       else el.style.removeProperty('direction');

       if (origAlign) el.style.textAlign = origAlign;
       else el.style.removeProperty('text-align');

       // Restore dir attribute if we saved it
       if (el.hasAttribute('data-original-dir')) {
         el.setAttribute('dir', el.getAttribute('data-original-dir'));
       } else {
         el.removeAttribute('dir');
       }

       // Remove all our tracking attributes
       el.removeAttribute('data-original-direction');
       el.removeAttribute('data-original-text-align');
       el.removeAttribute('data-original-dir');
       el.removeAttribute('data-dir-original-saved');
       el.removeAttribute('data-translate-dir');
       el.removeAttribute('data-page-translated');
       el.removeAttribute('data-has-original');
     }
   };

   restore(element);
   element.querySelectorAll('[data-dir-original-saved]').forEach(restore);
}
