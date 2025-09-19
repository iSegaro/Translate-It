/**
 * DEPRECATED: Legacy SelectionDetector - Use core/SelectionDetector.js instead
 * This file exists for backward compatibility only
 * 
 * Migration Guide:
 * - Replace: import { selectionDetector } from '@/utils/text/SelectionDetector.js'
 * - With: import { selectionDetector } from '@/utils/text/core/SelectionDetector.js'
 * 
 * TODO: 2 files still using legacy imports - migrate when possible
 */

// Re-export from the new modular location
export * from "./core/SelectionDetector.js";

// Import and re-export for backward compatibility
import { selectionDetector as newSelectionDetector } from "./core/SelectionDetector.js";

// Legacy exports
export const selectionDetector = newSelectionDetector;

// Legacy SelectionMethods class (now handled by site handlers)
export class SelectionMethods {
  constructor() {
    this.logger = { debug: () => {}, error: () => {} };
    if (process.env.NODE_ENV === 'development') {
      console.warn('DEPRECATED: SelectionMethods is now handled by site handlers');
      console.warn('Migration: Use SiteHandlerRegistry and specific site handlers instead');
    }
  }
  
  // Legacy methods that delegate to the new system
  async getSelection() {
    return await newSelectionDetector.detect();
  }
  
  async documentSelection() {
    return await newSelectionDetector.detect();
  }
  
  async inputSelectionRange(element) {
    return await newSelectionDetector.detect(element);
  }
  
  async activeElementSelection(element) {
    return await newSelectionDetector.detect(element);
  }
  
  async iframeSelection() {
    return await newSelectionDetector.detect();
  }
  
  async wordAroundCursor(element) {
    return await newSelectionDetector.detect(element);
  }
  
  // Site-specific methods now handled by handlers
  async zohoWriterSelection(element) {
    return await newSelectionDetector.detect(element);
  }
  
  async professionalEditorSelection(element) {
    return await newSelectionDetector.detect(element);
  }
  
  async wpsSpecificSelection(element) {
    return await newSelectionDetector.detect(element);
  }
  
  async googleDocsSelection(element) {
    return await newSelectionDetector.detect(element);
  }
  
  async genericProfessionalSelection(element) {
    return await newSelectionDetector.detect(element);
  }
}

// Legacy SelectionStrategies (now in types.js)
export const SelectionStrategies = {
  standard: { priority: 1, methods: ['getSelection', 'documentSelection'] },
  'input-selection': { priority: 2, methods: ['inputSelectionRange', 'getSelection', 'documentSelection'] },
  'content-editable': { priority: 3, methods: ['getSelection', 'activeElementSelection', 'documentSelection'] },
  'iframe-based': { priority: 4, methods: ['iframeSelection', 'getSelection', 'activeElementSelection', 'documentSelection'] },
  'input-based': { priority: 5, methods: ['inputSelectionRange', 'activeElementSelection', 'getSelection', 'wordAroundCursor'] },
  'zoho-writer': { priority: 6, methods: ['zohoWriterSelection', 'getSelection', 'documentSelection'] }
};

// Legacy SelectionDetector class
export class SelectionDetector {
  constructor() {
    this.logger = { debug: () => {}, error: () => {} };
    this.methods = new SelectionMethods();
    this.cache = new WeakMap();
    console.warn('DEPRECATED: Use selectionDetector from core/SelectionDetector.js instead');
  }
  
  async detect(element, options = {}) {
    return await newSelectionDetector.detect(element, options);
  }
  
  async detectWithRetry(element, options = {}) {
    return await newSelectionDetector.detectWithRetry(element, options);
  }
  
  clearCache() {
    return newSelectionDetector.clearCache();
  }
}

// Register globally for backward compatibility
if (typeof window !== 'undefined') {
  window.selectionDetector = newSelectionDetector;
}