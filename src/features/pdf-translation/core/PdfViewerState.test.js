import { describe, expect, it } from 'vitest'
import { createViewerState } from './PdfViewerState.js'

function minimalArgs(overrides = {}) {
  return {
    documentIdentity: 'abc123',
    currentPage: 5,
    contentView: 'translation',
    layoutMode: 'side-by-side',
    zoomMode: 'fit-width',
    zoomPercent: 100,
    ...overrides,
  }
}

describe('createViewerState', () => {
  it('returns a frozen object', () => {
    const state = createViewerState(minimalArgs())
    expect(Object.isFrozen(state)).toBe(true)
  })

  it('contains exactly six fields', () => {
    const state = createViewerState(minimalArgs())
    expect(Object.keys(state)).toEqual([
      'documentIdentity',
      'currentPage',
      'contentView',
      'layoutMode',
      'zoomMode',
      'zoomPercent',
    ])
  })

  it('preserves input values exactly', () => {
    const state = createViewerState(
      minimalArgs({ currentPage: 42, zoomMode: 'fit-page' }),
    )
    expect(state.currentPage).toBe(42)
    expect(state.zoomMode).toBe('fit-page')
  })

  it('preserves all fields from standard input', () => {
    const state = createViewerState(minimalArgs())
    expect(state.documentIdentity).toBe('abc123')
    expect(state.currentPage).toBe(5)
    expect(state.contentView).toBe('translation')
    expect(state.layoutMode).toBe('side-by-side')
    expect(state.zoomMode).toBe('fit-width')
    expect(state.zoomPercent).toBe(100)
  })

  it('does not mutate input object', () => {
    const input = minimalArgs()
    const frozen = Object.freeze({ ...input })
    createViewerState(input)
    expect(input).toEqual(frozen)
  })

  it('returns object that shares no mutable references with input', () => {
    const input = minimalArgs()
    const state = createViewerState(input)
    // Viewer State must not retain references to mutable input.
    input.currentPage = 999
    expect(state.currentPage).toBe(5)
  })

  it('preserves zero and empty values as passed', () => {
    const state = createViewerState(
      minimalArgs({
        documentIdentity: '',
        currentPage: 0,
        zoomPercent: 0,
      }),
    )
    expect(state.documentIdentity).toBe('')
    expect(state.currentPage).toBe(0)
    expect(state.zoomPercent).toBe(0)
  })

  it('preserves negative and large values as passed', () => {
    const state = createViewerState(
      minimalArgs({ currentPage: -1, zoomPercent: 9999 }),
    )
    expect(state.currentPage).toBe(-1)
    expect(state.zoomPercent).toBe(9999)
  })
})
