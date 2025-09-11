/**
 * Modern Selection Detector - Delegates to site-specific handlers
 * Uses modular site handlers for context-aware text selection detection
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { siteHandlerRegistry } from "../registry/SiteHandlerRegistry.js";
import { SiteHandlerResult, SelectionDetectionOptions } from "./types.js";

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectionDetector');

/**
 * Modern SelectionDetector class with site handler integration
 */
export class SelectionDetector {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectionDetector');
    this._cache = new WeakMap();
    this._initialized = false;
  }

  /**
   * Initialize selection detector
   */
  async initialize() {
    if (this._initialized) return;
    
    try {
      await siteHandlerRegistry.initialize();
      this._initialized = true;
      this.logger.debug('SelectionDetector initialized with site handlers');
    } catch (error) {
      this.logger.error('Failed to initialize SelectionDetector:', error);
      throw error;
    }
  }

  /**
   * Detect selected text using appropriate site handler
   * @param {Element} element - Context element
   * @param {Object} options - Detection options
   * @returns {Promise<string>} Selected text
   */
  async detect(element = null, options = {}) {
    if (!this._initialized) {
      await this.initialize();
    }

    const detectionOptions = new SelectionDetectionOptions({
      element,
      ...options
    });

    const { forceRefresh = false } = detectionOptions;
    
    // Use cache if available and not forcing refresh
    if (!forceRefresh && element && this._cache.has(element)) {
      const cached = this._cache.get(element);
      if (cached && Date.now() - cached.timestamp < 1000) { // 1 second cache
        return cached.text;
      }
    }
    
    let selectedText = '';
    
    try {
      // Get appropriate site handler
      this.logger.debug('About to get site handler for selection');
      const handler = await siteHandlerRegistry.getCurrentHandler();
      
      this.logger.debug('Using selection handler:', {
        handler: handler.constructor.name,
        element: element?.tagName,
        hostname: window.location.hostname,
        isDefaultHandler: handler.constructor.name === 'DefaultSiteHandler'
      });
      
      // Delegate selection detection to site handler
      const result = await handler.detectSelection(element, detectionOptions);
      
      if (result && result.success) {
        selectedText = result.text;
        
        this.logger.debug('Selection found via handler:', {
          handler: handler.constructor.name,
          text: selectedText.substring(0, 30) + '...',
          length: selectedText.length,
          metadata: result.metadata
        });
      }
      
      // Cache result
      if (element && selectedText) {
        this._cache.set(element, {
          text: selectedText,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      this.logger.error('Selection detection failed:', error);
      
      // Fallback to basic selection detection
      selectedText = await this._fallbackDetection(element);
    }
    
    return selectedText;
  }

  /**
   * Detect with retry mechanism for complex editors
   * @param {Element} element - Context element
   * @param {Object} options - Detection options
   * @returns {Promise<string>} Selected text
   */
  async detectWithRetry(element, options = {}) {
    if (!this._initialized) {
      await this.initialize();
    }

    const detectionOptions = new SelectionDetectionOptions({
      element,
      maxAttempts: 3,
      delay: 100,
      increasingDelay: true,
      ...options
    });

    const { maxAttempts, delay, increasingDelay } = detectionOptions;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const selectedText = await this.detect(element, { forceRefresh: true });
      
      if (selectedText) {
        this.logger.debug(`Selection found on attempt ${attempt}`);
        return selectedText;
      }
      
      if (attempt < maxAttempts) {
        const waitTime = increasingDelay ? delay * attempt : delay;
        this.logger.debug(`Retrying selection detection in ${waitTime}ms (attempt ${attempt}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    this.logger.debug(`No selection found after ${maxAttempts} attempts`);
    return '';
  }

  /**
   * Calculate position for selection icon using site handler
   * @param {Element} element - Context element
   * @param {Object} options - Position calculation options
   * @returns {Promise<{x: number, y: number}>} Position coordinates
   */
  async calculatePosition(element, options = {}) {
    if (!this._initialized) {
      await this.initialize();
    }

    try {
      // Get appropriate site handler
      const handler = await siteHandlerRegistry.getCurrentHandler();
      
      // Delegate position calculation to site handler
      const position = await handler.calculatePosition(element, options);
      
      this.logger.debug('Position calculated via handler:', {
        handler: handler.constructor.name,
        position,
        element: element?.tagName
      });
      
      return position;
      
    } catch (error) {
      this.logger.error('Position calculation failed:', error);
      return { x: 0, y: 0 };
    }
  }

  /**
   * Fallback detection using basic methods
   * @param {Element} element - Context element
   * @returns {Promise<string>} Selected text
   */
  async _fallbackDetection(element) {
    try {
      // Try basic selection methods
      let text = '';
      
      // Standard getSelection
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        text = selection.toString().trim();
        this.logger.debug('Fallback: Selection found via getSelection');
        return text;
      }

      // Document getSelection  
      const docSelection = document.getSelection();
      if (docSelection && docSelection.toString().trim()) {
        text = docSelection.toString().trim();
        this.logger.debug('Fallback: Selection found via document.getSelection');
        return text;
      }

      // Input/textarea selection
      if (element && ['INPUT', 'TEXTAREA'].includes(element.tagName)) {
        const { value, selectionStart, selectionEnd } = element;
        if (selectionStart !== selectionEnd && value) {
          text = value.substring(selectionStart, selectionEnd).trim();
          if (text) {
            this.logger.debug('Fallback: Selection found via input selection');
            return text;
          }
        }
      }

    } catch (error) {
      this.logger.debug('Fallback detection failed:', error);
    }
    
    return '';
  }

  /**
   * Get current site handler
   * @returns {Promise<BaseSiteHandler>} Current handler
   */
  async getCurrentHandler() {
    if (!this._initialized) {
      await this.initialize();
    }
    
    return await siteHandlerRegistry.getCurrentHandler();
  }

  /**
   * Clear detection cache
   */
  clearCache() {
    this._cache = new WeakMap();
    this.logger.debug('Selection detection cache cleared');
  }

  /**
   * Get selection detector statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      initialized: this._initialized,
      cacheSize: 'N/A (WeakMap)',
      siteHandlerStats: siteHandlerRegistry.getStats(),
      currentHostname: window.location.hostname
    };
  }

  /**
   * Cleanup selection detector
   */
  cleanup() {
    this.clearCache();
    this._initialized = false;
    this.logger.debug('SelectionDetector cleaned up');
  }
}

// Export singleton instance
export const selectionDetector = new SelectionDetector();