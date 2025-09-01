// ElementHighlighter Service - Handles UI highlighting and visual feedback

import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { taggleLinks } from "../../../../core/helpers.js";
import { UI_CONSTANTS } from "../constants/selectElementConstants.js";
// pageEventBus import removed - no longer needed for Shadow DOM

export class ElementHighlighter {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ElementHighlighter');
    this.currentHighlighted = null;
    this.overlayElements = new Set();
  }

  /**
   * Initialize the highlighter service
   */
  async initialize() {
    this.logger.debug('ElementHighlighter initialized');
  }

  /**
   * Check if element belongs to our extension (should be excluded from highlighting)
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} Whether element should be excluded
   */
  isOurElement(element) {
    if (!element) return false;
    
    // Check if element has our internal classes
    if (element.classList && (
      element.classList.contains('translate-it-element-highlighted') ||
      element.classList.contains('content-app-container')
    )) {
      return true;
    }
    
    // Check if element has our data attributes
    if (element.hasAttribute('data-translate-it-highlighted') ||
        element.hasAttribute('data-translate-id')) {
      return true;
    }
    
    return false;
  }

  /**
   * Handle mouse over event - highlight element using direct CSS class
   * @param {HTMLElement} element - Element to highlight
   */
  handleMouseOver(element) {
    // Skip our own elements
    if (this.isOurElement(element)) {
      return;
    }

    // Find the best element to highlight (may be different from event.target)
    const bestElement = this.findBestTextElement(element);
    
    if (!bestElement || this.isOurElement(bestElement)) return;

    // Skip if already highlighted
    if (bestElement === this.currentHighlighted) return;

    // Clear previous highlight
    this.clearHighlight();

    // Add highlight class directly to element
    bestElement.classList.add('translate-it-element-highlighted');
    this.currentHighlighted = bestElement;
  }

  /**
   * Find the best element to highlight for translation
   * This may walk up the DOM tree to find a more suitable parent
   * @param {HTMLElement} startElement - Starting element
   * @returns {HTMLElement|null} Best element to highlight
   */
  findBestTextElement(startElement) {
    let element = startElement;
    let bestCandidate = null;
    let maxAncestors = 10; // Default value, should come from config
    
    const minArea = 4000; // Minimum area for functional section
    const maxArea = 120000; // Maximum area to prevent selecting whole page
    const minTextLength = 20; // Minimum text length
    const minWordCount = 3; // Minimum word count

    // If current element meets conditions, select it
    while (element && element !== document.body && maxAncestors-- > 0) {
      if (this.isValidTextElement(element)) {
        const area = element.offsetWidth * element.offsetHeight;
        const text = element.textContent?.trim() || "";
        const wordCount = text.split(/\s+/).length;

        // Only if appropriate size and sufficient text
        if (
          area >= minArea && area <= maxArea &&
          text.length >= minTextLength &&
          wordCount >= minWordCount
        ) {
          bestCandidate = element;
          break;
        }
        // If too small or too large, go to parent
        if (!bestCandidate && area > minArea && area < maxArea) {
          bestCandidate = element;
        }
      }
      element = element.parentElement;
    }

    // If candidate found, check if there's a better child element
    if (bestCandidate) {
      const betterChild = this.findBetterChildElement(bestCandidate, startElement);
      if (betterChild) {
        bestCandidate = betterChild;
      }
      return bestCandidate;
    }
    // If no candidate found, highlight the current element (for user feedback)
    return startElement;
  }

  /**
   * Check if there's a better child element to select instead of the parent
   * @param {HTMLElement} parentElement - Parent element
   * @param {HTMLElement} originalElement - Original element
   * @returns {HTMLElement|null} Better child element
   */
  findBetterChildElement(parentElement, originalElement) {
    const parentArea = parentElement.offsetWidth * parentElement.offsetHeight;
    
    // Only look for better children in large parents
    if (parentArea < 10000) return null;
    
    const children = Array.from(parentElement.children);
    
    for (const child of children) {
      // Check if this child contains the original element or is close to it
      if (child.contains(originalElement) || child === originalElement) {
        if (this.isValidTextElement(child)) {
          const childArea = child.offsetWidth * child.offsetHeight;
          const childText = child.textContent?.trim() || "";
          const parentText = parentElement.textContent?.trim() || "";
          
          // Prefer child if:
          // 1. It's significantly smaller than parent
          // 2. It contains a good portion of the parent's text
          // 3. It has meaningful content
          const areaRatio = childArea / parentArea;
          const textRatio = childText.length / parentText.length;
          
          if (areaRatio < 0.7 && textRatio > 0.3 && this.isValidTextContent(childText)) {
            return child;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Handle mouse out event - remove highlight using direct CSS class
   * @param {HTMLElement} element - Element that mouse left
   */
  handleMouseOut(element) {
    // Only clear if leaving the highlighted element
    if (element === this.currentHighlighted) {
      setTimeout(() => {
        if (this.currentHighlighted === element) {
          // Remove highlight class directly
          element.classList.remove('translate-it-element-highlighted');
          this.currentHighlighted = null;
        }
      }, 50);
    }
  }

  /**
   * Highlight element - uses direct CSS class
   * @param {HTMLElement} element - Element to highlight
   */
  highlightElement(element) {
    if (element) {
      // Clear any existing highlights
      this.clearHighlight();
      
      // Add highlight class directly to element
      element.classList.add('translate-it-element-highlighted');
      this.currentHighlighted = element;
    }
  }

  /**
   * Clear current highlight - uses direct CSS class
   */
  clearHighlight() {
    // Remove highlight class directly from element
    if (this.currentHighlighted) {
      this.currentHighlighted.classList.remove('translate-it-element-highlighted');
      this.currentHighlighted = null;
    }
  }

  /**
   * Clear all highlight elements
   */
  clearAllHighlights() {
    // Remove highlight class from all elements that might have it
    const highlightedElements = document.querySelectorAll('.translate-it-element-highlighted');
    highlightedElements.forEach(element => {
      element.classList.remove('translate-it-element-highlighted');
    });
    
    this.currentHighlighted = null;
  }

  /**
   * Add global styles for select element mode
   */
  addGlobalStyles() {
    // Apply the CSS class that enables crosshair cursor and hover effects
    taggleLinks(true);

    // Verify the class was applied
    const hasClass = document.documentElement.classList.contains(
      UI_CONSTANTS.DISABLE_LINKS_CLASS
    );
    this.logger.debug("CSS class applied", hasClass);

    if (!hasClass) {
      this.logger.warn("CSS class failed to apply - trying manual application");
      document.documentElement.classList.add(UI_CONSTANTS.DISABLE_LINKS_CLASS);
    }
  }

  /**
   * Remove global styles
   */
  removeGlobalStyles() {
    // Remove the CSS class that disables crosshair cursor and hover effects
    taggleLinks(false);
  }

  /**
   * Disable page interactions during selection
   */
  disablePageInteractions() {
    document.body.classList.add(UI_CONSTANTS.CURSOR_CLASS);

    // Disable text selection
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
    document.body.style.msUserSelect = "none";
  }

  /**
   * Re-enable page interactions
   */
  enablePageInteractions() {
    document.body.classList.remove(UI_CONSTANTS.CURSOR_CLASS);

    // Re-enable text selection
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
    document.body.style.msUserSelect = "";
  }

  /**
   * Deactivate UI only (keep translation processing)
   */
  async deactivateUI() {
    // Clear all highlights
    this.clearAllHighlights();

    // Remove global styles
    this.removeGlobalStyles();

    // Re-enable page interactions
    this.enablePageInteractions();

    this.logger.debug("Select element UI deactivated");
  }

  /**
   * Check if element is valid for text extraction
   * @param {HTMLElement} element - Element to validate
   * @returns {boolean} Whether element is valid
   */
  isValidTextElement(element) {
    // Basic validation - should be implemented in TextExtractionService
    // This is a placeholder for basic UI validation
    const invalidTags = ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK"];
    if (invalidTags.includes(element.tagName)) return false;

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;

    return true;
  }

  /**
   * Check if text content is meaningful
   * @param {string} text - Text to validate
   * @returns {boolean} Whether text is valid
   */
  isValidTextContent(text) {
    if (!text || text.length === 0) return false;
    if (text.length < 20) return false; // Minimum length
    if (/^[\d\s\p{P}\p{S}]+$/u.test(text)) return false; // Skip pure numbers/symbols
    if (/^https?:\/\/|www\.|@.*\./.test(text)) return false; // Skip URLs and emails
    
    const words = text.trim().split(/\s+/);
    if (words.length === 1) {
      const word = words[0].toLowerCase();
      const commonUIWords = [
        'ok', 'cancel', 'yes', 'no', 'submit', 'reset', 'login', 'logout',
        'menu', 'home', 'back', 'next', 'prev', 'previous', 'continue',
        'skip', 'done', 'finish', 'close', 'open', 'save', 'edit', 'delete',
        'search', 'filter', 'sort', 'view', 'hide', 'show', 'toggle'
      ];
      if (commonUIWords.includes(word)) return false;
    }

    return words.length >= 3; // Minimum word count
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.clearHighlight();
    this.clearAllHighlights();
    this.removeGlobalStyles();
    this.enablePageInteractions();
    this.logger.debug('ElementHighlighter cleanup completed');
  }

  /**
   * Get debugging information
   * @returns {Object} Debug info
   */
  getDebugInfo() {
    return {
      currentHighlighted: this.currentHighlighted ? {
        tagName: this.currentHighlighted.tagName,
        className: this.currentHighlighted.className,
        id: this.currentHighlighted.id
      } : null,
      highlightedElementsCount: document.querySelectorAll('.translate-it-element-highlighted').length
    };
  }
}
