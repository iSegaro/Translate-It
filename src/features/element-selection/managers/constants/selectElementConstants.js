// Constants for Select Element module
// Centralized configuration and constants

import { SELECT_ELEMENT_MODES, SELECT_ELEMENT_DEFAULTS } from "@/features/element-selection/constants/SelectElementModes.js";

export const MODES = SELECT_ELEMENT_MODES;
export const DEFAULTS = SELECT_ELEMENT_DEFAULTS;

// Configuration constants
export const CONFIG = {
  MODE: DEFAULTS.MODE,
  BASE_MODE: DEFAULTS.BASE_MODE,
  MIN_TEXT_LENGTH: DEFAULTS.MIN_TEXT_LENGTH,
  MIN_WORD_COUNT: DEFAULTS.MIN_WORD_COUNT,
  MAX_ELEMENT_AREA: DEFAULTS.MAX_ELEMENT_AREA,
  MAX_ANCESTORS: DEFAULTS.MAX_ANCESTORS
};

// Retry configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 2,
  RETRY_DELAY: [1000, 2000, 5000], // Progressive delay
  FAILURE_COOLDOWN: 60000, // 1 minute cooldown for failed texts
  CLEANUP_CHANCE: 0.1 // 10% chance to clean up old entries
};

// UI constants
export const UI_CONSTANTS = {
  HIGHLIGHT_CLASS: 'translate-it-element-highlighted',
  CURSOR_CLASS: 'translate-it-cursor-select',
  DISABLE_LINKS_CLASS: 'AIWritingCompanion-disable-links',
  SIMPLE_MODE_CLASS: 'simple-mode'
};

// Event constants
export const EVENT_OPTIONS = {
  CAPTURE: true,
  PASSIVE: false
};

// Key constants
export const KEY_CODES = {
  ESCAPE: 'Escape',
  CONTROL: 'Control'
};

// Translation timeout fallback
export const TRANSLATION_TIMEOUT_FALLBACK = 15000; // 15 seconds

// Dynamic timeout calculation constants
export const TIMEOUT_CONFIG = {
  BASE_TIMEOUT: 30000, // 30 seconds base timeout
  TIME_PER_SEGMENT: 2000, // 2 seconds per segment
  MAX_TIMEOUT: 300000, // 5 minutes maximum timeout
  MIN_TIMEOUT: 30000, // 30 seconds minimum timeout
};

// Cache configuration
export const CACHE_CONFIG = {
  ELEMENT_VALIDATION: new WeakMap(),
  TEXT_CONTENT: new WeakMap()
};

export default {
  MODES,
  DEFAULTS,
  CONFIG,
  RETRY_CONFIG,
  UI_CONSTANTS,
  EVENT_OPTIONS,
  KEY_CODES,
  TRANSLATION_TIMEOUT_FALLBACK,
  TIMEOUT_CONFIG,
  CACHE_CONFIG
};
