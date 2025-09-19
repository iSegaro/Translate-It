/**
 * RE-EXPORT: Text Selection Markdown
 * This file re-exports SimpleMarkdown from the text-selection feature for backward compatibility
 *
 * Migration Guide:
 * - Replace: import { SimpleMarkdown } from '@/utils/text/markdown.js'
 * - With: import { SimpleMarkdown } from '@/features/text-selection/utils/text/markdown.js'
 *
 * This maintains compatibility while making text-selection feature independent
 */

// Re-export from the text-selection feature location
export * from "../../features/text-selection/utils/text/markdown.js";