/**
 * Prompt Registry - Single source of truth for prompt metadata.
 * Defines classification, technical requirements, and risk levels for all extension prompts.
 */

export const PromptCategory = {
  USER: 'USER',         // Top-level instructions (Tone, style)
  SYSTEM: 'SYSTEM',     // Base wrappers (JSON schemas, delimiters)
  INTERNAL: 'INTERNAL'  // Hidden/System-managed prompts (Follow-ups)
};

export const PromptRisk = {
  SAFE: 'SAFE',         // Cosmetic changes only
  MEDIUM: 'MEDIUM',     // Formatting specific (Markdown)
  HIGH: 'HIGH',         // Delimiter specific (Batching)
  CRITICAL: 'CRITICAL'  // Schema specific (JSON parsing)
};

/**
 * Registry of all prompts used in the extension.
 */
export const PROMPT_REGISTRY = {
  // --- USER PROMPTS ---
  PROMPT_TEMPLATE: {
    key: 'PROMPT_TEMPLATE',
    labelKey: 'prompt_type_general',
    descKey: 'prompt_help_general',
    category: PromptCategory.USER,
    risk: PromptRisk.SAFE,
    editable: true,
    placeholders: ["$_{SOURCE}", "$_{TARGET}", "$_{TEXT}"],
    previewSupport: true
  },
  PROMPT_TEMPLATE_AUTO: {
    key: 'PROMPT_TEMPLATE_AUTO',
    labelKey: 'prompt_type_auto',
    descKey: 'prompt_help_auto',
    category: PromptCategory.USER,
    risk: PromptRisk.SAFE,
    editable: true,
    placeholders: ["$_{TARGET}", "$_{TEXT}"],
    previewSupport: true
  },

  // --- SYSTEM PROMPTS (Wrappers) ---
  PROMPT_BASE_FIELD: {
    key: 'PROMPT_BASE_FIELD',
    labelKey: 'prompt_base_field_label',
    category: PromptCategory.SYSTEM,
    risk: PromptRisk.SAFE,
    editable: false,
    placeholders: ["$_{SOURCE}", "$_{TARGET}", "$_{PROMPT_INSTRUCTIONS}", "$_{TEXT}"],
    previewSupport: true
  },
  PROMPT_BASE_FIELD_AUTO: {
    key: 'PROMPT_BASE_FIELD_AUTO',
    labelKey: 'prompt_base_field_auto_label',
    category: PromptCategory.SYSTEM,
    risk: PromptRisk.SAFE,
    editable: false,
    placeholders: ["$_{TARGET}", "$_{PROMPT_INSTRUCTIONS}", "$_{TEXT}"],
    previewSupport: true
  },
  PROMPT_BASE_POPUP_TRANSLATE: {
    key: 'PROMPT_BASE_POPUP_TRANSLATE',
    labelKey: 'prompt_base_popup_label',
    category: PromptCategory.SYSTEM,
    risk: PromptRisk.SAFE,
    editable: false,
    placeholders: ["$_{TARGET}", "$_{PROMPT_INSTRUCTIONS}", "$_{TEXT}"],
    previewSupport: true
  },
  PROMPT_BASE_BATCH: {
    key: 'PROMPT_BASE_BATCH',
    labelKey: 'prompt_base_batch_label',
    category: PromptCategory.SYSTEM,
    risk: PromptRisk.HIGH,
    editable: false,
    placeholders: ["$_{SOURCE}", "$_{TARGET}", "$_{PROMPT_INSTRUCTIONS}", "$_{TEXT}"],
    previewSupport: true
  },
  PROMPT_BASE_AI_BATCH: {
    key: 'PROMPT_BASE_AI_BATCH',
    labelKey: 'prompt_base_ai_batch_label',
    category: PromptCategory.SYSTEM,
    risk: PromptRisk.CRITICAL,
    editable: false,
    placeholders: ["$_{SOURCE}", "$_{TARGET}", "$_{PROMPT_INSTRUCTIONS}", "$_{COUNT}", "$_{TEXT}"],
    previewSupport: true
  },
  PROMPT_BASE_AI_BATCH_AUTO: {
    key: 'PROMPT_BASE_AI_BATCH_AUTO',
    labelKey: 'prompt_base_ai_batch_auto_label',
    category: PromptCategory.SYSTEM,
    risk: PromptRisk.CRITICAL,
    editable: false,
    placeholders: ["$_{TARGET}", "$_{PROMPT_INSTRUCTIONS}", "$_{COUNT}", "$_{TEXT}"],
    previewSupport: true
  },
  PROMPT_BASE_SELECT: {
    key: 'PROMPT_BASE_SELECT',
    labelKey: 'prompt_base_select_label',
    category: PromptCategory.SYSTEM,
    risk: PromptRisk.CRITICAL,
    editable: false,
    placeholders: ["$_{SOURCE}", "$_{TARGET}", "$_{PROMPT_INSTRUCTIONS}", "$_{TEXT}"],
    previewSupport: true
  },
  PROMPT_BASE_DICTIONARY: {
    key: 'PROMPT_BASE_DICTIONARY',
    labelKey: 'prompt_base_dictionary_label',
    category: PromptCategory.SYSTEM,
    risk: PromptRisk.MEDIUM,
    editable: false,
    placeholders: ["$_{SOURCE}", "$_{TARGET}", "$_{TEXT}"],
    previewSupport: true
  },
  PROMPT_BASE_SCREEN_CAPTURE: {
    key: 'PROMPT_BASE_SCREEN_CAPTURE',
    labelKey: 'prompt_base_screen_capture_label',
    category: PromptCategory.SYSTEM,
    risk: PromptRisk.SAFE,
    editable: false,
    placeholders: ["$_{TARGET}", "$_{PROMPT_INSTRUCTIONS}", "$_{TEXT}"],
    previewSupport: true
  },

  // --- INTERNAL PROMPTS ---
  PROMPT_BASE_AI_FOLLOWUP: {
    key: 'PROMPT_BASE_AI_FOLLOWUP',
    labelKey: 'prompt_base_ai_followup_label',
    category: PromptCategory.INTERNAL,
    risk: PromptRisk.CRITICAL,
    editable: false,
    placeholders: ["$_{SOURCE}", "$_{TARGET}", "$_{PROMPT_INSTRUCTIONS}", "$_{TEXT}"],
    previewSupport: false
  },
  PROMPT_BASE_AI_FOLLOWUP_AUTO: {
    key: 'PROMPT_BASE_AI_FOLLOWUP_AUTO',
    labelKey: 'prompt_base_ai_followup_auto_label',
    category: PromptCategory.INTERNAL,
    risk: PromptRisk.CRITICAL,
    editable: false,
    placeholders: ["$_{TARGET}", "$_{PROMPT_INSTRUCTIONS}", "$_{TEXT}"],
    previewSupport: false
  }
};

/**
 * Get required placeholders for a specific prompt key.
 * 
 * @param {string} key - Prompt key
 * @returns {string[]} - Array of placeholder strings
 */
export function getRequiredPlaceholders(key) {
  return PROMPT_REGISTRY[key]?.placeholders || ["$_{SOURCE}", "$_{TARGET}", "$_{TEXT}"];
}

/**
 * Check if a prompt is editable by the user.
 * 
 * @param {string} key - Prompt key
 * @returns {boolean}
 */
export function isPromptEditable(key) {
  return PROMPT_REGISTRY[key]?.editable || false;
}

export default {
  PromptCategory,
  PromptRisk,
  PROMPT_REGISTRY,
  getRequiredPlaceholders,
  isPromptEditable
};
