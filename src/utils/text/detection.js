/**
 * RE-EXPORT: Text Selection Detection
 * This file re-exports detection utilities from the text-selection feature for backward compatibility
 *
 * Migration Guide:
 * - Replace: import { isSingleWordOrShortPhrase } from '@/utils/text/detection.js'
 * - With: import { isSingleWordOrShortPhrase } from '@/features/text-selection/utils/text/detection.js'
 *
 * This maintains compatibility while making text-selection feature independent
 */

// Re-export from the text-selection feature location
export * from "../../features/text-selection/utils/text/detection.js";