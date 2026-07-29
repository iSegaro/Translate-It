import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { readViewerStateFromUrl, writeViewerStateToUrl } from './PdfViewerStateUrlAdapter.js'
import { serializeViewerState } from './PdfViewerStateTransport.js'
import { createViewerState } from './PdfViewerState.js'

// ── Browser environment mock ───────────────────────────────────────

let _hash = ''
let _replaceStateCalls = []
let _pathname = '/src/html/pdf.html'
let _search = ''

beforeEach(() => {
  _hash = ''
  _replaceStateCalls = []
  _pathname = '/src/html/pdf.html'
  _search = ''
  globalThis.location = {
    get hash() {
      return _hash
    },
    set hash(value) {
      _hash = value
    },
    get pathname() {
      return _pathname
    },
    get search() {
      return _search
    },
    href: 'chrome-extension://test/src/html/pdf.html',
  }
  globalThis.history = {
    replaceState: vi.fn((_state, _title, url) => {
      _replaceStateCalls.push(url)
      const hashIndex = url.indexOf('#')
      if (hashIndex !== -1) {
        _hash = url.slice(hashIndex)
      }
    }),
    pushState: vi.fn(),
  }
})

afterEach(() => {
  // @ts-ignore
  delete globalThis.location
  // @ts-ignore
  delete globalThis.history
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

// ── readViewerStateFromUrl tests ───────────────────────────────────

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

// ── writeViewerStateToUrl tests ────────────────────────────────────

describe('writeViewerStateToUrl', () => {
  it('writes serialized state via history.replaceState', () => {
    writeViewerStateToUrl(state())
    expect(globalThis.history.replaceState).toHaveBeenCalledTimes(1)
    expect(globalThis.history.pushState).not.toHaveBeenCalled()
  })

  it('written state is readable by readViewerStateFromUrl', () => {
    const original = state({ currentPage: 42 })
    writeViewerStateToUrl(original)
    const result = readViewerStateFromUrl()
    expect(result).toEqual(original)
  })

  it('preserves pathname in the URL', () => {
    _pathname = '/src/html/pdf.html'
    writeViewerStateToUrl(state())
    const writtenUrl = _replaceStateCalls[0]
    expect(writtenUrl).toMatch(/^\/src\/html\/pdf\.html/)
  })

  it('preserves query string in the URL', () => {
    _search = '?debug=1'
    writeViewerStateToUrl(state())
    const writtenUrl = _replaceStateCalls[0]
    expect(writtenUrl).toContain('?debug=1')
  })

  it('does not mutate input state', () => {
    const original = state()
    const snapshot = structuredClone(original)
    writeViewerStateToUrl(original)
    expect(original).toEqual(snapshot)
  })

  it('writes only the hash portion for a URL with search', () => {
    _search = '?debug=1'
    writeViewerStateToUrl(state())
    const writtenUrl = _replaceStateCalls[0]
    // hash should be written, query preserved
    expect(writtenUrl).toContain('#doc=')
    expect(writtenUrl).toContain('?debug=1')
  })
})
