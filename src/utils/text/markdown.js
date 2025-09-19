/**
 * RE-EXPORT: Shared Markdown Utilities
 * This file re-exports markdown utilities from the shared utilities for backward compatibility
 *
 * Migration Guide:
 * - Replace: import { SimpleMarkdown } from '@/utils/text/markdown.js'
 * - With: import { SimpleMarkdown } from '@/shared/utils/text/markdown.js'
 *
 * This maintains compatibility while moving to shared utilities
 */

// Re-export from shared utilities
export * from "../../shared/utils/text/markdown.js";