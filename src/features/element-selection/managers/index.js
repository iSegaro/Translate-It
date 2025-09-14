// Main entry point for Select Element module
// Re-exports all components for easy importing

// Unified Manager (Primary export)
export { SelectElementManager, getSelectElementManager } from '../SelectElementManager.js';
export { SelectElementNotificationManager, getSelectElementNotificationManager } from '../SelectElementNotificationManager.js';

// Core Services
export { ElementHighlighter } from './services/ElementHighlighter.js';
export { TextExtractionService } from './services/TextExtractionService.js';
export { TranslationOrchestrator } from './services/TranslationOrchestrator.js';
export { ModeManager } from './services/ModeManager.js';
export { ErrorHandlingService } from './services/ErrorHandlingService.js';
export { StateManager } from './services/StateManager.js';

// Export utilities and constants
export * from './utils/elementValidation.js';
export * from './utils/textProcessing.js';
export * from './utils/domHelpers.js';
export * from './constants/selectElementConstants.js';

// Note: Legacy exports removed - Use FeatureManager to access SelectElementManager
// Access pattern: window.featureManager.getFeatureHandler('selectElement')
