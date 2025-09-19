// src/features/text-selection/utils/text/markdown.js
// Extended markdown utilities specific to text-selection feature
import { SimpleMarkdown as SharedSimpleMarkdown } from "@/shared/utils/text/markdown.js";

// Re-export from shared for backward compatibility within text-selection
export const SimpleMarkdown = SharedSimpleMarkdown;

// Text-selection specific markdown extensions can be added here if needed