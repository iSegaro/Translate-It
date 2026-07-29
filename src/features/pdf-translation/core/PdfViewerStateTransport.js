import { createViewerState } from './PdfViewerState.js'

/**
 * Serialized format: `doc=...&p=...&v=...`
 *
 * - Key order is fixed and deterministic.
 * - Single-character keys; single-character enum values.
 * - Transport delegates value encoding to URLSearchParams/history APIs.
 * - ADR-014: Viewer State Architecture.
 */

const CONTENT_VIEW_TO_KEY = Object.freeze({
  original: 'o',
  translation: 't',
  'translated-pdf': 'p',
})

const KEY_TO_CONTENT_VIEW = Object.freeze({
  o: 'original',
  t: 'translation',
  p: 'translated-pdf',
})

const REQUIRED_KEYS = ['doc', 'p', 'v']

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

  return pairs.join('&')
}

/**
 * Deserializes a transport string into Viewer State.
 *
 * Returns null for any structurally malformed or incomplete transport.
 * Performs no domain validation — page range and enum membership
 * are the responsibility of architectural owners.
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

  return createViewerState({
    documentIdentity: doc,
    currentPage: page,
    contentView,
  })
}
