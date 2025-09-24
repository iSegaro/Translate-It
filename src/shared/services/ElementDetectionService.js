import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import {
  COMBINED_SELECTORS,
  DYNAMIC_PATTERNS,
  DETECTION_OPTIONS,
  ELEMENT_TYPES
} from './ElementDetectionConfig.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'ElementDetectionService');

/**
 * Element Detection Service
 *
 * Provides optimized element detection methods with centralized selector management.
 * Eliminates repetitive DOM queries and provides a single source of truth for element detection.
 */
export class ElementDetectionService {
  constructor() {
    this._cache = new Map();
    this._combinedSelectors = COMBINED_SELECTORS;
    this._dynamicPatterns = DYNAMIC_PATTERNS;
  }

  /**
   * Get the singleton instance
   */
  static getInstance() {
    if (!ElementDetectionService._instance) {
      ElementDetectionService._instance = new ElementDetectionService();
    }
    return ElementDetectionService._instance;
  }

  /**
   * Check if an element is a translation-related element
   * @param {Element} element - The element to check
   * @returns {boolean} True if the element is translation-related
   */
  isTranslationElement(element) {
    if (!element || !element.isConnected) return false;

    // Check cache first
    const cacheKey = `translation-${element.tagName}-${element.className}-${element.id}`;
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    // Check if element itself matches translation selectors
    const isTranslation = element.matches(this._combinedSelectors.TRANSLATION) ||
                         this.findNearestTranslationElement(element) !== null;

    // Cache the result
    this._cache.set(cacheKey, isTranslation);
    return isTranslation;
  }

  /**
   * Check if an element is an icon element
   * @param {Element} element - The element to check
   * @returns {boolean} True if the element is an icon
   */
  isIconElement(element) {
    if (!element || !element.isConnected) return false;

    // Check cache first
    const cacheKey = `icon-${element.tagName}-${element.className}-${element.id}`;
    if (this._cache.has(cacheKey)) {
      return this._cache.get(cacheKey);
    }

    // Check if element itself matches icon selectors
    const isIcon = element.matches(this._combinedSelectors.ICON) ||
                   this.findNearestIconElement(element) !== null;

    // Cache the result
    this._cache.set(cacheKey, isIcon);
    return isIcon;
  }

  /**
   * Check if an element is a host container
   * @param {Element} element - The element to check
   * @returns {boolean} True if the element is a host container
   */
  isHostElement(element) {
    if (!element || !element.isConnected) return false;

    return element.matches(this._combinedSelectors.HOST) ||
           element.closest(this._combinedSelectors.HOST) !== null;
  }

  /**
   * Check if an element is a UI element (translation, icon, or host)
   * @param {Element} element - The element to check
   * @returns {boolean} True if the element is a UI element
   */
  isUIElement(element) {
    return this.isTranslationElement(element) ||
           this.isIconElement(element) ||
           this.isHostElement(element);
  }

  /**
   * Find the nearest translation-related ancestor
   * @param {Element} element - The starting element
   * @param {number} maxDepth - Maximum depth to search (default from config)
   * @returns {Element|null} The nearest translation element or null
   */
  findNearestTranslationElement(element, maxDepth = DETECTION_OPTIONS.MAX_ANCESTOR_DEPTH) {
    return this.findNearestMatchingElement(element, this._combinedSelectors.TRANSLATION, maxDepth);
  }

  /**
   * Find the nearest icon ancestor
   * @param {Element} element - The starting element
   * @param {number} maxDepth - Maximum depth to search (default from config)
   * @returns {Element|null} The nearest icon element or null
   */
  findNearestIconElement(element, maxDepth = DETECTION_OPTIONS.MAX_ANCESTOR_DEPTH) {
    return this.findNearestMatchingElement(element, this._combinedSelectors.ICON, maxDepth);
  }

  /**
   * Find the nearest host container
   * @param {Element} element - The starting element
   * @param {number} maxDepth - Maximum depth to search (default from config)
   * @returns {Element|null} The nearest host element or null
   */
  findNearestHostElement(element, maxDepth = DETECTION_OPTIONS.MAX_ANCESTOR_DEPTH) {
    return this.findNearestMatchingElement(element, this._combinedSelectors.HOST, maxDepth);
  }

