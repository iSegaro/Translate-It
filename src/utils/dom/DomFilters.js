/**
 * Shared DOM filtering patterns and utilities for translation.
 * Used by both Whole Page Translation and Select Element modules.
 */

export const DOM_FILTERS = {
  // Static regex patterns for common non-translatable technical patterns
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  URL_REGEX: /^(https?:\/\/|www\.)[^\s/$.?#].[^\s]*$/i,
  HEX_COLOR_REGEX: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  VERSION_REGEX: /^(v\d+\.\d+(\.\d+)?|\d+\.\d+\.\d+)(-[a-zA-Z0-9.]+)?$/,
  FILE_PATH_REGEX: /^(\/|[a-zA-Z]:\\)[^\s:*?"<>|]+$/,
  HASHTAG_MENTION_REGEX: /^([#@]\S+\s*)+$/,
  
  // Numeric and special patterns
  NUMERIC_REGEX: /^\d+$/,
  TIME_REGEX: /^(\d+:)+\d+$/,
  METRIC_REGEX: /^\d+(\.\d+)?[kKM]$/,
  
  /**
   * Determine if a string matches any technical non-translatable pattern
   * @param {string} text - The trimmed text to check
   * @returns {boolean} True if it should be skipped
   */
  isTechnicalPattern(text) {
    if (!text) return false;
    return (
      this.EMAIL_REGEX.test(text) ||
      this.URL_REGEX.test(text) ||
      this.HEX_COLOR_REGEX.test(text) ||
      this.VERSION_REGEX.test(text) ||
      this.FILE_PATH_REGEX.test(text) ||
      this.HASHTAG_MENTION_REGEX.test(text)
    );
  }
};
