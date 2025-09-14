/**
 * Shared types and interfaces for text selection system
 */

/**
 * Field type classifications
 */
export const FieldTypes = {
  REGULAR_INPUT: 'regular-input',           // Basic HTML input/textarea
  PROFESSIONAL_EDITOR: 'professional-editor',  // Rich text editors like Google Docs, WPS
  CONTENT_EDITABLE: 'content-editable',     // Simple contentEditable elements
  RICH_TEXT_EDITOR: 'rich-text-editor',     // Advanced WYSIWYG editors
  NON_PROCESSABLE: 'non-processable',       // Fields that should not be processed (password, phone, etc.)
  UNKNOWN: 'unknown'                        // Unclassified field
};

/**
 * Selection strategies
 */
export const SelectionStrategies = {
  ANY_SELECTION: 'any-selection',           // Any text selection triggers icon
  DOUBLE_CLICK_REQUIRED: 'double-click-required' // Requires double-click
};

/**
 * Selection event strategies
 */
export const SelectionEventStrategies = {
  SELECTION_BASED: 'selection-based',       // Use selectionchange events
  MOUSE_BASED: 'mouse-based'                // Use mouseup events
};

/**
 * Selection methods
 */
export const SelectionMethods = {
  STANDARD: 'standard',
  INPUT_SELECTION: 'input-selection',
  CONTENT_EDITABLE: 'content-editable',
  IFRAME_BASED: 'iframe-based',
  INPUT_BASED: 'input-based',
  TEXTAREA_BASED: 'textarea-based',
  CUSTOM: 'custom'
};

/**
 * Site handler result interface
 */
export class SiteHandlerResult {
  constructor(data = {}) {
    this.success = data.success || false;
    this.text = data.text || '';
    this.position = data.position || { x: 0, y: 0 };
    this.metadata = data.metadata || {};
    this.error = data.error || null;
  }
}

/**
 * Site configuration interface
 */
export class SiteConfig {
  constructor(data = {}) {
    this.hostname = data.hostname || '';
    this.type = data.type || FieldTypes.UNKNOWN;
    this.selectionMethod = data.selectionMethod || SelectionMethods.STANDARD;
    this.selectors = data.selectors || [];
    this.features = data.features || [];
    this.selectionStrategy = data.selectionStrategy || SelectionStrategies.ANY_SELECTION;
    this.selectionEventStrategy = data.selectionEventStrategy || SelectionEventStrategies.SELECTION_BASED;
    this.customHandler = data.customHandler || null;
    this.priority = data.priority || 1;
  }
}

/**
 * Selection detection options
 */
export class SelectionDetectionOptions {
  constructor(data = {}) {
    this.element = data.element || null;
    this.sourceEvent = data.sourceEvent || null;
    this.forceRefresh = data.forceRefresh || false;
    this.maxAttempts = data.maxAttempts || 3;
    this.delay = data.delay || 100;
    this.increasingDelay = data.increasingDelay || true;
  }
}