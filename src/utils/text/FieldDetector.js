/**
 * RE-EXPORT: Text Selection FieldDetector
 * This file re-exports FieldDetector from the text-selection feature for backward compatibility
 *
 * Migration Guide:
 * - Replace: import { fieldDetector } from '@/utils/text/FieldDetector.js'
 * - With: import { fieldDetector } from '@/features/text-selection/utils/text/core/FieldDetector.js'
 *
 * This maintains compatibility while making text-selection feature independent
 */

// Re-export from the text-selection feature location
export * from "../../features/text-selection/utils/text/core/FieldDetector.js";

// This file now only re-exports from the text-selection feature
// All legacy compatibility is handled by the re-export