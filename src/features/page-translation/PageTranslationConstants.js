/**
 * RTL language codes for automatic direction detection
 */
export const RTL_LANGUAGES = new Set([
  'ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ckb', 'dv', 'ug',
]);

/**
 * Tags that are safe to apply RTL direction without breaking layout
 */
export const TEXT_TAGS = new Set([
  'P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'A', 
  'TD', 'TH', 'DT', 'DD', 'LABEL', 'CAPTION', 'Q', 'CITE', 
  'SMALL', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'BUTTON',
  'INPUT', 'TEXTAREA'
]);

/**
 * Default settings for page translation
 */
export const DEFAULT_PAGE_TRANSLATION_SETTINGS = {
  chunkSize: 250,
  maxConcurrentFlushes: 1,
  lazyLoading: true,
  rootMargin: '300px',
  priorityThreshold: 1,
  poolDelay: 200
};

/**
 * Timing and duration constants for page translation
 */
export const PAGE_TRANSLATION_TIMING = {
  // Toast durations
  TOAST_DURATION: 5000,
  FATAL_ERROR_DURATION: 5000,
  WARNING_DURATION: 5000,
  
  // Scheduler delays
  FIRST_BATCH_DELAY: 500,
  HIGH_PRIORITY_DELAY: 50,
  STANDARD_LOAD_DELAY: 200,
  CONCURRENCY_RETRY_DELAY: 200,
  
  // DOM stability delays
  DOM_STABILIZATION_DELAY: 50
};
