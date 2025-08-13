// src/managers/content/WindowsManager.js - Modular WindowsManager

export { WindowsManager as default } from './windows/WindowsManager.js';
export { dismissAllSelectionWindows } from './windows/utils/DismissAll.js';

// Re-export for backward compatibility with SelectionWindows name
export { WindowsManager as SelectionWindows } from './windows/WindowsManager.js';

// Export all modules for advanced usage
export * from './windows/index.js';