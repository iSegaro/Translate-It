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
 * @returns {string|null} 'rtl', 'ltr' or null if no strong characters
 */
export function detectDirectionFromContent(text = '') {
  if (!text || typeof text !== 'string') return null;

  const trimmedText = text.trim();
  if (trimmedText.length === 0) return null;

  // Count RTL and LTR STRONG characters
  let rtlStrongCount = 0;
  let ltrStrongCount = 0;

  for (let i = 0; i < trimmedText.length; i++) {
    const code = trimmedText.codePointAt(i);
    if (code > 0xFFFF) i++;

    if (isRTLStrongCharacter(code)) {
      rtlStrongCount++;
    } else if (isLTRStrongCharacter(code)) {
      ltrStrongCount++;
    }
  }

  // If no strong directional characters, return null
  if (rtlStrongCount === 0 && ltrStrongCount === 0) return null;
  
  // If there are ANY RTL characters...
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
  const isLayoutEngine = LAYOUT_DISPLAY_MODES.has(style.display) && el.children.length > 1;

  // Helper to check if a node is a UI/Layout element (non-textual or interactive)
  const isUIElement = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = node.tagName.toUpperCase();
    
    // 1. Definite UI/Media tags (excluding IMG for article compatibility)
    if (tag === 'SVG' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'AUDIO') return true;
    
    // 2. Interactive tags
    if (INTERACTIVE_TAGS.has(tag)) return true;
    
    // 3. Complex formatting elements with multiple children are often UI components
    // (like a header bar or metadata row) where item order must be preserved.
    if (FORMATTING_TAGS.has(tag) && node.children.length > 1) return true;

    // 4. Recursive check for any children that are UI elements
    if (node.children.length > 0) {
      return Array.from(node.children).some(isUIElement);
    }
    
    // 4. If it's a known text tag, it's not a barrier by itself
    if (FORMATTING_TAGS.has(tag) || BLOCK_TAGS.has(tag)) return false;

    // 5. Unknown tags (Web Components, custom elements) are barriers
    return true;
  };

  // 2. Strict barrier rules
  if (isLayoutEngine) return true;
  if (isUIElement(el)) return true;

  // 3. Formatting tags are NOT layout containers 
  if (FORMATTING_TAGS.has(el.tagName.toUpperCase())) return false;

  // 4. Rigid layout parts with explicit dimensions
  if (el.style.width || el.style.height || style.width.includes('px') || style.maxWidth !== 'none') {
    if (!BLOCK_TAGS.has(el.tagName.toUpperCase())) return true;
  }

  // 5. Check for block-level children that indicate a structural container
  const hasBlockChildren = Array.from(el.children).some(child => {
    const tag = child.tagName.toUpperCase();
    if (FORMATTING_TAGS.has(tag)) return false;
    
    const childStyle = window.getComputedStyle(child);
    return childStyle.display === 'block' || childStyle.display === 'flex' || childStyle.display === 'grid';
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
  const tag = element.tagName.toUpperCase();
  if (!BLOCK_TAGS.has(tag)) return null;

  const computedStyle = window.getComputedStyle(element);
  const textAlign = computedStyle.textAlign;
  const currentDir = computedStyle.direction; // 'ltr' or 'rtl'
  
  // 1. Always preserve explicit centering or browser-specific center values.
  if (textAlign === 'center' || textAlign === '-webkit-center' || textAlign === '-moz-center') {
    return textAlign;
  }

  // Check for legacy align attribute
  const alignAttr = element.getAttribute('align');
  if (alignAttr === 'center') return 'center';

  // 2. Structural elements (Table cells, List items)
  // We MUST lock these to their physical side to prevent the UI layout from breaking.
  if (tag === 'TD' || tag === 'TH' || tag === 'LI') {
    if (textAlign === 'start' || textAlign === 'justify') {
      return currentDir === 'rtl' ? 'right' : 'left';
    }
    if (textAlign === 'end') {
      return currentDir === 'rtl' ? 'left' : 'right';
    }
    return textAlign;
  }

  // 3. Content blocks (P, DIV, H1-H6)
  // If they have an explicit physical alignment (left or right), keep it.
  if (textAlign === 'left' || textAlign === 'right') {
    return textAlign;
  }

  // For default alignments (start, justify, end) in standard blocks, 
  // we return null to let them follow the new direction naturally.
  // This allows Persian paragraphs to be right-aligned and English to be left-aligned.
  return null;
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
  
  const targetDir = detectedDir || fallbackDir;
  
  let container = textNode.parentElement;

  // Apply direction to the safe ancestry chain
  while (container && container !== document.body) {
    // We respect isLayoutContainer strictly to ensure we don't flip layouts by accident.
    if (isLayoutContainer(container)) break;
    
    // RTL Dominance Rule: In mixed-direction content, we prioritize RTL for the container
    // to ensure correct punctuation and BiDi flow for translated Persian/Arabic text.
    // If we've already set this container to RTL, don't let a subsequent LTR node override it.
    const currentAppliedDir = container.getAttribute('data-translate-dir');
    
    // PRESERVATION RULE: If the target language is RTL, we strongly avoid forcing LTR 
    // on containers to prevent layout shifts (like columns moving to the left).
    // We only apply LTR if the element is a specific text-formatting tag and NOT a block container.
    const shouldSkipLTR = isTargetRTL && targetDir === 'ltr' && !FORMATTING_TAGS.has(container.tagName.toUpperCase());

    if (!shouldSkipLTR && !(targetDir === 'ltr' && currentAppliedDir === 'rtl')) {
      
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

    // SURGICAL STOP: In Select Element mode, we respect the user's selection boundary.
    // We stop IMMEDIATELY once we reach the rootElement to prevent affecting siblings or shared parents.
    if (rootElement && (container === rootElement)) {
      if (container.style.direction !== targetDir) {
        const preservedAlign = getPreservedAlignment(container);
        saveOriginalStyles(container);
        container.style.direction = targetDir;
        if (preservedAlign) container.style.textAlign = preservedAlign;
        container.setAttribute('data-translate-dir', targetDir);
      }
      break;
    }
    
    // Safety check for parent context in Select Element mode:
    // If we've already gone outside the rootElement, stop immediately.
    if (rootElement && !container.contains(rootElement) && container !== rootElement) {
      break;
    }
    
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

  const directionAttr = detectedDir || fallbackDir;

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
      const origDir = el.getAttribute('data-original-direction');
      const origAlign = el.getAttribute('data-original-text-align');

      if (origDir) el.style.direction = origDir;
      else el.style.removeProperty('direction');

      if (origAlign) el.style.textAlign = origAlign;
      else el.style.removeProperty('text-align');

      if (el.hasAttribute('data-original-dir')) {
        el.setAttribute('dir', el.getAttribute('data-original-dir'));
      } else {
        el.removeAttribute('dir');
      }

      el.removeAttribute('data-original-direction');
      el.removeAttribute('data-original-text-align');
      el.removeAttribute('data-original-dir');
      el.removeAttribute('data-dir-original-saved');
      el.removeAttribute('data-translate-dir');
      el.removeAttribute('data-page-translated');
      el.removeAttribute('data-has-original');
    }
  };

  // 1. Clean the element itself
  restore(element);
  
  // 2. Clean all its descendants
  element.querySelectorAll('[data-dir-original-saved]').forEach(restore);
  
  // 3. Clean all its ancestors up to the root (html)
  let parent = element.parentElement;
  while (parent) {
    restore(parent);
    parent = parent.parentElement;
  }
}
