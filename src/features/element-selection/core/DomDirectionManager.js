/**
 * DomDirectionManager - Standardized direction management for Select Element
 * Uses a combination of Unicode Marks (BiDi Isolation) and Surgical CSS direction.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { RTL_LANGUAGES, BLOCK_TAGS, LAYOUT_TAGS, FORMATTING_TAGS } from './DomTranslatorConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'DomDirectionManager');

/**
 * Check if a language code is RTL
 */
export function isRTL(langCode) {
  if (!langCode) return false;
  const base = langCode.toLowerCase().split('-')[0];
  return RTL_LANGUAGES.has(base);
}

/**
 * Standard Unicode Marks for BiDi control
 */
const RLM = '\u200F'; // Right-to-Left Mark
const LRM = '\u200E'; // Left-to-Right Mark

/**
 * Universally identify Layout Containers.
 * A layout container coordinates major UI components (Avatars, Sidebars, Grids).
 */
function isLayoutContainer(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  
  // 1. Structural Tags are always layout walls
  if (LAYOUT_TAGS.has(el.tagName)) return true;

  // 2. Multi-column Flex/Grid detection
  const style = window.getComputedStyle(el);
  const isLayoutDisplay = style.display === 'flex' || style.display === 'grid';
  if (isLayoutDisplay && el.children.length > 1) {
    // If it has multiple children, it's likely a row/column structure
    return true;
  }

  // 3. Block-level Child Check
  // If an element contains block-level children, it's a structural wrapper, not a simple text box.
  const hasBlockChildren = Array.from(el.children).some(child => {
    const childStyle = window.getComputedStyle(child);
    return !FORMATTING_TAGS.has(child.tagName) || childStyle.display === 'block' || childStyle.display === 'flex';
  });
  
  if (hasBlockChildren) return true;

  return false;
}

/**
 * Apply direction to a text node and its shared content context.
 * This is the most robust and universal method.
 */
export function applyNodeDirection(textNode, targetLanguage, rootElement = null) {
  const isTargetRTL = isRTL(targetLanguage);
  const mark = isTargetRTL ? RLM : LRM;
  
  // A. String-Level Isolation: Inject Unicode BiDi Mark (RLM/LRM)
  // This solves punctuation jumping issues at the source.
  if (textNode.nodeValue && !textNode.nodeValue.startsWith(mark)) {
    // Remove any existing marks first to avoid duplication
    const cleanValue = textNode.nodeValue.replace(/^[\u200E\u200F]/, '');
    textNode.nodeValue = mark + cleanValue;
  }

  // B. Context-Level Alignment: Fix segment ordering (Hashtags/Links)
  // We climb up to find the SMALLEST shared container that is NOT a layout wall.
  const targetDir = isTargetRTL ? 'rtl' : 'ltr';
  let container = textNode.parentElement;
  let lastSafeContainer = null;

  while (container && container !== document.body) {
    if (isLayoutContainer(container)) break; // Stop at structural boundaries
    
    lastSafeContainer = container;
    
    if (container === rootElement) break;
    container = container.parentElement;
  }

  // Apply direction ONLY to the safe content box
  if (lastSafeContainer) {
    if (lastSafeContainer.style.direction !== targetDir) {
      lastSafeContainer.style.direction = targetDir;
      // Ensure text starts from the logical beginning of the box
      if (BLOCK_TAGS.has(lastSafeContainer.tagName)) {
        lastSafeContainer.style.textAlign = 'start';
      }
    }
  }
}

/**
 * Apply direction to an element (used for non-streaming or full-element updates)
 */
export function applyDirection(element, targetLanguage) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return;

  // We rely on the more granular applyNodeDirection logic which is safer.
  // This method now acts as a guard to ensure we don't flip layouts.
  if (isLayoutContainer(element)) return;

  const isTargetRTL = isRTL(targetLanguage);
  const directionAttr = isTargetRTL ? 'rtl' : 'ltr';

  element.style.direction = directionAttr;
  if (BLOCK_TAGS.has(element.tagName)) {
    element.style.textAlign = 'start';
  }
  element.setAttribute('data-translate-dir', directionAttr);
}
