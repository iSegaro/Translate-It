/**
 * Abstract base class for site-specific selection handlers
 * Provides common interface and default implementations
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import {
  SiteConfig
} from "../../core/types.js";

export class BaseSiteHandler {
  constructor(hostname, config = {}) {
    this.hostname = hostname;
    this.config = new SiteConfig(config);
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, `SiteHandler:${this.constructor.name}`);
    this._cache = new Map();
  }

  /**
   * Get site configuration
   * @returns {SiteConfig} Site configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Check if this handler can handle the current site
   * @param {string} hostname - Current hostname
   * @returns {boolean} True if can handle
   */
  canHandle(hostname) {
    return hostname === this.hostname || 
           hostname.endsWith('.' + this.hostname) || 
           hostname.includes(this.hostname);
  }

  /**
   * Detect selected text (Abstract method - must be implemented by subclasses)
   * @param {Element} element - Target element
   * @param {Object} options - Detection options
   * @returns {Promise<SiteHandlerResult>} Selection result
   */
  async detectSelection() {
    throw new Error('detectSelection() must be implemented by subclass');
  }

  /**
   * Calculate position for selection icon (Abstract method - must be implemented by subclasses)
   * @param {Element} element - Target element  
   * @param {Object} options - Position calculation options
   * @returns {Promise<{x: number, y: number}>} Position coordinates
   */
  async calculatePosition() {
    throw new Error('calculatePosition() must be implemented by subclass');
  }

  /**
   * Configure handler for specific site requirements (Optional override)
   * @param {Object} config - Additional configuration
   * @returns {Promise<void>}
   */
  async configure(config = {}) {
    // Default implementation - can be overridden
    Object.assign(this.config, config);
  }

  /**
   * Default selection detection using standard methods
   * @param {Element} element - Target element
   * @returns {string} Selected text
   */
  getStandardSelection() {
    try {
      // Try window.getSelection()
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        this.logger.debug('Selection found via getSelection');
        return selection.toString().trim();
      }

      // Try document.getSelection()
      const docSelection = document.getSelection();
      if (docSelection && docSelection.toString().trim()) {
        this.logger.debug('Selection found via document.getSelection');
        return docSelection.toString().trim();
      }
    } catch (error) {
      this.logger.debug('Standard selection failed:', error);
    }
    return '';
  }

  /**
   * Input/textarea selection detection
   * @param {Element} element - Target element
   * @returns {string} Selected text
   */
  getInputSelection(element = null) {
    try {
      const targetElement = element || document.activeElement;
      if (!targetElement || !['INPUT', 'TEXTAREA'].includes(targetElement.tagName)) {
        return '';
      }

      const { value, selectionStart, selectionEnd } = targetElement;
      
      if (selectionStart !== selectionEnd && value && 
          selectionStart !== null && selectionEnd !== null) {
        const selectedText = value.substring(selectionStart, selectionEnd).trim();
        if (selectedText) {
          this.logger.debug('Selection found via input selection range');
          return selectedText;
        }
      }
    } catch (error) {
      this.logger.debug('Input selection failed:', error);
    }
    return '';
  }

  /**
   * ContentEditable selection detection
   * @param {Element} element - Target element
   * @returns {string} Selected text
   */
  getContentEditableSelection(element = null) {
    try {
      const targetElement = element || document.activeElement;
      if (!targetElement) return '';
      
      if (targetElement.contentEditable === 'true') {
        const selection = targetElement.ownerDocument.getSelection();
        if (selection && selection.toString().trim()) {
          this.logger.debug('Selection found via contentEditable');
          return selection.toString().trim();
        }
      }
    } catch (error) {
      this.logger.debug('ContentEditable selection failed:', error);
    }
    return '';
  }

  /**
   * Calculate standard position based on selection range
   * @param {Element} element - Target element
   * @param {Object} options - Position options
   * @returns {Object} Position coordinates
   */
  calculateStandardPosition(element, options = {}) {
    const { sourceEvent } = options;

    try {
      // Use sourceEvent coordinates if available (for double-click)
      if (sourceEvent && sourceEvent.clientX && sourceEvent.clientY) {
        return {
          x: sourceEvent.clientX + window.scrollX,
          y: sourceEvent.clientY + window.scrollY + 25 // Offset below click
        };
      }

      // Use selection range if available
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.left + window.scrollX,
            y: rect.bottom + window.scrollY + 5 // Small offset below selection
          };
        }
      }

      // Fallback to element position
      if (element) {
        const elementRect = element.getBoundingClientRect();
        return {
          x: elementRect.left + window.scrollX + 10,
          y: elementRect.top + window.scrollY + 10
        };
      }

    } catch (error) {
      this.logger.debug('Standard position calculation failed:', error);
    }

    return { x: 0, y: 0 };
  }

  /**
   * Cache management
   */
  getCached(key) {
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.timestamp < 1000) { // 1 second cache
      return cached.value;
    }
    return null;
  }

  setCached(key, value) {
    this._cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this._cache.clear();
  }

  /**
   * Cleanup handler resources
   */
  cleanup() {
    this.clearCache();
    this.logger.debug(`${this.constructor.name} cleaned up`);
  }

  /**
   * Get handler status for debugging
   */
  getStatus() {
    return {
      hostname: this.hostname,
      handlerName: this.constructor.name,
      config: this.config,
      cacheSize: this._cache.size
    };
  }
}