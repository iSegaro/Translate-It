/**
 * Element Detection Configuration
 *
 * Centralized configuration for all DOM element selectors used across the extension.
 * Provides a single source of truth for element detection patterns.
 */

/**
 * Translation-related selectors
 * These selectors identify elements that are part of the translation UI
 */
export const TRANSLATION_SELECTORS = [
  '[data-translation-window]',
  '[data-translation-icon]',
  '.translation-window',
  '.translation-icon',
  '.AIWritingCompanion-translation-icon-extension'
];

/**
 * Icon-related selectors
 * These selectors specifically identify icon elements
 */
export const ICON_SELECTORS = [
  '#translate-it-icon',
  '[id^="translation-icon-"]',
  '[id^="text-field-icon-"]',
  '.translation-icon',
  '.AIWritingCompanion-translation-icon-extension'
];

/**
 * Host/container selectors
 * These selectors identify UI host containers that contain translation elements
 */
export const HOST_SELECTORS = [
  '#translate-it-host-main',
  '#translate-it-host-iframe',
  '#translate-it-host',
  '.aiwc-selection-popup-host',
  '.popup-container'
];

/**
 * Text field selectors
 * These selectors identify text field and editable elements
 */
export const TEXT_FIELD_SELECTORS = [
  'input[type="text"]',
  'input[type="email"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="url"]',
  'input[type="tel"]',
  'textarea',
  '[contenteditable="true"]',
  '[contenteditable=""]'
];

/**
 * Professional editor selectors
 * These selectors identify elements from rich text editors
 */
export const PROFESSIONAL_EDITOR_SELECTORS = [
  '[data-editor]',
  '.editor',
  '.DraftEditor-root',
  '.ProseMirror',
  '.quill',
  '.tox-edit-area',
  '.ck-editor__editable',
  '.notion-page-content',
  '[role="textbox"]'
];

/**
 * Combined selectors for efficient DOM queries
 * These are pre-combined selectors to optimize performance
 */
export const COMBINED_SELECTORS = {
  // For checking if an element or its ancestor is translation-related
  TRANSLATION: TRANSLATION_SELECTORS.join(', '),

  // For checking if an element or its ancestor is an icon
  ICON: ICON_SELECTORS.join(', '),

  // For checking if an element or its ancestor is a host
  HOST: HOST_SELECTORS.join(', '),

  // For finding text fields
  TEXT_FIELD: TEXT_FIELD_SELECTORS.join(', '),

  // For finding professional editors
  PROFESSIONAL_EDITOR: PROFESSIONAL_EDITOR_SELECTORS.join(', '),

  // Combined translation and icon elements (for outside click detection)
  TRANSLATION_OR_ICON: [...TRANSLATION_SELECTORS, ...ICON_SELECTORS].join(', '),

  // All UI elements that should prevent outside click dismissal
  UI_ELEMENTS: [...HOST_SELECTORS, ...TRANSLATION_SELECTORS, ...ICON_SELECTORS].join(', ')
};

/**
 * Dynamic selector patterns
 * These are patterns for elements with dynamic IDs
 */
export const DYNAMIC_PATTERNS = {
  TRANSLATION_ICON: /^translation-icon-/,
  TEXT_FIELD_ICON: /^text-field-icon-/,
  TRANSLATION_WINDOW: /^translation-window-/
};

/**
 * Default options for element detection
 */
export const DETECTION_OPTIONS = {
  // Maximum depth to search for ancestors
  MAX_ANCESTOR_DEPTH: 5,

  // Timeout for dynamic element detection
  DETECTION_TIMEOUT: 100,

  // Whether to include shadow DOM in searches
  INCLUDE_SHADOW_DOM: true
};

/**
 * Element types for better type safety and debugging
 */
export const ELEMENT_TYPES = {
  TRANSLATION_WINDOW: 'translation-window',
  TRANSLATION_ICON: 'translation-icon',
  TEXT_FIELD_ICON: 'text-field-icon',
  HOST: 'host',
  POPUP: 'popup',
  UNKNOWN: 'unknown'
};