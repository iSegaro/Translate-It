/**
 * Smart Selection Detector - Context-aware text selection detection
 * Uses field type classification to determine optimal selection method
 */

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { fieldDetector, FieldTypes } from "./FieldDetector.js";

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectionDetector');

/**
 * Selection strategies for different field types and contexts
 */
const SelectionStrategies = {
  // Standard selection for regular fields
  standard: {
    priority: 1,
    methods: ['getSelection', 'documentSelection']
  },
  
  // Input field selection using selectionStart/End
  'input-selection': {
    priority: 2,
    methods: ['inputSelectionRange', 'getSelection', 'documentSelection']
  },
  
  // ContentEditable focused selection
  'content-editable': {
    priority: 3,
    methods: ['getSelection', 'activeElementSelection', 'documentSelection']
  },
  
  // Professional editors with complex structures
  'iframe-based': {
    priority: 4,
    methods: ['iframeSelection', 'getSelection', 'activeElementSelection', 'documentSelection']
  },
  
  // Fallback for input-based professional editors
  'input-based': {
    priority: 5,
    methods: ['inputSelectionRange', 'activeElementSelection', 'getSelection', 'wordAroundCursor']
  }
};

/**
 * Selection method implementations
 */
class SelectionMethods {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectionMethods');
  }
  
  /**
   * Standard window.getSelection()
   * @returns {string} Selected text
   */
  getSelection() {
    try {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        this.logger.debug('Selection found via getSelection');
        return selection.toString().trim();
      }
    } catch (error) {
      this.logger.debug('getSelection failed:', error);
    }
    return '';
  }
  
  /**
   * Document.getSelection() for fallback
   * @returns {string} Selected text
   */
  documentSelection() {
    try {
      const selection = document.getSelection();
      if (selection && selection.toString().trim()) {
        this.logger.debug('Selection found via document.getSelection');
        return selection.toString().trim();
      }
    } catch (error) {
      this.logger.debug('documentSelection failed:', error);
    }
    return '';
  }
  
  /**
   * INPUT/TEXTAREA selection using selectionStart/End
   * @param {Element} [element] - Target element
   * @returns {string} Selected text
   */
  inputSelectionRange(element = null) {
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
          this.logger.debug('Selection found via input selection range', {
            text: selectedText.substring(0, 30) + '...',
            start: selectionStart,
            end: selectionEnd
          });
          return selectedText;
        }
      }
    } catch (error) {
      this.logger.debug('inputSelectionRange failed:', error);
    }
    return '';
  }
  
  /**
   * Active element focused selection
   * @param {Element} [element] - Target element
   * @returns {string} Selected text
   */
  activeElementSelection(element = null) {
    try {
      const targetElement = element || document.activeElement;
      if (!targetElement) return '';
      
      if (targetElement.contentEditable === 'true') {
        const selection = targetElement.ownerDocument.getSelection();
        if (selection && selection.toString().trim()) {
          this.logger.debug('Selection found via active element (contentEditable)');
          return selection.toString().trim();
        }
      }
    } catch (error) {
      this.logger.debug('activeElementSelection failed:', error);
    }
    return '';
  }
  
  /**
   * Iframe-based selection (for Google Docs, etc.)
   * @returns {string} Selected text
   */
  iframeSelection() {
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
      this.logger.debug('iframeSelection failed:', error);
    }
    return '';
  }
  
  /**
   * Find word around cursor position as fallback
   * @param {Element} [element] - Target element
   * @returns {string} Word around cursor
   */
  wordAroundCursor(element = null) {
    try {
      const targetElement = element || document.activeElement;
      if (!targetElement || targetElement.tagName !== 'INPUT') {
        return '';
      }
      
      const { value, selectionStart } = targetElement;
      if (!value || selectionStart === null) return '';
      
      // Find word boundaries around cursor
      let start = selectionStart;
      let end = selectionStart;
      
      // Move start backwards to find word start
      while (start > 0 && /\w/.test(value[start - 1])) {
        start--;
      }
      
      // Move end forwards to find word end
      while (end < value.length && /\w/.test(value[end])) {
        end++;
      }
      
      const word = value.substring(start, end).trim();
      if (word && word.length > 1) {
        this.logger.debug('Selection found via word around cursor', {
          word,
          position: selectionStart
        });
        return word;
      }
    } catch (error) {
      this.logger.debug('wordAroundCursor failed:', error);
    }
    return '';
  }
  
  /**
   * Advanced selection for professional editors
   * @param {Element} element - Target element
   * @returns {string} Selected text
   */
  professionalEditorSelection(element) {
    try {
      const fieldType = fieldDetector.detect(element).fieldType;
      const siteConfig = fieldDetector.detect(element).siteConfig;
      
      // Site-specific selection strategies
      const hostname = window.location.hostname;
      
      if (hostname.includes('wps.com')) {
        return this.wpsSpecificSelection(element);
      }
      
      if (hostname.includes('docs.google.com')) {
        return this.googleDocsSelection(element);
      }
      
      // Generic professional editor selection
      return this.genericProfessionalSelection(element);
      
    } catch (error) {
      this.logger.debug('professionalEditorSelection failed:', error);
    }
    return '';
  }
  
  /**
   * WPS-specific selection detection
   * @param {Element} element - Target element
   * @returns {string} Selected text
   */
  wpsSpecificSelection(element) {
    // Try input selection first
    let text = this.inputSelectionRange(element);
    if (text) return text;
    
    // Try active element selection
    text = this.activeElementSelection(element);
    if (text) return text;
    
    // Try document selection
    text = this.getSelection();
    if (text) return text;
    
    // Fallback to word around cursor
    return this.wordAroundCursor(element);
  }
  
  /**
   * Google Docs specific selection
   * @param {Element} element - Target element
   * @returns {string} Selected text
   */
  googleDocsSelection(element) {
    // Try iframe selection first
    let text = this.iframeSelection();
    if (text) return text;
    
    // Try active element selection
    text = this.activeElementSelection(element);
    if (text) return text;
    
    // Try standard selection
    return this.getSelection();
  }
  
  /**
   * Generic professional editor selection
   * @param {Element} element - Target element
   * @returns {string} Selected text
   */
  genericProfessionalSelection(element) {
    // Try active element first
    let text = this.activeElementSelection(element);
    if (text) return text;
    
    // Try standard selection
    text = this.getSelection();
    if (text) return text;
    
    // Try iframe if available
    return this.iframeSelection();
  }
}

