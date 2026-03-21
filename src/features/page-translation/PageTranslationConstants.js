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
 * Attribute names used for tracking and displaying translation state
 */
export const PAGE_TRANSLATION_ATTRIBUTES = {
  TRANSLATED_MARKER: 'data-page-translated',
  HAS_ORIGINAL: 'data-has-original',
  TRANSLATE_DIR: 'data-translate-dir',
  TRANSLATE_IGNORE: 'data-translate-ignore',
  TRANSLATE_NO_ATTR: 'translate',
};

import { NOTIFICATION_TIME, UI_HOST_IDS, TRANSLATION_HTML } from '@/shared/config/constants.js';

/**
 * Selector and class constants for internal UI elements
 */
export const PAGE_TRANSLATION_SELECTORS = {
  TOOLTIP_ID: UI_HOST_IDS.TOOLTIP,
  INTERNAL_IGNORE_CLASS: TRANSLATION_HTML.IGNORE_CLASS,
  STANDARD_NO_TRANSLATE_CLASS: TRANSLATION_HTML.NO_TRANSLATE_CLASS,
  TRANSLATE_NO_VALUE: TRANSLATION_HTML.NO_TRANSLATE_VALUE,
  UI_HOST_MAIN: UI_HOST_IDS.MAIN,
  UI_HOST_IFRAME: UI_HOST_IDS.IFRAME
};

/**
 * Default settings for page translation
 */
export const DEFAULT_PAGE_TRANSLATION_SETTINGS = {
  chunkSize: 250,
  maxConcurrentFlushes: 1,
  lazyLoading: true,
  rootMargin: '10px',
  priorityThreshold: 1,
  poolDelay: 200
};

/**
 * Timing and duration constants for page translation
 */
export const PAGE_TRANSLATION_TIMING = {
  // Toast durations
  TOAST_DURATION: NOTIFICATION_TIME.WARNING,
  FATAL_ERROR_DURATION: NOTIFICATION_TIME.FATAL,
  WARNING_DURATION: NOTIFICATION_TIME.WARNING,
  
  // Scheduler delays
  FIRST_BATCH_DELAY: 800,
  HIGH_PRIORITY_DELAY: 250,
  STANDARD_LOAD_DELAY: 600,
  CONCURRENCY_RETRY_DELAY: 300,
  
  // DOM stability delays
  DOM_STABILIZATION_DELAY: 50
};
