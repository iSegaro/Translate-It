/**
 * DomDirectionManager - Shared logic for RTL/LTR direction management.
 * 
 * Strategy: "Directional Isolation"
 * Applies direction and alignment only to the immediate containers of translated text,
 * ensuring that global layouts (like headers, sidebars, and item rows with icons)
 * remain unaffected.
 */

import { 
  BLOCK_TAGS, 
  LAYOUT_TAGS, 
  LAYOUT_DISPLAY_MODES, 
  INTERACTIVE_TAGS
} from './DomTranslatorConstants.js';
import { LanguageDetectionService } from '@/shared/services/LanguageDetectionService.js';

// --- 1. Core Utilities ---

/**
 * Checks if a language code is RTL
 */
export function isRTL(langCode) {
  return LanguageDetectionService.isRTL(langCode);
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
 */
export function stripBiDiMarks(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/[\u200E\u200F]/g, '');
}

/**
 * Detect text direction from actual text content.
 * Biased towards target language for translated content.
 */
export function detectDirectionFromContent(text = '', targetLanguage = null) {
  return LanguageDetectionService.getDirection(text, targetLanguage);
}

/**
 * Identifies structural layout barriers that should not have their flow reversed.
 * Uses standards-based detection (ARIA roles, CSS isolation, structural complexity).
 */
function isLayoutBarrier(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = el.tagName.toUpperCase();

  // 1. Standard Structural Barriers (Major HTML Tags)
  if (LAYOUT_TAGS.has(tag)) return true;

  // 2. Interactive and Media Elements (UI Components)
  if (INTERACTIVE_TAGS.has(tag) || tag === 'SVG' || tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS') return true;

  // 3. Custom Elements (Web Components) - Standard W3C check (tags with hyphens)
  if (tag.includes('-')) return true;

  // 4. Semantic ARIA Roles (Standard layout roles)
  const role = el.getAttribute('role');
  if (role && ['article', 'listitem', 'region', 'group', 'main', 'complementary', 'navigation', 'search'].includes(role)) {
    return true;
  }

  const style = window.getComputedStyle(el);

  // 5. Layout Engine Check (Flex/Grid)
  // Even with one child, they are structural boundaries.
  if (LAYOUT_DISPLAY_MODES.has(style.display)) return true;

  // 6. CSS Containment & Isolation (Explicit Web Standards)
  if (style.isolation === 'isolate' || (style.contain && style.contain !== 'none')) return true;

  // 7. Scrolling Containers are always barriers
  if (style.overflow !== 'visible' && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) {
    return true;
  }

  // 8. Structural Complexity Check
  // If it has multiple children and those are block-level or structural, it's a container.
  if (el.children.length > 1) {
    const hasBlockChildren = Array.from(el.children).some(child => {
      const childTag = child.tagName.toUpperCase();
      // If child is a block tag or has block-like display
      if (BLOCK_TAGS.has(childTag)) return true;
      
      const childStyle = window.getComputedStyle(child);
      return ['block', 'flex', 'grid', 'list-item'].includes(childStyle.display);
    });
    
    if (hasBlockChildren) return true;
  }

  return false;
}

/**
 * Determines if text alignment should be preserved based on explicit styles.
 */
function getPreservedAlignment(element) {
  // Use computed style to detect alignment from CSS classes (especially for center/justify)
  const style = window.getComputedStyle(element);
  const computedAlign = style.textAlign;

  // 1. Always preserve 'center' and 'justify' - they are intentional design choices
  // regardless of whether they come from inline styles or CSS classes.
  if (computedAlign === 'center' || computedAlign === 'justify') {
    return computedAlign;
  }

  // 2. Check for explicit inline style alignment for left/right.
  // We only preserve 'left' or 'right' if they are set as inline styles.
  // This is because we want to allow the system to change direction-based
  // alignment (like default left) to right for RTL, but respect
  // explicit overrides.
  const inlineAlign = element.style.textAlign;
  if (inlineAlign === 'left' || inlineAlign === 'right') {
    return inlineAlign;
  }

  // 3. Check for legacy align attribute
  const alignAttr = element.getAttribute('align');
  if (alignAttr === 'center' || alignAttr === 'justify') return alignAttr;

  // For Block tags, if no explicit style exists, we let it follow direction.
  if (BLOCK_TAGS.has(element.tagName.toUpperCase())) {
    // If we're translating to RTL, and it's currently effectively LTR,
    // we return null to allow the application logic to set 'right' safely.
    return null;
  }

  return null;
}

// --- 2. Styles Management ---

function saveOriginalStyles(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE || element.hasAttribute('data-dir-original-saved')) return;
  
  element.setAttribute('data-original-direction', element.style.direction || '');
  element.setAttribute('data-original-text-align', element.style.textAlign || '');
  element.setAttribute('data-original-unicode-bidi', element.style.unicodeBidi || '');
  element.setAttribute('data-original-max-width', element.style.maxWidth || '');
  
  const originalDir = element.getAttribute('dir');
  if (originalDir !== null) element.setAttribute('data-original-dir', originalDir);
  
  element.setAttribute('data-dir-original-saved', 'true');
}

