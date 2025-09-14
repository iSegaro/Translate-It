/**
 * DEPRECATED: Legacy FieldDetector - Use core/FieldDetector.js instead
 * This file exists for backward compatibility only
 * 
 * Migration Guide:
 * - Replace: import { fieldDetector } from '@/utils/text/FieldDetector.js'
 * - With: import { fieldDetector } from '@/utils/text/core/FieldDetector.js'
 * 
 * TODO: 4 files still using legacy imports - migrate when possible
 */

// Re-export from the new modular location
export * from "./core/FieldDetector.js";

// Import and re-export for backward compatibility
import { fieldDetector as newFieldDetector, FieldTypes as newFieldTypes } from "./core/FieldDetector.js";

// Legacy exports
export const fieldDetector = newFieldDetector;
export const FieldTypes = newFieldTypes;

// Legacy functions for compatibility
export function classifyFieldType(element) {
  return fieldDetector.detect(element).then(result => result.fieldType);
}

export function shouldShowSelectionIcon(element) {
  return fieldDetector.detect(element).then(result => result.shouldShowSelectionIcon);
}

export function shouldShowTextFieldIcon(element) {
  return fieldDetector.detect(element).then(result => result.shouldShowTextFieldIcon);
}

export function getSelectionMethod(element) {
  return fieldDetector.detect(element).then(result => result.selectionMethod);
}

export function getSelectionStrategy(element) {
  return fieldDetector.detect(element).then(result => result.selectionStrategy);
}

export function getSelectionEventStrategy(element) {
  return fieldDetector.detect(element).then(result => result.selectionEventStrategy);
}


// Legacy FieldDetector class
export class FieldDetector {
  constructor() {
    this.logger = { debug: () => {} };
    if (process.env.NODE_ENV === 'development') {
      console.warn('DEPRECATED: FieldDetector class - Use fieldDetector instance from core/FieldDetector.js instead');
      console.warn('Migration: Replace "new FieldDetector()" with "import { fieldDetector } from \'@/utils/text/core/FieldDetector.js\'"');
    }
  }
  
  detect(element) {
    return newFieldDetector.detect(element);
  }
  
  isEditableElement(element) {
    return newFieldDetector.isEditableElement(element);
  }
}

// Register fieldDetector globally for use by other modules (legacy support)
if (typeof window !== 'undefined') {
  window.fieldDetector = newFieldDetector;
}