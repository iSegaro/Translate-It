import { describe, expect, it } from 'vitest'
import { createViewerState } from './PdfViewerState.js'

function state(overrides = {}) {
  return createViewerState({
    documentIdentity: 'abc123',
    currentPage: 5,
    contentView: 'translation',
    ...overrides,
  })
}

describe('createViewerState', () => {
  it('returns a frozen object', () => {
    const s = state()
    expect(Object.isFrozen(s)).toBe(true)
  })

  it('contains exactly three fields', () => {
    const s = state()
    expect(Object.keys(s).sort()).toEqual([
      'contentView',
      'currentPage',
      'documentIdentity',
    ])
  })

  it('preserves input values exactly', () => {
    const s = state({ currentPage: 42, contentView: 'original' })
    expect(s.currentPage).toBe(42)
    expect(s.contentView).toBe('original')
  })

  it('preserves all fields from standard input', () => {
    const s = state()
    expect(s.documentIdentity).toBe('abc123')
    expect(s.currentPage).toBe(5)
    expect(s.contentView).toBe('translation')
  })

  it('does not mutate input object', () => {
    const input = { documentIdentity: 'abc', currentPage: 1, contentView: 'original' }
    const frozen = Object.freeze({ ...input })
    createViewerState(input)
    expect(input).toEqual(frozen)
  })

  it('returns object that shares no mutable references with input', () => {
    const input = { documentIdentity: 'abc', currentPage: 1, contentView: 'original' }
    const s = createViewerState(input)
    input.currentPage = 999
    expect(s.currentPage).toBe(1)
  })

  it('preserves zero and empty values as passed', () => {
    const s = state({ documentIdentity: '', currentPage: 0 })
    expect(s.documentIdentity).toBe('')
    expect(s.currentPage).toBe(0)
  })

  it('preserves negative page as passed', () => {
    const s = state({ currentPage: -1 })
    expect(s.currentPage).toBe(-1)
  })
})
