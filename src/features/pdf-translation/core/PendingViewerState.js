/**
 * Pending Viewer State — retains a Viewer State snapshot awaiting attachment.
 *
 * Owns the pending Viewer State reference until a later phase consumes or clears it.
 * Framework-independent. No Vue, no Pinia, no browser APIs.
 *
 * ADR-014: Viewer State Architecture.
 */

let _pending = null

/**
 * Returns the current pending Viewer State, or null.
 * @returns {object|null}
 */
export function getPendingViewerState() {
  return _pending
}

/**
 * Stores a Viewer State snapshot as pending.
 * Replaces any previously stored state.
 * Does not mutate or clone the input.
 * @param {object|null} state — Viewer State from createViewerState(), or null
 */
export function setPendingViewerState(state) {
  _pending = state
}

/**
 * Clears the pending Viewer State.
 * Idempotent — safe to call when already null.
 */
export function clearPendingViewerState() {
  _pending = null
}
