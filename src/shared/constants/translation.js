/**
 * Translation-related constants
 * DOM classes, process statuses, and HTML attributes
 */

// ===== TRANSLATION HTML CONSTANTS =====
export const TRANSLATION_HTML = {
  IGNORE_CLASS: 'ti-ignore-translation',
  NO_TRANSLATE_CLASS: 'notranslate',
  NO_TRANSLATE_VALUE: 'no',
  ICON_ID: 'translate-it-icon',
  WINDOW_CLASS: 'translation-window'
};

// ===== TRANSLATION STATUS CONSTANTS =====
export const TRANSLATION_STATUS = {
  IDLE: 'idle',
  TRANSLATING: 'translating',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// ===== TRANSLATION EXECUTION BUDGET =====
// Per-batch execution budget for ONE provider batch call. This is a batch
// attempt budget, NOT a universal translation/request timeout: each batch
// attempt (and each retry attempt) receives its own fresh budget. Structured
// (Select Element/PDF) and generic (Page/Subtitle) batch guards share it.
export const TRANSLATION_BATCH_EXECUTION_TIMEOUT_MS = 300000;