  /**
   * Find the nearest element matching any of the provided selectors
   * @param {Element} element - The starting element
   * @param {string} selectors - CSS selector string
   * @param {number} maxDepth - Maximum depth to search
   * @returns {Element|null} The nearest matching element or null
   */
  findNearestMatchingElement(element, selectors, maxDepth = DETECTION_OPTIONS.MAX_ANCESTOR_DEPTH) {
    if (!element || !element.isConnected) return null;

    let current = element;
    let depth = 0;

    while (current && depth <= maxDepth && current !== document.body) {
      if (current.matches(selectors)) {
        return current;
      }
      current = current.parentElement;
      depth++;
    }

    return null;
  }

  /**
   * Determine the type of a UI element
   * @param {Element} element - The element to classify
   * @returns {string} The element type from ELEMENT_TYPES
   */
  getElementType(element) {
    if (!element) return ELEMENT_TYPES.UNKNOWN;

    if (element.matches('.translation-window') || element.matches('[data-translation-window]')) {
      return ELEMENT_TYPES.TRANSLATION_WINDOW;
    }

    if (element.matches('.translation-icon') || element.matches('[data-translation-icon]')) {
      return ELEMENT_TYPES.TRANSLATION_ICON;
    }

    if (element.id?.startsWith('text-field-icon-')) {
      return ELEMENT_TYPES.TEXT_FIELD_ICON;
    }

    if (element.id?.startsWith('translate-it-host')) {
      return ELEMENT_TYPES.HOST;
    }

    if (element.matches('.popup-container') || element.matches('.aiwc-selection-popup-host')) {
      return ELEMENT_TYPES.POPUP;
    }

    return ELEMENT_TYPES.UNKNOWN;
  }

  /**
   * Check if an element has a dynamic ID matching a pattern
   * @param {Element} element - The element to check
   * @param {string} patternName - The pattern name from DYNAMIC_PATTERNS
   * @returns {boolean} True if the element's ID matches the pattern
   */
  hasDynamicId(element, patternName) {
    if (!element || !element.id) return false;

    const pattern = this._dynamicPatterns[patternName];
    return pattern ? pattern.test(element.id) : false;
  }

  /**
   * Find all elements matching a selector within a container
   * @param {Element|string} container - The container element or selector
   * @param {string} selector - The CSS selector
   * @param {Object} options - Search options
   * @returns {Element[]} Array of matching elements
   */
  findElements(container = document, selector, options = {}) {
    const {
      includeShadowDOM = DETECTION_OPTIONS.INCLUDE_SHADOW_DOM
    } = options;

    const elements = [];

    // Find elements in the main document
    const root = typeof container === 'string' ? document.querySelector(container) : container;
    if (!root) return elements;

    elements.push(...Array.from(root.querySelectorAll(selector)));

    // Search in shadow DOM if enabled
    if (includeShadowDOM) {
      const shadowElements = this.findInShadowDOM(root, selector);
      elements.push(...shadowElements);
    }

    return elements;
  }

  /**
   * Find elements within shadow DOM trees
   * @param {Element} root - The root element to search from
   * @param {string} selector - The CSS selector
   * @returns {Element[]} Array of matching elements in shadow DOM
   */
  findInShadowDOM(root, selector) {
    const elements = [];
    const shadowHosts = root.querySelectorAll('*');

    for (const host of shadowHosts) {
      if (host.shadowRoot) {
        elements.push(...Array.from(host.shadowRoot.querySelectorAll(selector)));
        // Recursively search nested shadow DOMs
        elements.push(...this.findInShadowDOM(host.shadowRoot, selector));
      }
    }

    return elements;
  }

  /**
   * Check if a click event target is inside any UI element
   * @param {Event} event - The click event
   * @returns {Object|null} Object with type and element if inside UI, null otherwise
   */
  getClickedUIElement(event) {
    const target = event.target;

    // Check if click is inside host element
    const hostElement = this.findNearestHostElement(target);
    if (hostElement) {
      return {
        type: ELEMENT_TYPES.HOST,
        element: hostElement
      };
    }

    // Check if click is on translation element
    const translationElement = this.findNearestTranslationElement(target);
    if (translationElement) {
      return {
        type: this.getElementType(translationElement),
        element: translationElement
      };
    }

    // Check if click is on icon element
    const iconElement = this.findNearestIconElement(target);
    if (iconElement) {
      return {
        type: this.getElementType(iconElement),
        element: iconElement
      };
    }

    return null;
  }

  /**
   * Clear the element cache
   * Call this when elements are dynamically added/removed
   */
  clearCache() {
    this._cache.clear();
    logger.debug('Element detection cache cleared');
  }

  /**
   * Get statistics about cache usage
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this._cache.size,
      keys: Array.from(this._cache.keys())
    };
  }
}

// Export singleton instance
export default ElementDetectionService.getInstance();