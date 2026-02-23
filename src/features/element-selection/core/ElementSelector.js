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
      .translate-it-element-highlighted {
        outline: 2px solid #4a90d9 !important;
        outline-offset: -2px !important;
        background-color: rgba(74, 144, 217, 0.1) !important;
        cursor: crosshair !important;
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
    let bestCandidate = null;
    let maxAncestors = this.config.maxAncestors;

    // Check if current element meets conditions
    while (element && element !== document.body && maxAncestors-- > 0) {
      if (this.isValidTextElement(element)) {
        const area = element.offsetWidth * element.offsetHeight;
        const text = element.textContent?.trim() || '';
        const wordCount = text.split(/\s+/).length;

        // Only if appropriate size and sufficient text
        if (
          area >= this.config.minArea &&
          area <= this.config.maxArea &&
          text.length >= this.config.minTextLength &&
          wordCount >= this.config.minWordCount
        ) {
          bestCandidate = element;

          // Don't go higher if we found a good candidate
          // unless parent is significantly better
          const parent = element.parentElement;
          if (!parent || parent === document.body) {
            break;
          }

          const parentArea = parent.offsetWidth * parent.offsetHeight;
          const parentText = parent.textContent?.trim() || '';
          const parentWordCount = parentText.split(/\s+/).length;

          // Only prefer parent if it's not too large and has reasonable text density
          if (
            parentArea <= this.config.maxArea * 1.5 &&
            parentWordCount >= wordCount * 0.8
          ) {
            element = parent;
            continue;
          }

          break;
        }
      }

      element = element.parentElement;
    }

    // Fallback: if no good candidate found, use original element if it has text
    if (!bestCandidate && startElement) {
      const text = startElement.textContent?.trim() || '';
      if (text.length >= this.config.minTextLength) {
        bestCandidate = startElement;
      }
    }

    return bestCandidate;
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
   * @param {Event} event - Click event
   * @returns {boolean} Whether navigation was prevented
   */
  preventNavigation(event) {
    if (!event || !event.target) return false;

    const target = event.target;

    // Check if target is an interactive element
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
    const isInteractive = interactiveTags.includes(target.tagName) ||
                         target.getAttribute('role') === 'button' ||
                         target.getAttribute('role') === 'link' ||
                         target.onclick !== null;

    if (isInteractive) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      this.logger.debug('Navigation prevented', {
        tag: target.tagName,
        type: target.type,
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
    if (enabled) {
      document.body.classList.add('translate-it-cursor-select');
    } else {
      document.body.classList.remove('translate-it-cursor-select');
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
