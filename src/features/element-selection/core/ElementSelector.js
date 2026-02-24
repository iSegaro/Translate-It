// ElementSelector - Handles element highlighting, selection, and navigation prevention
// Simplified version that replaces ElementHighlighter with core selection logic

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ToastElementDetector } from '@/shared/toast/ToastElementDetector.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

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
      }
      
      .translate-it-element-highlighted {
        outline: 2px solid #4a90d9 !important;
        outline-offset: -2px !important;
      }
    `;
    document.head.appendChild(style);

    this.trackResource(style, 'highlight-styles');
  }

  /**
   * Check if element belongs to the extension (should be excluded)
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element should be excluded
   */
  isOurElement(element) {
    if (!element) return false;
    
    // Check for our own unique markers first (most reliable)
    if (element.id && element.id.startsWith('translate-it-')) return true;
    if (element.closest && element.closest('[id^="translate-it-"]')) return true;
    
    // Check for our classes
    if (element.classList && (
      element.classList.contains('translate-it-toast') || 
      element.classList.contains('translate-it-notification') ||
      element.classList.contains('translate-it-ui-host')
    )) {
      return true;
    }

    // Fallback to detector but with a safer check
    return ToastElementDetector.shouldExcludeFromSelection(element);
  }

  /**
   * Handle mouse over event - highlight element
   * @param {HTMLElement} element - Element to highlight
   */
  handleMouseOver(element) {
    if (!this.isActive) return;

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
   * @param {HTMLElement} element - Element being left
   */
  handleMouseOut(element) {
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

    // Fallback: if no good candidate found via area, use startElement if it has meaningful text
    if (startElement) {
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

    // Skip invalid tags
    const invalidTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK', 'IFRAME'];
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
   * Prevent navigation on interactive elements
   * @param {Event} event - Event to check
   * @returns {boolean} Whether navigation was prevented
   */
  preventNavigation(event) {
    if (!event || !event.target) return false;

    // Skip our own elements
    if (this.isOurElement(event.target)) {
      return false;
    }

    let target = event.target;
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
    
    // Check target and its ancestors for interactivity
    let isInteractive = false;
    let current = target;
    let depth = 0;
    
    while (current && current !== document.body && depth < 5) {
      if (
        interactiveTags.includes(current.tagName) ||
        current.getAttribute('role') === 'button' ||
        current.getAttribute('role') === 'link' ||
        current.onclick !== null ||
        current.style?.cursor === 'pointer'
      ) {
        isInteractive = true;
        target = current;
        break;
      }
      current = current.parentElement;
      depth++;
    }

    if (isInteractive) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      this.logger.debug('Navigation prevented', {
        tag: target.tagName,
        role: target.getAttribute('role'),
      });

      return true;
    }

    return false;
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
