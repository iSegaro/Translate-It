/**
 * Constants for Select Element Manager modes and validation
 * 
 * This file contains all constants related to SelectElementManager
 * to ensure type safety and consistency across the application.
 * 
 * @fileoverview Select Element constants and types
 */

/**
 * Available validation modes for SelectElementManager
 * @readonly
 * @enum {string}
 */
export const SELECT_ELEMENT_MODES = Object.freeze({
  /** Simple validation mode (like old system) - minimal checks */
  SIMPLE: 'simple',
  
  /** Smart validation mode - enhanced validation with filters */
  SMART: 'smart'
});

/**
 * Default configuration values for SelectElementManager
 * @readonly
 */
export const SELECT_ELEMENT_DEFAULTS = Object.freeze({
  /** Default validation mode */
  MODE: SELECT_ELEMENT_MODES.SIMPLE,
  
  /** Base mode when Ctrl is not pressed */
  BASE_MODE: SELECT_ELEMENT_MODES.SIMPLE,
  
  /** Minimum text length to consider for translation */
  MIN_TEXT_LENGTH: 1,
  
  /** Minimum word count for meaningful content */
  MIN_WORD_COUNT: 1,
  
  /** Maximum element area for container validation */
  MAX_ELEMENT_AREA: 50000,
  
  /** Maximum ancestors to check when finding best element */
  MAX_ANCESTORS: 5
});

/**
 * PostMessage types for cross-world communication
 * @readonly
 * @enum {string}
 */
export const SELECT_ELEMENT_MESSAGE_TYPES = Object.freeze({
  /** Set validation mode command */
  SET_MODE: 'TRANSLATE_IT_SET_MODE',
  
  /** Get current mode command */
  GET_MODE: 'TRANSLATE_IT_GET_MODE',
  
  /** Mode response message */
  MODE_RESPONSE: 'TRANSLATE_IT_MODE_RESPONSE'
});

/**
 * Validation helper functions
 */
export const SelectElementValidation = Object.freeze({
  /**
   * Check if a given mode is valid
   * @param {string} mode - Mode to validate
   * @returns {boolean} True if mode is valid
   */
  isValidMode(mode) {
    return Object.values(SELECT_ELEMENT_MODES).includes(mode);
  },
  
  /**
   * Get all available modes
   * @returns {string[]} Array of valid mode values
   */
  getAllModes() {
    return Object.values(SELECT_ELEMENT_MODES);
  },
  
  /**
   * Get mode display name for logging
   * @param {string} mode - Mode value
   * @returns {string} Formatted mode name for display
   */
  getDisplayName(mode) {
    switch (mode) {
      case SELECT_ELEMENT_MODES.SIMPLE:
        return 'SIMPLE (like old system)';
      case SELECT_ELEMENT_MODES.SMART:
        return 'SMART (enhanced validation)';
      default:
        return `UNKNOWN (${mode})`;
    }
  },
  
  /**
   * Get mode emoji for logging
   * @param {string} mode - Mode value
   * @returns {string} Emoji representing the mode
   */
  getModeEmoji(mode) {
    switch (mode) {
      case SELECT_ELEMENT_MODES.SIMPLE:
        return '🎮';
      case SELECT_ELEMENT_MODES.SMART:
        return '🧠';
      default:
        return '❓';
    }
  }
});

/**
 * Type definitions for JSDoc
 * @typedef {('simple'|'smart')} SelectElementMode
 */