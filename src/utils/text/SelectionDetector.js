/**
 * RE-EXPORT: Text Selection SelectionDetector
 * This file re-exports SelectionDetector from the text-selection feature for backward compatibility
 *
 * Migration Guide:
 * - Replace: import { selectionDetector } from '@/utils/text/SelectionDetector.js'
 * - With: import { selectionDetector } from '@/features/text-selection/utils/text/core/SelectionDetector.js'
 *
 * This maintains compatibility while making text-selection feature independent
 */

// Re-export from the text-selection feature location
export * from "../../features/text-selection/utils/text/core/SelectionDetector.js";

// This file now only re-exports from the text-selection feature
// All legacy compatibility is handled by the re-export