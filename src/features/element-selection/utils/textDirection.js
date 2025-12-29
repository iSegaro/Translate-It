// Text Direction Utilities for Element Selection
// Simplified implementation following Immersive Translate pattern
// Uses target language as primary determinant for text direction

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'textDirection');

/**
 * List of RTL language codes
 */
const RTL_LANGUAGES = [
  'ar', // Arabic
  'fa', // Persian
  'he', // Hebrew
  'ur', // Urdu
  'ku', // Kurdish
  'ps', // Pashto
  'sd', // Sindhi
  'yi', // Yiddish
  'syr', // Syriac
  'am', // Amharic
  'ti', // Tigrinya
  'dz', // Dzongkha
  'ks' // Kashmiri
];

/**
 * Comprehensive RTL character pattern for fallback detection
 */
const RTL_CHARACTER_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

/**
 * Check if a language is RTL
 * @param {string} languageCode - Language code (e.g., 'fa', 'ar')
 * @returns {boolean} Whether the language is RTL
 */
export function isRTLLanguage(languageCode) {
  if (!languageCode || typeof languageCode !== 'string') {
    return false;
  }

  // Handle language codes with locale (e.g., 'fa-IR', 'ar-SA')
  const langCode = languageCode.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.includes(langCode);
}

/**
 * Get text direction based on target language
 * @param {string} targetLanguage - Target language code
 * @param {string} text - Text content (fallback analysis)
 * @returns {string} 'rtl' or 'ltr'
 */
export function getTextDirection(targetLanguage, text = '') {
  // Primary: Use target language
  if (targetLanguage) {
    const isRTL = isRTLLanguage(targetLanguage);
    logger.debug(`Text direction determined by target language (${targetLanguage}): ${isRTL ? 'RTL' : 'LTR'}`);
    return isRTL ? 'rtl' : 'ltr';
  }

  // Fallback: Analyze text content
  if (text) {
    const hasRTLChars = RTL_CHARACTER_PATTERN.test(text);
    logger.debug(`Text direction determined by content analysis: ${hasRTLChars ? 'RTL' : 'LTR'}`);
    return hasRTLChars ? 'rtl' : 'ltr';
  }

  // Default: LTR
  logger.debug('Text direction defaulted to LTR (no target language or text provided)');
  return 'ltr';
}

/**
 * Detect text direction from actual text content (more accurate for mixed content)
 * Uses strong directional character detection following Unicode Bidirectional Algorithm principles
 * @param {string} text - Text to analyze
 * @param {string} targetLanguage - Optional target language code (used as fallback, not primary)
 * @returns {string} 'rtl' or 'ltr'
 */
