// ElementSelector - Handles element highlighting, selection, and navigation prevention
// Simplified version that replaces ElementHighlighter with core selection logic

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { UI_HOST_IDS } from '@/shared/config/constants.js';

/**
 * Element selection and highlighting functionality
 */
export class ElementSelector extends ResourceTracker {
  constructor() {
    super('element-selector');

    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'ElementSelector');

    // State
    this.currentHighlighted = null;
    this.highlightTimeout = null;
    this.isActive = false;

    // Configuration
    this.config = {
      minArea: 4000,
      maxArea: 120000,
      minTextLength: 20,
      minWordCount: 3,
      maxAncestors: 10,
      highlightTimeout: 100, // ms before clearing highlight on mouseout
    };

    // Highlight class name
    this.HIGHLIGHT_CLASS = 'translate-it-element-highlighted';

    this.logger.debug('ElementSelector created');
  }

  /**
   * Initialize the selector
   */
  async initialize() {
    this.logger.debug('Initializing ElementSelector');

    // Inject highlight styles if not already present
    this._ensureHighlightStyles();

    this.logger.debug('ElementSelector initialized');
  }

  /**
   * Ensure highlight styles are injected
   * @private
   */
  _ensureHighlightStyles() {
    if (document.getElementById('translate-it-select-styles')) {
      return; // Already injected
    }

    const style = document.createElement('style');
    style.id = 'translate-it-select-styles';
    style.textContent = `
      .translate-it-cursor-select, 
      .translate-it-cursor-select * {
        cursor: crosshair !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        touch-action: none !important; /* Critical for Scanner Mode: prevent browser scroll */
      }
      
      .translate-it-element-highlighted {
        outline: 2px solid #4a90d9 !important;
        outline-offset: -2px !important;
        box-shadow: inset 0 0 8px rgba(74, 144, 217, 0.4) !important;
        transition: outline 0.1s ease, box-shadow 0.1s ease;
      }
    `;
    document.head.appendChild(style);

    this.trackResource(style, 'highlight-styles', { isCritical: true });
  }

  /**
   * Check if element belongs to the extension (should be excluded)
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element should be excluded
   */
  /**
   * Check if element belongs to the extension's UI (should be excluded from blocking)
   * This is critical: it must ONLY return true for our actual UI controls,
   * NOT for elements of the site that we have highlighted.
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element is our UI
   */
  isOurElement(element) {
    if (!element || !element.classList) return false;
    
    // 1. Check for our UI Host (Shadow DOM root)
    if (element.id && (element.id === UI_HOST_IDS.MAIN || element.id === UI_HOST_IDS.IFRAME)) {
      return true;
    }

    // 2. Check for our UI container classes
    if (element.classList.contains('translate-it-toast') || 
        element.classList.contains('translate-it-notification') ||
        element.classList.contains('translate-it-ui-host')) {
      return true;
    }

    // 3. Check for specific extension IDs
    if (element.id && element.id.startsWith('translate-it-')) {
      // EXCEPTION: Don't count the highlighted element as "our UI" 
      // even if it has our styles or ID prefix (if we used any there)
      if (element.classList.contains(this.HIGHLIGHT_CLASS)) {
        return false;
      }
      return true;
    }

    // 4. Use the detector but specifically for extension UI, not highlighted items
    // We traverse up to see if it's inside our UI host
    let current = element;
    while (current && current !== document.body) {
      if (current.id === UI_HOST_IDS.MAIN || current.id === UI_HOST_IDS.IFRAME) {
        return true;
      }
      // If it's inside a toast/notification container
      if (current.classList && (current.classList.contains('translate-it-toast') || current.classList.contains('translate-it-notification'))) {
        return true;
      }
      current = current.parentElement || (current.parentNode instanceof ShadowRoot ? current.parentNode.host : null);
    }

    return false;
  }

  /**
   * Handle mouse over event - highlight element
   * @param {HTMLElement} element - Element to highlight
   */
  handleMouseOver(element) {
    if (!this.isActive) {
      return;
    }

    // Guard against invalid elements
    if (!element || typeof element.hasAttribute !== 'function') {
      return;
    }

    // Skip our own elements
    if (this.isOurElement(element)) {
      return;
    }

    // Find the best element to highlight
    const bestElement = this.findBestTextElement(element);

    if (!bestElement || typeof bestElement.hasAttribute !== 'function' || this.isOurElement(bestElement)) {
      return;
    }

    // Skip if already highlighted
    if (bestElement === this.currentHighlighted) {
      return;
    }

    // Clear previous highlight
    this.clearHighlight();

    // Add highlight
    bestElement.classList.add(this.HIGHLIGHT_CLASS);
    bestElement.setAttribute('data-translate-highlighted', 'true');
    this.currentHighlighted = bestElement;

    this.logger.debug('Element highlighted', {
      tag: bestElement.tagName,
      textLength: bestElement.textContent?.length || 0,
    });
  }

  /**
   * Handle mouse out event - clear highlight with timeout
   */
  handleMouseOut() {
    if (!this.isActive) return;

    // Clear any existing timeout
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout);
    }

    // Set timeout to clear highlight (prevents flicker)
    this.highlightTimeout = setTimeout(() => {
      this.clearHighlight();
    }, this.config.highlightTimeout);
  }

  /**
   * Clear the current highlight
   */
  clearHighlight() {
    if (this.currentHighlighted) {
      this.currentHighlighted.classList.remove(this.HIGHLIGHT_CLASS);
      this.currentHighlighted.removeAttribute('data-translate-highlighted');
      this.currentHighlighted = null;
    }

    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout);
      this.highlightTimeout = null;
    }
  }

  /**
   * Find the best element to highlight for translation
   * @param {HTMLElement} startElement - Starting element
   * @returns {HTMLElement|null} Best element to highlight
   */
  findBestTextElement(startElement) {
    let element = startElement;
    let maxAncestors = 15; // Increased depth for modern deep DOMs

    // We want the DEEPEST element that satisfies the minimum requirements.
    // This makes the selection much more surgical and responsive.
    while (element && element !== document.body && element !== document.documentElement && maxAncestors-- > 0) {
      if (this.isValidTextElement(element)) {
        const area = element.offsetWidth * element.offsetHeight;
        const text = element.textContent?.trim() || '';
        const wordCount = text.split(/\s+/).length;

        // Check if this element is a good candidate
        // We prioritize smaller, more specific elements by stopping at the first valid one we hit while going UP.
        if (
          area >= this.config.minArea &&
          area <= this.config.maxArea &&
          text.length >= this.config.minTextLength &&
          wordCount >= this.config.minWordCount
        ) {
          return element; // Stop here! Don't climb to large parents.
        }
      }

      element = element.parentElement;
    }

    // Fallback: if no good candidate found via area, use startElement if it is a valid text element
    if (startElement && this.isValidTextElement(startElement)) {
      const text = startElement.textContent?.trim() || '';
      if (text.length >= this.config.minTextLength) {
        return startElement;
      }
    }

    return null;
  }

  /**
   * Check if element is valid for text selection
   * @param {HTMLElement} element - Element to validate
   * @returns {boolean} Whether element is valid
   */
  isValidTextElement(element) {
    if (!element) return false;

    // Skip root and invalid tags
    // Translating HTML/BODY destroys the extension's UI containers
    const invalidTags = ['HTML', 'BODY', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'IFRAME'];
    if (invalidTags.includes(element.tagName)) {
      return false;
    }

    // Skip invisible elements
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    // Skip our own elements
    if (this.isOurElement(element)) {
      return false;
    }

    // Must have text content
    const text = element.textContent?.trim() || '';
    return text.length > 0;
  }

  /**
   * Activate the selector (start listening to mouse events)
   */
  activate() {
    this.isActive = true;
    this._setCursor(true);

    this.logger.debug('ElementSelector activated');
  }

  /**
   * Deactivate the selector (stop listening to mouse events)
   */
  deactivate() {
    this.isActive = false;
    this.clearHighlight();
    this._setCursor(false);

    this.logger.debug('ElementSelector deactivated');
  }

  /**
   * Set crosshair cursor on document
   * @param {boolean} enabled - Whether to enable cursor
   * @private
   */
  _setCursor(enabled) {
    const root = document.documentElement;
    if (enabled) {
      root.classList.add('translate-it-cursor-select');
    } else {
      root.classList.remove('translate-it-cursor-select');
    }
  }

  /**
   * Get the currently highlighted element
   * @returns {HTMLElement|null} Current highlighted element
   */
  getHighlightedElement() {
    return this.currentHighlighted;
  }

  /**
   * Check if selector is active
   * @returns {boolean} Active status
   */
  isSelectorActive() {
    return this.isActive;
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration values
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.debug('Configuration updated', this.config);
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.logger.debug('Cleaning up ElementSelector');

    // Clear state
    this.deactivate();

    // Remove highlight styles
    const styleEl = document.getElementById('translate-it-select-styles');
    if (styleEl) {
      styleEl.remove();
    }

    // Use ResourceTracker cleanup
    super.cleanup();

    this.logger.debug('ElementSelector cleanup completed');
  }
}

export default ElementSelector;
