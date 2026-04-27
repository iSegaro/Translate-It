/**
 * Constants and static sets for DomTranslator components
 */

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