export function detectTextDirectionFromContent(text = '', targetLanguage = null) {
  if (!text || typeof text !== 'string') {
    return 'ltr';
  }

  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return 'ltr';
  }

  // Count RTL and LTR STRONG characters (ignore neutral/weak characters)
  let rtlStrongCount = 0;
  let ltrStrongCount = 0;

  // Track first and last strong character positions for better detection
  let firstRTLIndex = -1;
  let firstLTRIndex = -1;

  for (let i = 0; i < trimmedText.length; i++) {
    const char = trimmedText[i];
    const code = char.codePointAt(0);

    // RTL Strong characters: Arabic, Hebrew, Syriac, Thaana, etc.
    // Unicode blocks: Arabic (0600-06FF), Arabic Supplement (0750-077F),
    // Arabic Extended (08A0-08FF), Hebrew (0590-05FF), Syriac (0700-074F),
    // Thaana (0780-07BF), NKo (07C0-07FF), etc.
    const isRTLStrong = (
      (code >= 0x0590 && code <= 0x05FF) ||  // Hebrew
      (code >= 0x0600 && code <= 0x06FF) ||  // Arabic
      (code >= 0x0700 && code <= 0x074F) ||  // Syriac
      (code >= 0x0750 && code <= 0x077F) ||  // Arabic Supplement
      (code >= 0x0780 && code <= 0x07BF) ||  // Thaana
      (code >= 0x07C0 && code <= 0x07FF) ||  // NKo
      (code >= 0x08A0 && code <= 0x08FF) ||  // Arabic Extended
      (code >= 0xFB1D && code <= 0xFB4F) ||  // Hebrew Presentation Forms
      (code >= 0xFB50 && code <= 0xFDFF) ||  // Arabic Presentation Forms
      (code >= 0xFE70 && code <= 0xFEFF) ||  // Arabic Presentation Forms-B
      (code >= 0x200F && code <= 0x200F)     // Right-to-Left Mark
    );

    // LTR Strong characters: Latin, Greek, Cyrillic, etc.
    // These are scripts that are inherently left-to-right
    const isLTRStrong = (
      (code >= 0x0041 && code <= 0x005A) ||  // Basic Latin uppercase
      (code >= 0x0061 && code <= 0x007A) ||  // Basic Latin lowercase
      (code >= 0x00C0 && code <= 0x00D6) ||  // Latin-1 Supplement letters
      (code >= 0x00D8 && code <= 0x00F6) ||  // Latin-1 Supplement letters
      (code >= 0x00F8 && code <= 0x00FF) ||  // Latin-1 Supplement letters
      (code >= 0x0100 && code <= 0x017F) ||  // Latin Extended-A
      (code >= 0x0180 && code <= 0x024F) ||  // Latin Extended-B
      (code >= 0x0250 && code <= 0x02AF) ||  // IPA Extensions
      (code >= 0x0370 && code <= 0x03FF) ||  // Greek and Coptic
      (code >= 0x0400 && code <= 0x04FF) ||  // Cyrillic
      (code >= 0x0500 && code <= 0x052F) ||  // Cyrillic Supplement
      (code >= 0x1E00 && code <= 0x1EFF) ||  // Latin Extended Additional
      (code >= 0x200E && code <= 0x200E)     // Left-to-Right Mark
    );

    if (isRTLStrong) {
      rtlStrongCount++;
      if (firstRTLIndex === -1) firstRTLIndex = i;
    } else if (isLTRStrong) {
      ltrStrongCount++;
      if (firstLTRIndex === -1) firstLTRIndex = i;
    }
    // Note: Neutral characters (spaces, numbers, punctuation) are ignored
    // They follow the direction of surrounding strong characters
  }

  // Enhanced detection algorithm for translated content:
  // 1. Primary: Use content analysis (strong directional characters)
  // 2. If no strong characters found, use target language as hint
  // 3. If balanced content (40-60%), use target language as tiebreaker
  // 4. Special case: For RTL target languages with significant RTL content (30%+), prefer RTL
  //    This handles mixed content like "Zadig: یک" where target is Persian
  let isRTL = false;

  if (rtlStrongCount === 0 && ltrStrongCount === 0) {
    // No strong directional characters - mostly numbers/symbols/punctuation
    // Use target language as hint if available
    if (targetLanguage && isRTLLanguage(targetLanguage)) {
      logger.debug(`Direction determined by target language (no strong chars): RTL`);
      return 'rtl';
    }
    logger.debug(`Direction detected: LTR (no strong characters, no target language)`);
    return 'ltr';
  }

  const totalStrong = rtlStrongCount + ltrStrongCount;
  const rtlRatio = rtlStrongCount / totalStrong;

  // CRITICAL FIX: For translated content, if target language is RTL and there's
  // significant RTL content (20% or more), use RTL direction. This handles cases
  // where translations contain many untranslated English terms but are primarily RTL.
  if (targetLanguage && isRTLLanguage(targetLanguage) && rtlRatio >= 0.2) {
    isRTL = true;
    logger.debug(`Direction: RTL (target language is RTL with significant RTL content: ${Math.round(rtlRatio * 100)}%)`);
  }
  // Primary heuristic: Use majority with threshold
  // If one direction is 60% or more of strong characters, use that direction
  // This handles mixed content like "SDK غیر رسمی پایتون" better (17 RTL vs 3 LTR = 85% RTL)
  else if (rtlRatio >= 0.6) {
    isRTL = true;
  } else if (rtlRatio <= 0.4) {
    isRTL = false;
  } else {
    // Balanced content (40%-60% range) - use target language as tiebreaker
    if (targetLanguage && isRTLLanguage(targetLanguage)) {
      isRTL = true;
      logger.debug(`Direction: RTL (target language is RTL, content is balanced)`);
    } else {
      // Follow the Unicode Bidirectional Algorithm (P2, P3 rules)
      isRTL = firstRTLIndex < firstLTRIndex;
      logger.debug(`Direction: balanced content, using first strong character`);
    }
  }

  logger.debug(`Direction detected from content: ${isRTL ? 'RTL' : 'LTR'}`, {
    rtlStrongCount,
    ltrStrongCount,
    rtlRatio: Math.round(rtlRatio * 100) + '%',
    firstRTLIndex,
    firstLTRIndex,
    textLength: trimmedText.length,
    textPreview: trimmedText.substring(0, 50)
  });

  return isRTL ? 'rtl' : 'ltr';
}

/**
 * Apply container-level direction attribute following Immersive Translate pattern
 * @param {HTMLElement} element - Container element to apply direction to
 * @param {string} targetLanguage - Target language code
 * @param {string} text - Text content (for fallback)
 * @param {Object} options - Additional options
 */
export function applyContainerDirection(element, targetLanguage, text = '', options = {}) {
  if (!element) {
    logger.warn('applyContainerDirection: No element provided');
    return;
  }

  const { preserveOriginal = false } = options;

  // Store original direction if needed
  if (preserveOriginal && !element.dataset.originalDirection) {
    element.dataset.originalDirection = element.dir || '';
  }

  // Get direction using target-language-first approach
  const direction = getTextDirection(targetLanguage, text);

  // Apply direction at container level (Immersive Translate pattern)
  element.dir = direction;

  logger.debug(`Applied container-level direction: ${direction}`, {
    targetLanguage,
    textLength: text.length,
    tagName: element.tagName
  });
}

/**
 * Restore original element direction
 * @param {HTMLElement} element - Element to restore
 */
export function restoreOriginalDirection(element) {
  if (!element || !element.dataset) {
    return;
  }

  if (element.dataset.originalDirection !== undefined) {
    element.dir = element.dataset.originalDirection || '';
    delete element.dataset.originalDirection;
  }
}

/**
 * Create direction-aware container following Immersive Translate pattern
 * @param {string} targetLanguage - Target language code
 * @param {string} text - Text content
 * @param {Object} options - Container options
 * @returns {HTMLElement} Container element with proper direction
 */
export function createDirectionAwareContainer(targetLanguage, text = '', options = {}) {
  const {
    tagName = 'div',
    className = 'immersive-translate-target-wrapper',
    id = ''
  } = options;

  const container = document.createElement(tagName);

  if (className) {
    container.className = className;
  }

  if (id) {
    container.id = id;
  }

  // Apply direction using target language
  applyContainerDirection(container, targetLanguage, text);

  return container;
}

/**
 * Simplified utility object for common operations
 */
export const ElementDirectionUtils = {
  isRTLLanguage,
  getDirection: getTextDirection,
  detectFromContent: detectTextDirectionFromContent,
  applyDirection: applyContainerDirection,
  restoreDirection: restoreOriginalDirection,
  createContainer: createDirectionAwareContainer
};

// Export for testing
export { RTL_LANGUAGES, RTL_CHARACTER_PATTERN };