// --- 3. Core Application Logic ---

/**
 * Surgical Application: Applies isolated direction to text containers.
 */
export function applyNodeDirection(textNode, targetLanguage, rootElement = null) {
  const isTargetRTL = isRTL(targetLanguage);
  const detectedDir = detectDirectionFromContent(textNode.textContent, targetLanguage);
  const targetDir = detectedDir || (isTargetRTL ? 'rtl' : 'ltr');
  
  let container = textNode.parentElement;
  let level = 0;

  while (container && container !== document.body && container !== document.documentElement) {
    const tag = container.tagName.toUpperCase();
    const isBlock = BLOCK_TAGS.has(tag);
    
    // Stop if we hit a layout barrier (like a flex row with an avatar)
    // But allow at least 1 level of application to the immediate parent.
    if (level > 0 && isLayoutBarrier(container)) break;
    
    const currentAppliedDir = container.getAttribute('data-translate-dir');

    // Apply isolation and direction
    if (!(targetDir === 'ltr' && currentAppliedDir === 'rtl')) {
      if (container.style.direction !== targetDir || !currentAppliedDir) {
        saveOriginalStyles(container);
        
        // 1. Apply Directional Isolation
        container.style.direction = targetDir;
        container.style.unicodeBidi = 'isolate';
        
        // 2. Surgical isolation: Prevent long translated strings from pushing parent width
        if (isBlock) {
          container.style.maxWidth = '100%';
        }
        
        // 3. Handle Text Alignment for Block elements
        if (isTargetRTL && isBlock) {
          const preserved = getPreservedAlignment(container, targetLanguage);
          // Only force 'right' if no explicit alignment exists
          if (!preserved) {
            container.style.textAlign = 'right';
          }
        }
        
        container.setAttribute('data-translate-dir', targetDir);
      }
    }

    // Surgical stops
    if (rootElement && container === rootElement) break;
    if (rootElement && !container.contains(rootElement) && container !== rootElement) break;
    
    container = container.parentElement;
    level++;
  }
}

/**
 * Direct Application: For high-level element management.
 */
export function applyElementDirection(element, targetLanguage) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
  if (isLayoutBarrier(element)) return;

  const isTargetRTL = isRTL(targetLanguage);
  const detectedDir = detectDirectionFromContent(element.textContent, targetLanguage);
  const targetDir = detectedDir || (isTargetRTL ? 'rtl' : 'ltr');

  saveOriginalStyles(element);
  
  element.style.direction = targetDir;
  element.style.unicodeBidi = 'isolate';
  element.style.maxWidth = '100%';
  
  if (isTargetRTL && BLOCK_TAGS.has(element.tagName.toUpperCase())) {
    const preserved = getPreservedAlignment(element, targetLanguage);
    if (!preserved) {
      element.style.textAlign = 'right';
    }
  }
  
  element.setAttribute('data-translate-dir', targetDir);
}

// --- 4. Restoration Logic ---

/**
 * Reverts CSS direction changes.
 */
export function restoreElementDirection(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

  const restore = (el) => {
    if (el.hasAttribute('data-dir-original-saved')) {
      const origDir = el.getAttribute('data-original-direction');
      const origAlign = el.getAttribute('data-original-text-align');
      const origBidi = el.getAttribute('data-original-unicode-bidi');
      const origMaxW = el.getAttribute('data-original-max-width');

      if (origDir) el.style.direction = origDir;
      else el.style.removeProperty('direction');

      if (origAlign) el.style.textAlign = origAlign;
      else el.style.removeProperty('text-align');

      if (origBidi) el.style.unicodeBidi = origBidi;
      else el.style.removeProperty('unicode-bidi');

      if (origMaxW) el.style.maxWidth = origMaxW;
      else el.style.removeProperty('max-width');

      if (el.hasAttribute('data-original-dir')) {
        el.setAttribute('dir', el.getAttribute('data-original-dir'));
      } else {
        el.removeAttribute('dir');
      }

      el.removeAttribute('data-original-direction');
      el.removeAttribute('data-original-text-align');
      el.removeAttribute('data-original-unicode-bidi');
      el.removeAttribute('data-original-dir');
      el.removeAttribute('data-dir-original-saved');
      el.removeAttribute('data-translate-dir');
      el.removeAttribute('data-page-translated');
      el.removeAttribute('data-has-original');
    }
  };

  restore(element);
  element.querySelectorAll('[data-dir-original-saved]').forEach(restore);
  
  let parent = element.parentElement;
  while (parent) {
    restore(parent);
    parent = parent.parentElement;
  }
}
