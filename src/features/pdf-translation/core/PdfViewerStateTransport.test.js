import { describe, expect, it } from 'vitest'
import { createViewerState } from './PdfViewerState.js'
import { deserializeViewerState, serializeViewerState } from './PdfViewerStateTransport.js'

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

// ── Serialize ──────────────────────────────────────────────────────

describe('serializeViewerState', () => {
  it('produces deterministic output for equivalent input', () => {
    const a = serializeViewerState(state())
    const b = serializeViewerState(state())
    expect(a).toBe(b)
  })

  it('changes output when a field differs', () => {
    const a = serializeViewerState(state())
    const b = serializeViewerState(state({ currentPage: 99 }))
    expect(a).not.toBe(b)
  })

  it('starts with doc=', () => {
    expect(serializeViewerState(state())).toMatch(/^doc=/)
  })

  it('includes abbreviated content view', () => {
    const s = serializeViewerState(state({ contentView: 'original' }))
    expect(s).toContain('v=o')
  })

  it('includes abbreviated layout mode', () => {
    const s = serializeViewerState(state({ layoutMode: 'single' }))
    expect(s).toContain('l=s')
  })

  it('includes abbreviated zoom mode', () => {
    const s = serializeViewerState(state({ zoomMode: 'fit-page' }))
    expect(s).toContain('z=f')
  })

  it('omits zz when zoom mode is fit-width', () => {
    const s = serializeViewerState(state({ zoomMode: 'fit-width' }))
    expect(s).not.toContain('zz=')
  })

  it('includes zz when zoom mode is percent', () => {
    const s = serializeViewerState(state({ zoomMode: 'percent', zoomPercent: 150 }))
    expect(s).toContain('zz=150')
  })

  it('does not mutate input', () => {
    const input = state()
    const frozen = Object.freeze({
      documentIdentity: input.documentIdentity,
      currentPage: input.currentPage,
      contentView: input.contentView,
      layoutMode: input.layoutMode,
      zoomMode: input.zoomMode,
      zoomPercent: input.zoomPercent,
    })
    serializeViewerState(input)
    expect(input).toEqual(frozen)
  })
})

// ── Deserialize ────────────────────────────────────────────────────

