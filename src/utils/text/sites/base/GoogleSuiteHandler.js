/**
 * Google Suite Handler - Specialized handler for Google Docs, Slides, Sites
 * Handles iframe-based selection and Google's complex DOM structure
 */

import { BaseSiteHandler } from "./BaseSiteHandler.js";
import { SiteHandlerResult, FieldTypes } from "../../core/types.js";

export class GoogleSuiteHandler extends BaseSiteHandler {
  constructor(hostname, config = {}) {
    const defaultConfig = {
      type: FieldTypes.PROFESSIONAL_EDITOR,
      selectionMethod: 'iframe-based',
      selectors: ['[contenteditable="true"]', '.kix-page', '.kix-page-paginated', '[role="document"]'],
      features: ['rich-formatting', 'collaboration'],
      selectionStrategy: 'double-click-required',
      selectionEventStrategy: 'mouse-based'
    };

    super(hostname, { ...defaultConfig, ...config });
  }

  /**
   * Detect selected text in Google Suite applications
   * @param {Element} element - Target element
   * @param {Object} options - Detection options
   * @returns {Promise<SiteHandlerResult>} Selection result
   */
  async detectSelection(element, options = {}) {
    try {
      let selectedText = '';

      // Strategy 1: Try iframe selection first (most common in Google Docs)
      selectedText = this.getIframeSelection();
      
      if (!selectedText) {
        // Strategy 2: Try active element selection
        selectedText = this.getContentEditableSelection(element);
      }

      if (!selectedText) {
        // Strategy 3: Standard selection
        selectedText = this.getStandardSelection(element);
      }

      return new SiteHandlerResult({
        success: !!selectedText,
        text: selectedText,
        metadata: { 
          method: 'google-suite',
          element: element?.tagName,
          hostname: this.hostname
        }
      });

    } catch (error) {
      this.logger.error('Google Suite selection detection failed:', error);
      return new SiteHandlerResult({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Calculate position for Google Suite selection icon
   * @param {Element} element - Target element
   * @param {Object} options - Position calculation options
   * @returns {Promise<{x: number, y: number}>} Position coordinates
   */
  async calculatePosition(element, options = {}) {
    try {
      // Use standard position calculation
      const position = this.calculateStandardPosition(element, options);
      
      // Google Docs specific adjustments
      if (this.hostname === 'docs.google.com') {
        // Add extra offset for Google Docs toolbar
        position.y += 10;
      }

      return position;
    } catch (error) {
      this.logger.error('Google Suite position calculation failed:', error);
      return { x: 0, y: 0 };
    }
  }

  /**
   * Iframe-based selection detection for Google Docs
   * @returns {string} Selected text
   */
  getIframeSelection() {
    try {
      // Check all iframes for selection
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument;
          if (iframeDoc) {
            const iframeSelection = iframeDoc.getSelection();
            if (iframeSelection && iframeSelection.toString().trim()) {
              this.logger.debug('Selection found via iframe');
              return iframeSelection.toString().trim();
            }
          }
        } catch (e) {
          // Cross-origin iframe, continue
        }
      }
    } catch (error) {
      this.logger.debug('Iframe selection failed:', error);
    }
    return '';
  }

  /**
   * Check if current page is Google Suite
   * @returns {boolean} True if on Google Suite
   */
  static isGoogleSuite() {
    const hostname = window.location.hostname;
    return hostname.includes('docs.google.com') || 
           hostname.includes('slides.google.com') || 
           hostname.includes('sites.google.com');
  }
}