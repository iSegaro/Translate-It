/**
 * Global Selection Event Constants
 * Used for decoupled communication between SelectionManager and UI Managers (FAB, WindowsManager, etc.)
 */
export const SELECTION_EVENTS = {
  // Emitted when text is selected or selection changes
  // Payload: { text, position, mode, context }
  GLOBAL_SELECTION_CHANGE: 'global-selection-change',
  
  // Emitted when selection is cleared or should be dismissed
  // Payload: { reason }
  GLOBAL_SELECTION_CLEAR: 'global-selection-clear',
  
  // Emitted when a UI component (like FAB) triggers a translation for a pending selection
  // Payload: { text, position }
  GLOBAL_SELECTION_TRIGGER: 'global-selection-trigger'
};
