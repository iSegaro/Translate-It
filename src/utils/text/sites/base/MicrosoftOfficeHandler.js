/**
 * Microsoft Office Handler - Specialized handler for Office 365 applications
 * Handles different Office variants and their specific DOM structures
 */

import { BaseSiteHandler } from "./BaseSiteHandler.js";
import { SiteHandlerResult, FieldTypes } from "../../core/types.js";

export class MicrosoftOfficeHandler extends BaseSiteHandler {
  constructor(hostname, config = {}) {
    const defaultConfig = {
      type: FieldTypes.PROFESSIONAL_EDITOR,
      selectionMethod: 'content-editable',
      selectors: ['.NormalTextRun', '[contenteditable="true"]', 'span[class*="SCXW"]'],
      features: ['office-suite', 'cloud-sync'],
      selectionStrategy: 'double-click-required',
      selectionEventStrategy: 'mouse-based'
    };

    super(hostname, { ...defaultConfig, ...config });
  }

  /**
   * Detect selected text in Microsoft Office applications
   * @param {Element} element - Target element
   * @param {Object} options - Detection options
   * @returns {Promise<SiteHandlerResult>} Selection result
   */
  async detectSelection(element, options = {}) {
    try {
      let selectedText = '';

      // Strategy 1: Try ContentEditable selection (most common in Word Online)
      selectedText = this.getContentEditableSelection(element);
      
      if (!selectedText) {
        // Strategy 2: Standard selection
        selectedText = this.getStandardSelection(element);
      }

      if (!selectedText) {
        // Strategy 3: Try iframe selection for some Office variants
        selectedText = this.getIframeSelection();
      }

      return new SiteHandlerResult({
        success: !!selectedText,
        text: selectedText,
        metadata: { 
          method: 'microsoft-office',
          element: element?.tagName,
          hostname: this.hostname
        }
      });

    } catch (error) {
      this.logger.error('Microsoft Office selection detection failed:', error);
      return new SiteHandlerResult({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Calculate position for Microsoft Office selection icon
   * @param {Element} element - Target element
   * @param {Object} options - Position calculation options
   * @returns {Promise<{x: number, y: number}>} Position coordinates
   */
  async calculatePosition(element, options = {}) {
    try {
      const position = this.calculateStandardPosition(element, options);
      return position;
    } catch (error) {
      this.logger.error('Microsoft Office position calculation failed:', error);
      return { x: 0, y: 0 };
    }
  }

  /**
   * Iframe-based selection detection for some Office variants
   * @returns {string} Selected text
   */
  getIframeSelection() {
    try {
      // Check all iframes for selection (similar to Google Docs)
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
   * Check if current page is Microsoft Office
   * @returns {boolean} True if on Microsoft Office
   */
  static isMicrosoftOffice() {
    const hostname = window.location.hostname;
    return hostname.includes('office.live.com') || 
           hostname.includes('officeapps.live.com') || 
           hostname.includes('word-edit.officeapps.live.com') ||
           hostname.includes('office.com');
  }
}