/**
 * Zoho Writer Handler - Specialized handler for writer.zoho.com
 * Handles transparent selection issues and complex DOM structure
 */

import { BaseSiteHandler } from "./base/BaseSiteHandler.js";
import { SiteHandlerResult, FieldTypes, SelectionMethods } from "../core/types.js";

export class ZohoWriterHandler extends BaseSiteHandler {
  constructor(hostname, config = {}) {
    const defaultConfig = {
      type: FieldTypes.PROFESSIONAL_EDITOR,
      selectionMethod: 'zoho-writer',
      selectors: ['.zw-line-div', '.zw-text-portion', '#editorpane'],
      features: ['office-suite', 'cloud-sync', 'transparent-selection'],
      selectionStrategy: 'double-click-required',
      selectionEventStrategy: 'mouse-based',
      customHandler: 'zoho-writer'
    };

    super(hostname, { ...defaultConfig, ...config });
  }

  /**
   * Detect selected text in Zoho Writer with transparent selection workaround
   * @param {Element} element - Target element
   * @param {Object} options - Detection options
   * @returns {Promise<SiteHandlerResult>} Selection result
   */
  async detectSelection(element, options = {}) {
    try {
      // Strategy 1: Temporarily enable selection visibility and try standard methods
      const originalStyle = this.enableSelectionVisibility();
      
      let selectedText = '';
      
      // Try standard selection methods with enabled visibility
      selectedText = this.getStandardSelection(element);
      
      // If still no selection, try to extract from Zoho's internal state
      if (!selectedText) {
        selectedText = this.extractFromZohoStructure();
      }
      
      // Restore original selection transparency
      this.restoreSelectionTransparency(originalStyle);
      
      return new SiteHandlerResult({
        success: !!selectedText,
        text: selectedText,
        metadata: { 
          method: 'zoho-writer',
          element: element?.tagName,
          strategy: selectedText ? 'css-injection' : 'dom-extraction'
        }
      });

    } catch (error) {
      this.logger.error('Zoho Writer selection detection failed:', error);
      return new SiteHandlerResult({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Calculate position for Zoho Writer selection icon
   * @param {Element} element - Target element
   * @param {Object} options - Position calculation options
   * @returns {Promise<{x: number, y: number}>} Position coordinates
   */
  async calculatePosition(element, options = {}) {
    const { sourceEvent } = options;

    try {
      // Strategy 1: Use sourceEvent coordinates if available
      if (sourceEvent && sourceEvent.clientX && sourceEvent.clientY) {
        return {
          x: sourceEvent.clientX + window.scrollX,
          y: sourceEvent.clientY + window.scrollY + 25 // Offset below click
        };
      }

      // Strategy 2: Find cursor position in Zoho editor
      const cursorPosition = this.findCursorPosition();
      if (cursorPosition) {
        return cursorPosition;
      }

      // Strategy 3: Find selected text portion
      const textPortionPosition = this.findSelectedTextPortionPosition();
      if (textPortionPosition) {
        return textPortionPosition;
      }

      // Strategy 4: Use editor pane center as fallback
      const editorPosition = this.getEditorPanePosition();
      if (editorPosition) {
        return editorPosition;
      }

      this.logger.debug('All Zoho Writer position strategies failed');
      return { x: 0, y: 0 };
      
    } catch (error) {
      this.logger.error('Zoho Writer position calculation failed:', error);
      return { x: 0, y: 0 };
    }
  }

  /**
   * Temporarily enable selection visibility in Zoho Writer
   * @returns {HTMLStyleElement} Style element to restore later
   */
  enableSelectionVisibility() {
    try {
      const style = document.createElement('style');
      style.id = 'zoho-selection-enabler-' + Date.now();
      style.textContent = `
        div#editorpane span::selection { background: rgba(0, 123, 255, 0.3) !important; }
        div#editorpane span::-moz-selection { background: rgba(0, 123, 255, 0.3) !important; }
        .zw-line-div::selection, .zw-line-content::selection, 
        .zw-contentpane::selection, .zw-page::selection,
        .zw-column::selection, .zw-column-container::selection {
          background: rgba(0, 123, 255, 0.3) !important;
        }
        .zw-line-div::-moz-selection, .zw-line-content::-moz-selection,
        .zw-contentpane::-moz-selection, .zw-page::-moz-selection,
        .zw-column::-moz-selection, .zw-column-container::-moz-selection {
          background: rgba(0, 123, 255, 0.3) !important;
        }
      `;
      document.head.appendChild(style);
      
      this.logger.debug('Zoho selection visibility enabled');
      return style;
    } catch (error) {
      this.logger.debug('Failed to enable Zoho selection visibility:', error);
      return null;
    }
  }

  /**
   * Restore original selection transparency in Zoho Writer
   * @param {HTMLStyleElement} styleElement - Style element to remove
   */
  restoreSelectionTransparency(styleElement) {
    try {
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
        this.logger.debug('Zoho selection transparency restored');
      }
    } catch (error) {
      this.logger.debug('Failed to restore Zoho selection transparency:', error);
    }
  }

  /**
   * Extract selected text from Zoho Writer's internal structure
   * @returns {string} Selected text
   */
  extractFromZohoStructure() {
    try {
      const editorPane = document.getElementById('editorpane');
      if (!editorPane) return '';
      
      // Look for cursor or selection indicators
      const cursor = editorPane.querySelector('.cursor');
      if (cursor) {
        const lineDiv = cursor.closest('.zw-line-div');
        if (lineDiv) {
          const textPortions = lineDiv.querySelectorAll('.zw-text-portion');
          for (const portion of textPortions) {
            const text = portion.textContent?.trim();
            if (text && text.length > 2) {
              this.logger.debug('Extracted text from cursor context:', text.substring(0, 30));
              return text;
            }
          }
        }
      }
      
      // Fallback: try to get any visible text portions that might be selected
      const textPortions = editorPane.querySelectorAll('.zw-text-portion');
      for (const portion of textPortions) {
        const text = portion.textContent?.trim();
        if (text && text.length > 2) {
          // Simple heuristic: if text contains common word patterns, it might be selected
          const selection = window.getSelection();
          if (selection && selection.containsNode && selection.containsNode(portion, true)) {
            this.logger.debug('Found selected text portion:', text.substring(0, 30));
            return text;
          }
        }
      }
      
    } catch (error) {
      this.logger.debug('extractFromZohoStructure failed:', error);
    }
    return '';
  }

  /**
   * Find cursor position in Zoho editor
   * @returns {Object|null} Position coordinates or null
   */
  findCursorPosition() {
    try {
      const editorPane = document.getElementById('editorpane');
      if (!editorPane) return null;

      const cursor = editorPane.querySelector('.cursor');
      if (cursor) {
        const cursorRect = cursor.getBoundingClientRect();
        if (cursorRect.width > 0 || cursorRect.height > 0) {
          return {
            x: cursorRect.left + window.scrollX + 10,
            y: cursorRect.bottom + window.scrollY + 5
          };
        }
      }
    } catch (error) {
      this.logger.debug('findCursorPosition failed:', error);
    }
    return null;
  }

  /**
   * Find position of selected text portion
   * @returns {Object|null} Position coordinates or null
   */
  findSelectedTextPortionPosition() {
    try {
      const editorPane = document.getElementById('editorpane');
      if (!editorPane) return null;

      const textPortions = editorPane.querySelectorAll('.zw-text-portion');
      for (const portion of textPortions) {
        const selection = window.getSelection();
        if (selection && selection.containsNode && selection.containsNode(portion, true)) {
          const portionRect = portion.getBoundingClientRect();
          if (portionRect.width > 0 || portionRect.height > 0) {
            return {
              x: portionRect.left + window.scrollX,
              y: portionRect.bottom + window.scrollY + 5
            };
          }
        }
      }
    } catch (error) {
      this.logger.debug('findSelectedTextPortionPosition failed:', error);
    }
    return null;
  }

  /**
   * Get editor pane center position as fallback
   * @returns {Object|null} Position coordinates or null
   */
  getEditorPanePosition() {
    try {
      const editorPane = document.getElementById('editorpane');
      if (editorPane) {
        const editorRect = editorPane.getBoundingClientRect();
        if (editorRect.width > 0 && editorRect.height > 0) {
          return {
            x: editorRect.left + window.scrollX + 100,
            y: editorRect.top + window.scrollY + 100
          };
        }
      }
    } catch (error) {
      this.logger.debug('getEditorPanePosition failed:', error);
    }
    return null;
  }

  /**
   * Check if current page is Zoho Writer
   * @returns {boolean} True if on Zoho Writer
   */
  static isZohoWriter() {
    return window.location.hostname.includes('writer.zoho.com');
  }

  /**
   * Get handler-specific status
   * @returns {Object} Handler status
   */
  getStatus() {
    const baseStatus = super.getStatus();
    return {
      ...baseStatus,
      isZohoWriter: ZohoWriterHandler.isZohoWriter(),
      editorPaneExists: !!document.getElementById('editorpane'),
      cursorExists: !!document.querySelector('#editorpane .cursor'),
      textPortionCount: document.querySelectorAll('#editorpane .zw-text-portion').length
    };
  }
}