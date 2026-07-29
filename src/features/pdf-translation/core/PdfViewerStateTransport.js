import { createViewerState } from './PdfViewerState.js'

/**
 * Serialized format: `doc=...&p=...&v=...&l=...&z=...` with optional `&zz=...`
 *
 * - Key order is fixed and deterministic.
 * - Single-character keys; single-character enum values.
 * - `zz` (zoomPercent) is written only when `zoomMode === 'percent'`.
 * - Current Viewer State values are transport-safe and require no escaping.
 * - ADR-014: Viewer State Architecture.
 */

const CONTENT_VIEW_TO_KEY = Object.freeze({
  original: 'o',
  translation: 't',
  'translated-pdf': 'p',
})

const LAYOUT_MODE_TO_KEY = Object.freeze({
  single: 's',
  'side-by-side': 'b',
})

const ZOOM_MODE_TO_KEY = Object.freeze({
  'fit-width': 'w',
  'fit-page': 'f',
  percent: 'p',
})

const KEY_TO_CONTENT_VIEW = Object.freeze({
  o: 'original',
  t: 'translation',
  p: 'translated-pdf',
})

const KEY_TO_LAYOUT_MODE = Object.freeze({
  s: 'single',
  b: 'side-by-side',
})

const KEY_TO_ZOOM_MODE = Object.freeze({
  w: 'fit-width',
  f: 'fit-page',
  p: 'percent',
})

const REQUIRED_KEYS = ['doc', 'p', 'v', 'l', 'z']

/**
 * Serializes Viewer State to a deterministic transport string.
 *
 * @param {object} state — frozen Viewer State from createViewerState()
 * @returns {string}
 */
export function serializeViewerState(state) {
  const pairs = []

  pairs.push(`doc=${state.documentIdentity}`)
  pairs.push(`p=${state.currentPage}`)
  pairs.push(`v=${CONTENT_VIEW_TO_KEY[state.contentView]}`)
  pairs.push(`l=${LAYOUT_MODE_TO_KEY[state.layoutMode]}`)
  pairs.push(`z=${ZOOM_MODE_TO_KEY[state.zoomMode]}`)

  if (state.zoomMode === 'percent') {
    pairs.push(`zz=${state.zoomPercent}`)
  }

  return pairs.join('&')
}

/**
 * Deserializes a transport string into Viewer State.
 *
 * Returns null for any structurally malformed or incomplete transport.
 * Performs no domain validation — page range, zoom limits, and enum
 * membership are the responsibility of architectural owners.
 *
 * @param {string|null|undefined} raw — serialized transport string
 * @returns {object|null} frozen Viewer State, or null
 */
export function deserializeViewerState(raw) {
  if (raw == null || raw === '') return null

  const seen = new Set()
  /** @type {Record<string, string>} */
  const values = {}

  const pairs = raw.split('&')
  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq === -1) return null
    const key = pair.slice(0, eq)
    const value = pair.slice(eq + 1)
    if (seen.has(key)) return null
    seen.add(key)
    values[key] = value
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in values)) return null
  }

  const doc = values.doc
  if (doc === '') return null

  const page = Number(values.p)
  if (!Number.isFinite(page)) return null

  const contentView = KEY_TO_CONTENT_VIEW[values.v]
  if (contentView === undefined) return null

  const layoutMode = KEY_TO_LAYOUT_MODE[values.l]
  if (layoutMode === undefined) return null

  const zoomMode = KEY_TO_ZOOM_MODE[values.z]
  if (zoomMode === undefined) return null

  let zoomPercent = 100
  if ('zz' in values && zoomMode === 'percent') {
    zoomPercent = Number(values.zz)
    if (!Number.isFinite(zoomPercent)) return null
  }

  return createViewerState({
    documentIdentity: doc,
    currentPage: page,
    contentView,
    layoutMode,
    zoomMode,
    zoomPercent,
  })
}
