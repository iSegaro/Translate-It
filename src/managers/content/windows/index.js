// src/managers/content/windows/index.js

// Main WindowsManager
export { WindowsManager } from './WindowsManager.js';

// Core modules
export { WindowsConfig } from './core/WindowsConfig.js';
export { WindowsState } from './core/WindowsState.js';
export { WindowsFactory } from './core/WindowsFactory.js';

// Cross-frame modules
export { CrossFrameManager } from './crossframe/CrossFrameManager.js';
export { FrameRegistry } from './crossframe/FrameRegistry.js';
export { MessageRouter } from './crossframe/MessageRouter.js';

// Position modules
export { PositionCalculator } from './position/PositionCalculator.js';
export { SmartPositioner } from './position/SmartPositioner.js';

// Animation modules
export { AnimationManager } from './animation/AnimationManager.js';

// Translation modules
export { TranslationHandler } from './translation/TranslationHandler.js';
export { TTSManager } from './translation/TTSManager.js';
export { TranslationRenderer } from './translation/TranslationRenderer.js';

// Interaction modules
export { DragHandler } from './interaction/DragHandler.js';
export { ClickManager } from './interaction/ClickManager.js';

// Theme modules
export { ThemeManager } from './theme/ThemeManager.js';

// Utility functions
export { dismissAllSelectionWindows } from './utils/DismissAll.js';