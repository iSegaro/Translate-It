/**
 * Constants and static sets for DomTranslator components
 */

/**
 * RTL language codes for automatic direction detection
 */
export const RTL_LANGUAGES = new Set([
  'ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ckb', 'dv', 'ug',
  'ae', 'arc', 'xh', 'zu'
]);

/**
 * Checks if a character code belongs to an RTL strong directional category.
 * Includes: Hebrew, Arabic, Syriac, Thaana, NKo, etc.
 * @param {number} code - Unicode character code
 * @returns {boolean}
 */
export function isRTLStrongCharacter(code) {
  return (
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
    (code === 0x200F)                      // Right-to-Left Mark
  );
}

/**
 * Checks if a character code belongs to an LTR strong directional category.
 * Includes: Latin, Greek, Cyrillic, etc.
 * @param {number} code - Unicode character code
 * @returns {boolean}
 */
export function isLTRStrongCharacter(code) {
  return (
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
    (code === 0x200E)                      // Left-to-Right Mark
  );
}
/**
 * Tags that represent major page layout structures and should NOT have their 'dir' attribute changed
 * to avoid flipping the entire page UI (like sidebars, avatars, etc.)
 */
export const LAYOUT_TAGS = new Set([
  'HTML', 'BODY', 'ARTICLE', 'SECTION', 'NAV', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER', 'FORM', 'TABLE', 'UL', 'OL', 'DETAILS'
]);

/**
 * CSS display values that indicate a layout engine is active (flex, grid)
 */
export const LAYOUT_DISPLAY_MODES = new Set([
  'flex', 'grid', 'inline-flex', 'inline-grid'
]);

/**
 * Interactive UI elements that should not be flipped as part of a text block
 */
export const INTERACTIVE_TAGS = new Set([
  'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'
]);

/**
 * Tags that are safe to apply RTL direction without breaking layout
 */
export const TEXT_TAGS = new Set([
...
  'P', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'A', 
  'TD', 'TH', 'DT', 'DD', 'LABEL', 'CAPTION', 'Q', 'CITE', 
  'SMALL', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'BUTTON',
  'INPUT', 'TEXTAREA', 'DIV'
]);

/**
 * Inline formatting tags that don't constitute a "complex layout"
 */
export const FORMATTING_TAGS = new Set([
  'SPAN', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'SMALL', 'BR', 'A', 'SUB', 'SUP', 'CODE', 'CITE', 'Q', 'TIME', 'IMG'
]);

/**
 * Block-level tags used specifically for the "Select Element" feature
 * to create logical grouping boundaries for context-aware batching.
 */
export const SELECT_ELEMENT_BLOCK_TAGS = new Set([
  'ARTICLE', 'SECTION', 'DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 
  'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'BLOCKQUOTE', 'PRE', 'TABLE', 'TR', 'TD', 'TH'
]);

/**
 * Block-level tags that should have text-align: start applied
 */
export const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DIV', 'TD', 'TH', 'CAPTION'
]);
