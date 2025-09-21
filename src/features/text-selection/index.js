/**
 * Text Selection Module
 *
 * Simplified text selection system for page content.
 * Handles only page text selection with selectionchange events.
 *
 * Key Features:
 * - Single selectionchange event listener
 * - No complex drag detection
 * - Clean integration with WindowsManager
 * - Vue composable support
 * - Cross-frame communication
 *
 * Note: Text field interactions are handled separately in text-field-interaction module
 */

// Core components
export { SimpleTextSelectionHandler } from './handlers/SimpleTextSelectionHandler.js';
export { SelectionManager } from './core/SelectionManager.js';

// Vue integration
export { useTextSelection } from './composables/useTextSelection.js';

// Re-export useful utilities from old system (for backward compatibility)
export { SelectionDecisionManager } from './utils/SelectionDecisionManager.js';

// Default export for easy importing
export { SimpleTextSelectionHandler as default } from './handlers/SimpleTextSelectionHandler.js';