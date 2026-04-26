import { PAGE_TRANSLATION_ATTRIBUTES } from './PageTranslationConstants.js';

/**
 * PageTranslationHelper - Utility methods for whole page translation
 */
export class PageTranslationHelper {
  /**
   * Normalize text for consistent tracking and comparison
   */
  static normalizeText(text) {
    if (!text) return '';
    return text.trim().replace(/\s+/g, ' ');
  }

  /**
   * Determine if a text should be translated.
   */
  static shouldTranslate(text) {
    if (!text) return false;
    const trimmed = text.trim();
    
    // Skip empty or purely whitespace strings
    if (!trimmed) return false;

    // Filter rules
    const isNumeric = /^\d+$/.test(trimmed);
    const isTime = /^(\d+:)+\d+$/.test(trimmed);
    
    // ALLOW 2+ character words for English (e.g., "In", "On", "Go")
    // For Farsi/Arabic, we already have special handling.
    const isTooShort = trimmed.length < 2 && !/[\u0600-\u06FF]/.test(trimmed);
    const isMetric = /^\d+(\.\d+)?[kKM]$/.test(trimmed);

    const shouldSkip = isNumeric || isTime || isTooShort || isMetric;

    return !shouldSkip;
  }

  /**
   * Deeply clean all translation-related markers from the DOM.
   * This is crucial for allowing re-translation and clean restoration.
   */
  static deepCleanDOM() {
    const { TRANSLATED_MARKER, TRANSLATE_DIR, HAS_ORIGINAL } = PAGE_TRANSLATION_ATTRIBUTES;

    // 1. Remove our own markers and direction attributes from all elements
    // We do NOT touch 'dir' here because restoreElementDirection (called by bridge.restore)
    // should have already handled it properly using saved original state.
    const elementsWithMarkers = document.querySelectorAll(`[${TRANSLATED_MARKER}], [${TRANSLATE_DIR}], [${HAS_ORIGINAL}]`);
    elementsWithMarkers.forEach(el => {
      el.removeAttribute(TRANSLATED_MARKER);
      el.removeAttribute(TRANSLATE_DIR);
      el.removeAttribute(HAS_ORIGINAL);
    });

    // 2. Specific reset for common containers (just the markers)
    const containers = ['html', 'body', 'main', 'article', 'section'];
    containers.forEach(tag => {
      const el = document.querySelector(tag);
      if (el) {
        el.removeAttribute(TRANSLATED_MARKER);
        el.removeAttribute(TRANSLATE_DIR);
        el.removeAttribute(HAS_ORIGINAL);
      }
    });
  }

  /**
   * Finds the nearest semantic container for a node to group related texts.
   * This helps in "Logical Context Batching" to prevent language detection traps.
   * 
   * @param {Node} node - The DOM node
   * @returns {HTMLElement|null} The nearest semantic container element
   */
  static getNearestSemanticContainer(node) {
    if (!node) return null;
    
    let element = node.nodeType === Node.TEXT_NODE ? node.parentElement :
                 (node.nodeType === Node.ATTRIBUTE_NODE ? node.ownerElement : node);
    
    if (!element) return null;

    // Define semantic tags that represent a logical context
    const semanticTags = new Set([
      'ARTICLE', 'ASIDE', 'NAV', 'SECTION', 'HEADER', 'FOOTER', 
      'MAIN', 'FORM', 'BLOCKQUOTE', 'UL', 'OL'
    ]);

    let current = element;
    let depth = 0;
    const MAX_DEPTH = 10; // Performance safety limit

    while (current && depth < MAX_DEPTH) {
      if (semanticTags.has(current.tagName)) {
        return current;
      }
      
      // Special case for Twitter/React: check for roles
      const role = current.getAttribute('role');
      if (role === 'article' || role === 'navigation' || role === 'main') {
        return current;
      }

      current = current.parentElement;
      depth++;
    }

    return null;
  }

  /**
   * Check if a node is within the viewport plus a given margin.
   * This is used for prioritization and lazy loading.
   * 
   * NOTE: Removed offsetParent check to support fixed/sticky elements.
   * Relying on getBoundingClientRect which returns 0x0 for display:none.
   * 
   * @param {Node} node - The DOM node to check (Text, Attribute or Element)
   * @param {number} margin - Extra safety margin in pixels
   * @param {Object} logger - Optional logger for debugging
   * @returns {boolean}
   */
  static isInViewportWithMargin(node, margin, logger = null) {
    if (!node) return false;
    try {
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement :
                     (node.nodeType === Node.ATTRIBUTE_NODE ? node.ownerElement : node);

      if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
      
      // Basic connectivity check to ensure the element is still in the DOM
      if (!element.isConnected) return false;

      const rect = element.getBoundingClientRect();
      
      // If the element has no dimensions, it's effectively invisible
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

      const inViewport = (
        rect.bottom >= -margin &&
        rect.top <= viewportHeight + margin &&
        rect.right >= -margin &&
        rect.left <= viewportWidth + margin
      );
      
      return inViewport;
    } catch (e) {
      if (logger) logger.debug('Error in isInViewportWithMargin', e);
      return false;
    }
  }

  static isSuitableForTranslation(logger = null) {
    if (window === window.top) return true;
    try {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width < 50 || height < 50) {
        if (logger) logger.debug('Frame too small for translation', { width, height });
        return false;
      }
      const style = window.getComputedStyle(document.documentElement);
      if (style.display === 'none' || style.visibility === 'hidden') {
        if (logger) logger.debug('Frame hidden, skipping translation');
        return false;
      }
      return true;
    } catch (error) {
      if (logger) logger.debug('Error checking frame suitability', error);
      return window.innerWidth > 150 && window.innerHeight > 150;
    }
  }
}
