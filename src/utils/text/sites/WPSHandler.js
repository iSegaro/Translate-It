/**
 * WPS Office Handler - Handles text selection for WPS Office online
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { BaseSiteHandler } from "./base/BaseSiteHandler.js";
import { FieldTypes, SelectionMethods, SiteHandlerResult } from "../core/types.js";

export class WPSHandler extends BaseSiteHandler {
  constructor(hostname, config = {}) {
    const defaultConfig = {
      type: FieldTypes.PROFESSIONAL_EDITOR,
      selectionMethod: SelectionMethods.INPUT_BASED,
      selectors: ['input', 'textarea', '[contenteditable="true"]', '.wps-editor'],
      features: ['office-suite', 'cloud-sync']
    };

    super(hostname, { ...defaultConfig, ...config });
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'WPSHandler');
  }

  async detectSelection(element, options = {}) {
    try {
      let selectedText = '';
      
      // Try WPS-specific selection methods
      selectedText = await this._getWPSSelection(element);
      
      // Fallback to standard methods
      if (!selectedText) {
        selectedText = this.getStandardSelection(element);
      }
      
      if (!selectedText) {
        selectedText = this.getInputSelection(element);
      }
      
      if (!selectedText) {
        selectedText = this.getContentEditableSelection(element);
      }

      this.logger.debug('WPS selection result:', {
        found: !!selectedText,
        length: selectedText.length,
        text: selectedText.substring(0, 50) + '...'
      });

      return new SiteHandlerResult({
        success: !!selectedText,
        text: selectedText,
        metadata: {
          method: 'wps-handler',
          hostname: this.hostname,
          element: element?.tagName
        }
      });

    } catch (error) {
      this.logger.error('WPS selection detection failed:', error);
      return new SiteHandlerResult({
        success: false,
        error: error.message
      });
    }
  }

  async calculatePosition(element, options = {}) {
    try {
      // Try WPS-specific position calculation
      let position = await this._calculateWPSPosition(element, options);
      
      // Fallback to standard position calculation
      if (!position || (position.x === 0 && position.y === 0)) {
        position = this.calculateStandardPosition(element, options);
      }

      this.logger.debug('WPS position calculated:', position);
      return position;

    } catch (error) {
      this.logger.error('WPS position calculation failed:', error);
      return this.calculateStandardPosition(element, options);
    }
  }

  /**
   * Get selection using WPS-specific methods
   * @param {Element} element - Context element
   * @returns {string} Selected text
   */
  async _getWPSSelection(element) {
    try {
      // Check for WPS-specific editor containers
      const wpsEditor = document.querySelector('.wps-editor, .wps-document-editor');
      if (wpsEditor) {
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
          return selection.toString().trim();
        }
      }

      // Check for WPS input elements
      if (element && element.classList.contains('wps-input')) {
        const { value, selectionStart, selectionEnd } = element;
        if (selectionStart !== selectionEnd && value) {
          return value.substring(selectionStart, selectionEnd).trim();
        }
      }

      return '';
    } catch (error) {
      this.logger.debug('WPS-specific selection failed:', error);
      return '';
    }
  }

  /**
   * Calculate position for WPS Office interface
   * @param {Element} element - Context element
   * @param {Object} options - Position options
   * @returns {Object} Position coordinates
   */
  async _calculateWPSPosition(element, options) {
    try {
      const { sourceEvent } = options;
      
      if (sourceEvent && (sourceEvent.type === 'mouseup' || sourceEvent.type === 'click')) {
        return {
          x: sourceEvent.clientX,
          y: sourceEvent.clientY
        };
      }

      // Try to get selection range position
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.right,
            y: rect.top
          };
        }
      }

      return { x: 0, y: 0 };
    } catch (error) {
      this.logger.debug('WPS position calculation failed:', error);
      return { x: 0, y: 0 };
    }
  }
}