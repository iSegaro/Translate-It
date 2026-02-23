// Element Selection Utilities Index
// Simplified for the new domtranslator-based architecture

// Simple helpers (new)
export * from './elementHelpers.js';

// Text direction utilities (still useful for RTL/LTR handling)
export {
  isRTLLanguage,
  getTextDirection,
  RTL_LANGUAGES
} from './textDirection.js';

// Cleanup utilities (useful for window management)
export { cleanupAllSelectionWindows } from './cleanupSelectionWindows.js';

// Timeout calculator (useful for dynamic timeouts)
export { calculateDynamicTimeout } from './timeoutCalculator.js';

// Note: The following complex utilities have been removed as part of the simplification:
// - blockLevelExtraction.js (placeholder system - replaced by domtranslator)
// - placeholderReassembly.js (placeholder system - replaced by domtranslator)
// - PlaceholderRegistry.js (placeholder system - replaced by domtranslator)
// - textProcessing.js (streaming support - removed)
// - textExtraction.js (complex extraction - replaced by simple elementHelpers)
// - domManipulation.js (complex manipulation - replaced by domtranslator)
// - spacingUtils.js (not used in simplified architecture)