describe('deserializeViewerState', () => {
  it('round-trips standard state', () => {
    const original = state()
    const result = deserializeViewerState(serializeViewerState(original))
    expect(result).toEqual(original)
  })

  it('round-trips percent zoom', () => {
    const original = state({ zoomMode: 'percent', zoomPercent: 150 })
    const result = deserializeViewerState(serializeViewerState(original))
    expect(result).toEqual(original)
  })

  it('round-trips all content views', () => {
    for (const cv of ['original', 'translation', 'translated-pdf']) {
      const original = state({ contentView: cv })
      expect(deserializeViewerState(serializeViewerState(original))).toEqual(original)
    }
  })

  it('round-trips all layout modes', () => {
    for (const lm of ['single', 'side-by-side']) {
      const original = state({ layoutMode: lm })
      expect(deserializeViewerState(serializeViewerState(original))).toEqual(original)
    }
  })

  it('round-trips all zoom modes', () => {
    for (const zm of ['fit-width', 'fit-page', 'percent']) {
      const original = state({ zoomMode: zm, zoomPercent: zm === 'percent' ? 150 : 100 })
      expect(deserializeViewerState(serializeViewerState(original))).toEqual(original)
    }
  })

  // ── null / undefined / empty ──

  it('returns null for null', () => {
    expect(deserializeViewerState(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(deserializeViewerState(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(deserializeViewerState('')).toBeNull()
  })

  // ── missing required fields ──

  it('returns null when doc absent', () => {
    expect(deserializeViewerState('p=5&v=t&l=b&z=w')).toBeNull()
  })

  it('returns null when doc value is empty', () => {
    expect(deserializeViewerState('doc=&p=5&v=t&l=b&z=w')).toBeNull()
  })

  it('returns null when p absent', () => {
    expect(deserializeViewerState('doc=abc&v=t&l=b&z=w')).toBeNull()
  })

  it('returns null when v absent', () => {
    expect(deserializeViewerState('doc=abc&p=5&l=b&z=w')).toBeNull()
  })

  it('returns null when l absent', () => {
    expect(deserializeViewerState('doc=abc&p=5&v=t&z=w')).toBeNull()
  })

  it('returns null when z absent', () => {
    expect(deserializeViewerState('doc=abc&p=5&v=t&l=b')).toBeNull()
  })

  // ── unknown abbreviations ──

  it('returns null for unknown content view abbreviation', () => {
    expect(deserializeViewerState('doc=abc&p=5&v=x&l=b&z=w')).toBeNull()
  })

  it('returns null for unknown layout abbreviation', () => {
    expect(deserializeViewerState('doc=abc&p=5&v=t&l=x&z=w')).toBeNull()
  })

  it('returns null for unknown zoom abbreviation', () => {
    expect(deserializeViewerState('doc=abc&p=5&v=t&l=b&z=x')).toBeNull()
  })

  // ── duplicate keys ──

  it('returns null for duplicate key', () => {
    expect(deserializeViewerState('doc=abc&p=5&v=t&l=b&z=w&p=99')).toBeNull()
  })

  // ── malformed transport ──

  it('returns null for garbage string', () => {
    expect(deserializeViewerState('not_valid_transport')).toBeNull()
  })

  it('returns null for pair without equals', () => {
    expect(deserializeViewerState('doc=abc&p=5&v=t&l=b&z=w&badpair')).toBeNull()
  })

  // ── invalid numeric values ──

  it('returns null when p is not a number', () => {
    expect(deserializeViewerState('doc=abc&p=xyz&v=t&l=b&z=w')).toBeNull()
  })

  it('returns null when zz is not a number', () => {
    expect(deserializeViewerState('doc=abc&p=5&v=t&l=b&z=p&zz=xyz')).toBeNull()
  })

  // ── unknown fields ignored ──

  it('ignores unknown fields', () => {
    const result = deserializeViewerState('doc=abc&p=5&v=t&l=b&z=w&foo=bar&baz=qux')
    expect(result).not.toBeNull()
    expect(result.documentIdentity).toBe('abc')
    expect(result.currentPage).toBe(5)
  })

  // ── optional zz ──

  it('defaults zoomPercent to 100 when zz absent on percent zoom', () => {
    const result = deserializeViewerState('doc=abc&p=5&v=t&l=b&z=p')
    expect(result).not.toBeNull()
    expect(result.zoomPercent).toBe(100)
  })

  it('ignores zz when zoom is not percent (uses default)', () => {
    const result = deserializeViewerState('doc=abc&p=5&v=t&l=b&z=w&zz=999')
    expect(result).not.toBeNull()
    expect(result.zoomPercent).toBe(100)
  })

  // ── no partial state ──

  it('returns null rather than partial state', () => {
    // missing z means incomplete state — null, not a half-filled object
    expect(deserializeViewerState('doc=abc&p=5&v=t&l=b')).toBeNull()
  })

  // ── preserves unusual but valid numeric values ──

  it('preserves zero page', () => {
    const result = deserializeViewerState('doc=abc&p=0&v=t&l=b&z=w')
    expect(result).not.toBeNull()
    expect(result.currentPage).toBe(0)
  })

  it('preserves negative page', () => {
    const result = deserializeViewerState('doc=abc&p=-5&v=t&l=b&z=w')
    expect(result).not.toBeNull()
    expect(result.currentPage).toBe(-5)
  })
})

// ── Determinism ─────────────────────────────────────────────────────

describe('determinism', () => {
  it('serialize(deserialize(valid)) normalizes transport', () => {
    // input with unknown keys stripped on re-serialization
    const raw = 'doc=abc&p=5&v=t&l=b&z=w&foo=bar'
    const deserialized = deserializeViewerState(raw)
    expect(deserialized).not.toBeNull()
    const reserialized = serializeViewerState(deserialized)
    expect(reserialized).not.toContain('foo')
    expect(reserialized).toBe('doc=abc&p=5&v=t&l=b&z=w')
  })
})
