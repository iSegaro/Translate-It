/**
 * Element Selection Feature Entry Point - Lazy Loading Support
 * This file provides a central entry point for Element Selection functionality with lazy loading
 */

// Export lazy loading factory
export { ElementSelectionFactory } from './ElementSelectionFactory.js';
export { useElementSelectionLazy } from './composables/useElementSelectionLazy.js';

// Lazy loading functions for dynamic imports
export const loadElementSelectionCore = async () => {
  const [manager, highlighter, extractor] = await Promise.all([
    import('./SelectElementManager.js'),
    import('./managers/services/ElementHighlighter.js'),
    import('./managers/services/TextExtractionService.js')
  ]);

  return {
    SelectElementManager: manager.default || manager.SelectElementManager,
    ElementHighlighter: highlighter.ElementHighlighter,
    TextExtractionService: extractor.TextExtractionService
  };
};

export const loadElementSelectionHandlers = () => {
  return Promise.all([
    import('./handlers/handleActivateSelectElementMode.js'),
    import('./handlers/handleDeactivateSelectElementMode.js'),
    import('./handlers/handleGetSelectElementState.js'),
    import('./handlers/handleSetSelectElementState.js')
  ]);
};

export const loadElementSelectionServices = () => {
  return Promise.all([
    import('./managers/services/TranslationOrchestrator.js'),
    import('./managers/services/ModeManager.js'),
    import('./managers/services/StateManager.js'),
    import('./managers/services/ErrorHandlingService.js')
  ]);
};

export const loadElementSelectionConstants = () => {
  return import('./constants/SelectElementModes.js');
};

// Backward compatibility - lazy loaded when accessed
export const SelectElementManager = async () => {
  const { SelectElementManager: Manager } = await loadElementSelectionCore();
  return Manager;
};

// Default export for main Element Selection functionality
export const ElementSelection = {
  loadCore: loadElementSelectionCore,
  loadHandlers: loadElementSelectionHandlers,
  loadServices: loadElementSelectionServices,
  loadConstants: loadElementSelectionConstants,
  SelectElementManager
};

export default ElementSelection;