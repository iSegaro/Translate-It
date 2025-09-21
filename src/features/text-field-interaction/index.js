/**
 * Text Field Interaction Module
 *
 * Complete text field interaction system including:
 * - Text field icon management (focus/blur)
 * - Double-click text selection in text fields
 * - Professional editor support
 * - Platform-specific strategies
 *
 * This module is separate from page text selection (text-selection module)
 * to maintain clear separation of concerns.
 */

// Main handlers
export { TextFieldHandler } from './handlers/TextFieldHandler.js';
export { TextFieldDoubleClickHandler } from './handlers/TextFieldDoubleClickHandler.js';

// Legacy handler (for backward compatibility)
export { TextFieldIconHandler } from './handlers/TextFieldIconHandler.js';

// Managers
export { TextFieldIconManager } from './managers/TextFieldIconManager.js';

// Composables
export { useTextFieldIcon } from './composables/useTextFieldIcon.js';

// Utilities
export { TextFieldDetector } from './utils/TextFieldDetector.js';

// Platform strategies
export * from './strategies/index.js';

// Default export for easy importing
export { TextFieldHandler as default } from './handlers/TextFieldHandler.js';