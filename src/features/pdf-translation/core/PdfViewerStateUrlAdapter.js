import { deserializeViewerState, serializeViewerState } from './PdfViewerStateTransport.js'

/**
 * Reads Viewer State from the browser tab URL.
 *
 * This is the Viewer State module responsible for browser URL access.
 * It delegates all parsing to PdfViewerStateTransport and only handles I/O.
 *
 * ADR-014: Viewer State Architecture.
 *
 * @returns {object|null} frozen Viewer State, or null
 */
export function readViewerStateFromUrl() {
  try {
    if (typeof globalThis.location === 'undefined') return null

    const raw = globalThis.location.hash
    if (!raw || raw === '#') return null

    const payload = raw.startsWith('#') ? raw.slice(1) : raw
    if (payload === '') return null

    return deserializeViewerState(payload)
  } catch {
    return null
  }
}

/**
 * Writes Viewer State to the browser tab URL hash.
 *
 * Preserves the existing pathname and query string. Uses history.replaceState
 * so the write does not add a new browser history entry.
 *
 * Does not mutate the input state.
 *
 * ADR-014: Viewer State Architecture.
 *
 * @param {object} state — frozen Viewer State from createViewerState()
 */
export function writeViewerStateToUrl(state) {
  if (typeof globalThis.history === 'undefined') return
  if (typeof globalThis.history.replaceState !== 'function') return
  if (typeof globalThis.location === 'undefined') return

  const serialized = serializeViewerState(state)
  const url = globalThis.location.pathname
    + globalThis.location.search
    + '#' + serialized

  globalThis.history.replaceState(null, '', url)
}
