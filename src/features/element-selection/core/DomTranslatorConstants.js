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
 * Tags that represent major page layout structures and should NOT have their 'dir' attribute changed
 * to avoid flipping the entire page UI (like sidebars, avatars, etc.)
 */
export const LAYOUT_TAGS = new Set([
  'ARTICLE', 'SECTION', 'NAV', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER', 'FORM', 'TABLE', 'UL', 'OL', 'DETAILS'
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
  'SPAN', 'STRONG', 'EM', 'B', 'I', 'U', 'S', 'SMALL', 'BR', 'A', 'SUB', 'SUP', 'CODE', 'CITE', 'Q'
]);

/**
 * Block-level tags that should have text-align: start applied
 */
export const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'DIV', 'TD', 'TH', 'CAPTION'
]);
