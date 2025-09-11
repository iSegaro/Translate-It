/**
 * Notion Handler - Handles text selection for Notion workspace
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { BaseSiteHandler } from "./base/BaseSiteHandler.js";
import { FieldTypes, SelectionMethods, SiteHandlerResult } from "../core/types.js";

export class NotionHandler extends BaseSiteHandler {
  constructor(hostname, config = {}) {
    const defaultConfig = {
      type: FieldTypes.PROFESSIONAL_EDITOR,
      selectionMethod: SelectionMethods.CONTENT_EDITABLE,
      selectors: [
        '[contenteditable="true"]',
        '.notion-text-block',
        '.notranslate',
        '[data-block-id]',
        '.notion-page-content'
      ],
      features: ['block-based-editing', 'collaborative', 'rich-text']
    };

    super(hostname, { ...defaultConfig, ...config });
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'NotionHandler');
  }

  async detectSelection(element, options = {}) {
    try {
      let selectedText = '';
      
      // Try Notion-specific selection methods
      selectedText = await this._getNotionSelection(element);
      
      // Fallback to standard methods
      if (!selectedText) {
        selectedText = this.getStandardSelection(element);
      }
      
      if (!selectedText) {
        selectedText = this.getContentEditableSelection(element);
      }

      this.logger.debug('Notion selection result:', {
        found: !!selectedText,
        length: selectedText.length,
        text: selectedText.substring(0, 50) + '...'
      });

      return new SiteHandlerResult({
        success: !!selectedText,
        text: selectedText,
        metadata: {
          method: 'notion-handler',
          hostname: this.hostname,
          element: element?.tagName,
          blockId: element?.getAttribute('data-block-id')
        }
      });

    } catch (error) {
      this.logger.error('Notion selection detection failed:', error);
      return new SiteHandlerResult({
        success: false,
        error: error.message
      });
    }
  }

  async calculatePosition(element, options = {}) {
    try {
      // Try Notion-specific position calculation
      let position = await this._calculateNotionPosition(element, options);
      
      // Fallback to standard position calculation
      if (!position || (position.x === 0 && position.y === 0)) {
        position = this.calculateStandardPosition(element, options);
      }

      this.logger.debug('Notion position calculated:', position);
      return position;

    } catch (error) {
      this.logger.error('Notion position calculation failed:', error);
      return this.calculateStandardPosition(element, options);
    }
  }

  /**
   * Get selection using Notion-specific methods
   * @param {Element} element - Context element
   * @returns {string} Selected text
   */
  async _getNotionSelection(element) {
    try {
      // Check for Notion block-based selection
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        const selectedText = selection.toString().trim();
        
        // Verify selection is within a Notion block
        if (element && this._isNotionBlock(element)) {
          return selectedText;
        }
        
        // Check if selection crosses Notion blocks
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const container = range.commonAncestorContainer;
          
          if (this._isWithinNotionContent(container)) {
            return selectedText;
          }
        }
      }

      // Check for text within specific Notion elements
      if (element && element.hasAttribute('contenteditable')) {
        const notionText = element.textContent?.trim();
        if (notionText && this._isNotionBlock(element)) {
          // If there's a selection within this contenteditable block
          if (selection && selection.toString().trim()) {
            return selection.toString().trim();
          }
        }
      }

      return '';
    } catch (error) {
      this.logger.debug('Notion-specific selection failed:', error);
      return '';
    }
  }

  /**
   * Calculate position for Notion interface
   * @param {Element} element - Context element
   * @param {Object} options - Position options
   * @returns {Object} Position coordinates
   */
  async _calculateNotionPosition(element, options) {
    try {
      const { sourceEvent } = options;
      
      // Use mouse event position if available
      if (sourceEvent && (sourceEvent.type === 'mouseup' || sourceEvent.type === 'click')) {
        return {
          x: sourceEvent.clientX,
          y: sourceEvent.clientY + 10 // Small offset for better visibility
        };
      }

      // Try to get selection range position within Notion blocks
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.right,
            y: rect.bottom + 5 // Small offset below selection
          };
        }
      }

      // Fallback to element position for Notion blocks
      if (element && this._isNotionBlock(element)) {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height
        };
      }

      return { x: 0, y: 0 };
    } catch (error) {
      this.logger.debug('Notion position calculation failed:', error);
      return { x: 0, y: 0 };
    }
  }

  /**
   * Check if element is a Notion block
   * @param {Element} element - Element to check
   * @returns {boolean} True if it's a Notion block
   */
  _isNotionBlock(element) {
    if (!element) return false;
    
    return !!(
      element.hasAttribute('data-block-id') ||
      element.classList.contains('notion-text-block') ||
      element.classList.contains('notranslate') ||
      element.closest('[data-block-id]')
    );
  }

  /**
   * Check if element is within Notion content area
   * @param {Element} element - Element to check
   * @returns {boolean} True if within Notion content
   */
  _isWithinNotionContent(element) {
    if (!element) return false;
    
    // Walk up the DOM to find Notion content indicators
    let current = element.nodeType === Node.TEXT_NODE ? element.parentElement : element;
    
    while (current && current !== document.body) {
      if (current.classList.contains('notion-page-content') ||
          current.classList.contains('notion-page-block') ||
          current.hasAttribute('data-block-id')) {
        return true;
      }
      current = current.parentElement;
    }
    
    return false;
  }
}