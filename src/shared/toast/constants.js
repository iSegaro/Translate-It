// Toast Integration Constants
// Centralized constants for Vue Sonner toast integration

export const TOAST_SELECTORS = {
  // Vue Sonner data attributes
  TOASTER: 'data-sonner-toaster',
  TOAST: 'data-sonner-toast',
  
  // Vue Sonner CSS classes
  TOASTER_CLASS: 'sonner-toaster',
  TOAST_CLASS: 'sonner-toast',
  
  // Additional selectors for comprehensive detection
  TEST_ID_TOASTER: 'data-testid="toaster"',
  
  // Button and action selectors
  BUTTON: 'data-button',
  ACTION: 'data-action'
};

export const TOAST_ELEMENT_QUERIES = {
  // All possible toast container selectors
  CONTAINERS: [
    '[data-sonner-toaster]',
    '[data-sonner-toast]',
    '.sonner-toaster',
    '.sonner-toast',
    '[data-testid="toaster"]',
    'li[data-sonner-toast]',
    'div[data-sonner-toast]'
  ],
  
  // Button and action selectors
  INTERACTIVE: [
    '[data-button]',
    '[data-action]',
    'button[data-action]'
  ]
};



export const EXTENSION_SELECTORS = {
  CONTAINER_CLASS: 'content-app-container',
  HIGHLIGHTED_CLASS: 'translate-it-element-highlighted'
};