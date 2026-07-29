import { describe, expect, it } from 'vitest'
import { createViewerState } from './PdfViewerState.js'
import { deserializeViewerState, serializeViewerState } from './PdfViewerStateTransport.js'

function state(overrides = {}) {
  return createViewerState({
    documentIdentity: 'abc123',
    currentPage: 5,
    contentView: 'translation',
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

  it('does not mutate input', () => {
    const input = state()
    const frozen = Object.freeze({
      documentIdentity: input.documentIdentity,
      currentPage: input.currentPage,
      contentView: input.contentView,
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

  it('round-trips all content views', () => {
    for (const cv of ['original', 'translation', 'translated-pdf']) {
      const original = state({ contentView: cv })
      expect(deserializeViewerState(serializeViewerState(original))).toEqual(original)
    }
  })

  it('returns null for null', () => {
    expect(deserializeViewerState(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(deserializeViewerState(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(deserializeViewerState('')).toBeNull()
  })

  it('returns null when doc absent', () => {
    expect(deserializeViewerState('p=5&v=t')).toBeNull()
  })

  it('returns null when doc value is empty', () => {
    expect(deserializeViewerState('doc=&p=5&v=t')).toBeNull()
  })

  it('returns null when p absent', () => {
    expect(deserializeViewerState('doc=abc&v=t')).toBeNull()
  })

  it('returns null when v absent', () => {
    expect(deserializeViewerState('doc=abc&p=5')).toBeNull()
  })

  it('returns null for unknown content view abbreviation', () => {
    expect(deserializeViewerState('doc=abc&p=5&v=x')).toBeNull()
  })

  it('returns null for duplicate key', () => {
    expect(deserializeViewerState('doc=abc&p=5&v=t&p=99')).toBeNull()
  })

  it('returns null for garbage string', () => {
    expect(deserializeViewerState('not_valid_transport')).toBeNull()
  })

  it('returns null for pair without equals', () => {
    expect(deserializeViewerState('doc=abc&p=5&v=t&badpair')).toBeNull()
  })

  it('returns null when p is not a number', () => {
    expect(deserializeViewerState('doc=abc&p=xyz&v=t')).toBeNull()
  })

  it('ignores unknown fields', () => {
    const result = deserializeViewerState('doc=abc&p=5&v=t&foo=bar')
    expect(result).not.toBeNull()
    expect(result.documentIdentity).toBe('abc')
    expect(result.currentPage).toBe(5)
  })

  it('preserves zero page', () => {
    const result = deserializeViewerState('doc=abc&p=0&v=t')
    expect(result).not.toBeNull()
    expect(result.currentPage).toBe(0)
  })

  it('preserves negative page', () => {
    const result = deserializeViewerState('doc=abc&p=-5&v=t')
    expect(result).not.toBeNull()
    expect(result.currentPage).toBe(-5)
  })
})

// ── Determinism ─────────────────────────────────────────────────────

describe('determinism', () => {
  it('serialize(deserialize(valid)) normalizes transport', () => {
    const raw = 'doc=abc&p=5&v=t&foo=bar'
    const deserialized = deserializeViewerState(raw)
    expect(deserialized).not.toBeNull()
    const reserialized = serializeViewerState(deserialized)
    expect(reserialized).not.toContain('foo')
    expect(reserialized).toBe('doc=abc&p=5&v=t')
  })
})
