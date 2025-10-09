// src/constants.js
// Shared constants for the extension

export const AUTO_DETECT_VALUE = "auto";
export const DEFAULT_TARGET_LANGUAGE = "fa";

export const NOTIFICATION_TIME = {
  REVERT: 1500
}

// HTML Input Types for text field detection
export const INPUT_TYPES = {
  // Standard text input types
  TEXT_FIELD: ['text', 'email', 'password', 'search', 'url', 'tel', 'number'],

  // Financial and banking input types (should be ignored for translation)
  FINANCIAL: ['cc-name', 'cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year'],

  // Date and time input types (should be ignored for translation)
  DATETIME: ['date', 'time', 'datetime-local', 'month', 'week'],

  // Control and non-text input types (should be ignored for translation)
  CONTROL: ['range', 'color', 'file', 'hidden', 'submit', 'button', 'reset', 'image'],

  // All input types that should be detected as text fields (for ignoring)
  ALL_TEXT_FIELDS: [
    'text', 'email', 'password', 'search', 'url', 'tel', 'number',
    'cc-name', 'cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year',
    'date', 'time', 'datetime-local', 'month', 'week',
    'range', 'color', 'file', 'hidden', 'submit', 'button', 'reset', 'image'
  ]
}