/**
 * RE-EXPORT: Shared Text Analysis Utilities
 * This file re-exports text analysis utilities from the shared utilities for backward compatibility
 *
 * Migration Guide:
 * - Replace: import { isPersianText, shouldApplyRtl } from '@/utils/text/textDetection.js'
 * - With: import { isPersianText, shouldApplyRtl } from '@/shared/utils/text/textAnalysis.js'
 *
 * This maintains compatibility while moving to shared utilities
 */

// Re-export from shared utilities
export * from "../../shared/utils/text/textAnalysis.js";