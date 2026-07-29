import { deserializeViewerState } from './PdfViewerStateTransport.js'

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
