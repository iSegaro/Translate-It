/**
 * Viewer State — immutable snapshot of viewing position.
 *
 * Viewer State is the architectural concept defined by ADR-014.
 * It is implemented as an immutable snapshot of existing architectural owners.
 * It owns nothing, enforces no invariants, and is never authoritative.
 * Values are restored by passing them back to the original owners.
 *
 * ADR-014: Viewer State Architecture
 */
export function createViewerState({
  documentIdentity,
  currentPage,
  contentView,
  layoutMode,
  zoomMode,
  zoomPercent,
}) {
  return Object.freeze({
    documentIdentity,
    currentPage,
    contentView,
    layoutMode,
    zoomMode,
    zoomPercent,
  })
}