/**
 * Main selection detector class
 */
export class SelectionDetector {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'SelectionDetector');
    this.methods = new SelectionMethods();
    this.cache = new WeakMap();
  }
  
  /**
   * Detect selected text based on element context
   * @param {Element} [element] - Context element
   * @param {Object} [options] - Detection options
   * @returns {string} Selected text
   */
  detect(element = null, options = {}) {
    const targetElement = element || document.activeElement;
    const { forceRefresh = false } = options;
    
    // Use cache if available and not forcing refresh
    if (!forceRefresh && targetElement && this.cache.has(targetElement)) {
      const cached = this.cache.get(targetElement);
      if (cached && Date.now() - cached.timestamp < 1000) { // 1 second cache
        return cached.text;
      }
    }
    
    let selectedText = '';
    
    try {
      if (targetElement) {
        const detection = fieldDetector.detect(targetElement);
        const strategy = SelectionStrategies[detection.selectionMethod] || SelectionStrategies.standard;
        
        this.logger.debug('Using selection strategy:', {
          fieldType: detection.fieldType,
          selectionMethod: detection.selectionMethod,
          element: targetElement.tagName
        });
        
        // Try methods in order of priority
        for (const methodName of strategy.methods) {
          if (this.methods[methodName]) {
            selectedText = this.methods[methodName](targetElement);
            if (selectedText) {
              this.logger.debug(`Selection found via ${methodName}:`, {
                text: selectedText.substring(0, 30) + '...',
                length: selectedText.length
              });
              break;
            }
          }
        }
        
        // Special handling for professional editors
        if (!selectedText && detection.fieldType === FieldTypes.PROFESSIONAL_EDITOR) {
          selectedText = this.methods.professionalEditorSelection(targetElement);
        }
      } else {
        // No specific element context, try standard methods
        selectedText = this.methods.getSelection() || 
                     this.methods.documentSelection();
      }
      
      // Cache result
      if (targetElement && selectedText) {
        this.cache.set(targetElement, {
          text: selectedText,
          timestamp: Date.now()
        });
      }
      
    } catch (error) {
      this.logger.error('Selection detection failed:', error);
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
    const { maxAttempts = 3, delay = 100, increasingDelay = true } = options;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const selectedText = this.detect(element, { forceRefresh: true });
      
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
   * Clear detection cache
   */
  clearCache() {
    this.cache = new WeakMap();
  }
}

// Export singleton instance
export const selectionDetector = new SelectionDetector();