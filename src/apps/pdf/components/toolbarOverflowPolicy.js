/**
 * Toolbar overflow routing. Private to PdfToolbar.
 *
 * Owns: which controls move to the More menu when toolbar width
 * is constrained. Receives an isTablet boolean, returns only the
 * controls that should overflow.
 *
 * Does NOT own:
 *   - Responsive presentation (belongs to each control)
 *   - CSS visibility (belongs to stylesheets)
 *   - ToolbarMenu rendering (belongs to ToolbarMenu)
 *
 * Pure function. Zero dependencies.
 */

const NO_OVERFLOW = Object.freeze({})

function resolveOverflow(isTablet) {
  if (!isTablet) return NO_OVERFLOW

  return {
    'layout-toggle': 'menu',
  }
}

export { resolveOverflow }
