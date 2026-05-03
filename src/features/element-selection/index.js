/**
 * Element Selection Feature Entry Point - Lazy Loading Support
 * This file provides a central entry point for Element Selection functionality with lazy loading
 */

// Export modern factory and composables
export { ElementSelectionFactory } from './ElementSelectionFactory.js';
export { useElementSelectionLazy } from './composables/useElementSelectionLazy.js';

/**
 * Lazy loading functions for core feature components
 */
export const loadElementSelectionCore = async () => {
  const [managerModule, selectorModule, adapterModule] = await Promise.all([
    import('./SelectElementManager.js'),
    import('./core/ElementSelector.js'),
    import('./core/DomTranslatorAdapter.js')
  ]);

  return {
    SelectElementManager: managerModule.SelectElementManager || managerModule.default,
    ElementSelector: selectorModule.ElementSelector,
    DomTranslatorAdapter: adapterModule.DomTranslatorAdapter
  };
};

/**
 * Lazy loading for background handlers
 */
export const loadElementSelectionHandlers = () => {
  return Promise.all([
    import('./handlers/handleActivateSelectElementMode.js'),
    import('./handlers/handleDeactivateSelectElementMode.js'),
    import('./handlers/handleGetSelectElementState.js'),
    import('./handlers/handleSetSelectElementState.js')
  ]);
};

/**
 * Lazy loading for constants
 */
export const loadElementSelectionConstants = () => {
  return import('./constants/SelectElementModes.js');
};

/**
 * Backward compatibility - returns the Manager class via Promise
 */
export const getSelectElementManagerAsync = async () => {
  const { SelectElementManager } = await loadElementSelectionCore();
  return SelectElementManager;
};

// Default export for main Element Selection functionality facade
export const ElementSelection = {
  loadCore: loadElementSelectionCore,
  loadHandlers: loadElementSelectionHandlers,
  loadConstants: loadElementSelectionConstants,
  getManagerAsync: getSelectElementManagerAsync
};

export default ElementSelection;
