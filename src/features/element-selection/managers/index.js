// Main entry point for Select Element module
// Simplified for the new domtranslator-based architecture

// Unified Manager (Primary export)
export { SelectElementManager } from '../SelectElementManager.js';
export { SelectElementNotificationManager, getSelectElementNotificationManager } from '../SelectElementNotificationManager.js';

// Core Services (New simplified services)
export { DomTranslatorAdapter } from '../core/DomTranslatorAdapter.js';
export { ElementSelector } from '../core/ElementSelector.js';

// Export constants
export * from './constants/selectElementConstants.js';
export * from '../constants/SelectElementModes.js';

// Export new simplified utilities
export * from '../utils/index.js';

// Note: Access pattern: window.featureManager.getFeatureHandler('selectElement')
