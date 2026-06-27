/**
 * PDF Feature Flags — centralized internal flags for PDF translation features.
 *
 * All flags default to false. No user-facing settings.
 * Enable individual flags for dev testing only.
 *
 * To enable a flag for dev testing:
 *   1. Set the value to true below
 *   2. Reload the extension
 *   3. Test the feature
 *   4. Revert to false before commit
 */

/**
 * Enable mask-aware cell overlay positioning.
 * When true, table cell overlays use canonical mask geometry
 * instead of raw PDF item geometry.
 */
export const PDF_OVERLAY_USE_CELL_MASKS = false
