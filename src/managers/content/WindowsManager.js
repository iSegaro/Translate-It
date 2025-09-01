// src/managers/content/WindowsManager.js - Modular WindowsManager
// Updated paths after migration to features/windows

export { WindowsManager as default } from '../../features/windows/managers/WindowsManager.js';
export { dismissAllSelectionWindows } from '../../features/windows/managers/utils/DismissAll.js';

// Re-export for backward compatibility with SelectionWindows name
export { WindowsManager as SelectionWindows } from '../../features/windows/managers/WindowsManager.js';

// Export all modules for advanced usage
export * from '../../features/windows/managers/index.js';