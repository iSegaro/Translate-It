import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearPendingViewerState,
  getPendingViewerState,
  setPendingViewerState,
} from './PendingViewerState.js'
import { createViewerState } from './PdfViewerState.js'

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

describe('PendingViewerState', () => {
  beforeEach(() => {
    clearPendingViewerState()
  })

  it('initial value is null', () => {
    expect(getPendingViewerState()).toBeNull()
  })

  it('set stores Viewer State', () => {
    const s = state()
    setPendingViewerState(s)
    expect(getPendingViewerState()).toBe(s)
  })

  it('get returns the same reference', () => {
    const s = state()
    setPendingViewerState(s)
    expect(getPendingViewerState()).toBe(s)
  })

  it('set replaces previous state', () => {
    const first = state()
    const second = state({ currentPage: 99 })
    setPendingViewerState(first)
    setPendingViewerState(second)
    expect(getPendingViewerState()).toBe(second)
    expect(getPendingViewerState()).not.toBe(first)
  })

  it('set accepts null', () => {
    setPendingViewerState(state())
    setPendingViewerState(null)
    expect(getPendingViewerState()).toBeNull()
  })

  it('clear returns state to null', () => {
    setPendingViewerState(state())
    clearPendingViewerState()
    expect(getPendingViewerState()).toBeNull()
  })

  it('clear is idempotent', () => {
    clearPendingViewerState()
    clearPendingViewerState()
    expect(getPendingViewerState()).toBeNull()
  })

  it('stored state remains immutable', () => {
    const s = state()
    setPendingViewerState(s)
    const retrieved = getPendingViewerState()
    expect(Object.isFrozen(retrieved)).toBe(true)
  })

  it('module performs no cloning', () => {
    const s = state()
    setPendingViewerState(s)
    // If the module cloned, the references would differ
    expect(getPendingViewerState()).toBe(s)
  })
})
