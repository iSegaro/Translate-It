import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { readViewerStateFromUrl } from './PdfViewerStateUrlAdapter.js'
import { serializeViewerState } from './PdfViewerStateTransport.js'
import { createViewerState } from './PdfViewerState.js'

// ── Browser environment mock ───────────────────────────────────────

let _hash = ''

beforeEach(() => {
  _hash = ''
  globalThis.location = {
    get hash() {
      return _hash
    },
    set hash(value) {
      _hash = value
    },
    href: 'chrome-extension://test/src/html/pdf.html',
  }
})

afterEach(() => {
  // @ts-ignore
  delete globalThis.location
})

// ── Helpers ────────────────────────────────────────────────────────

function state(overrides = {}) {
  return createViewerState({
    documentIdentity: 'abc123',
    currentPage: 5,
    contentView: 'translation',
    layoutMode: 'side-by-side',
    zoomMode: 'fit-width',
    zoomPercent: 100,
    ...overrides,
  })
}

function setHash(raw) {
  globalThis.location.hash = raw
}

// ── Tests ──────────────────────────────────────────────────────────

describe('readViewerStateFromUrl', () => {
  it('returns ViewerState for valid hash', () => {
    setHash('#' + serializeViewerState(state()))
    const result = readViewerStateFromUrl()
    expect(result).not.toBeNull()
    expect(result.documentIdentity).toBe('abc123')
  })

  it('returns null when hash is empty', () => {
    setHash('')
    expect(readViewerStateFromUrl()).toBeNull()
  })

  it('returns null when hash is just #', () => {
    setHash('#')
    expect(readViewerStateFromUrl()).toBeNull()
  })

  it('returns null for malformed transport', () => {
    setHash('#garbage_without_structure')
    expect(readViewerStateFromUrl()).toBeNull()
  })

  it('returns null when deserialize rejects', () => {
    setHash('#doc=abc&p=5&v=t&l=b')
    // missing z → deserialize returns null
    expect(readViewerStateFromUrl()).toBeNull()
  })

  it('never throws for any input', () => {
    const inputs = [
      null,
      undefined,
      '',
      '#',
      '#garbage',
      '#doc=valid&p=1&v=t&l=s&z=w',
    ]
    for (const input of inputs) {
      setHash(input)
      expect(() => readViewerStateFromUrl()).not.toThrow()
    }
  })

  it('returns null when browser APIs are unavailable', () => {
    // @ts-ignore
    delete globalThis.location
    expect(readViewerStateFromUrl()).toBeNull()
  })

  it('round-trips: serialize → write → read → same state', () => {
    const original = state({ zoomMode: 'percent', zoomPercent: 150 })
    setHash('#' + serializeViewerState(original))
    const result = readViewerStateFromUrl()
    expect(result).toEqual(original)
  })
})
