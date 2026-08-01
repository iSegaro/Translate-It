import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clear, read, write } from './PdfBrowserTabState.js'

let historyState
let replaceState

beforeEach(() => {
  historyState = null
  replaceState = vi.fn((state) => {
    historyState = state
  })
  globalThis.history = {
    get state() {
      return historyState
    },
    replaceState,
  }
})

afterEach(() => {
  // @ts-ignore
  delete globalThis.history
})

describe('PdfBrowserTabState', () => {
  it('returns null for empty history state', () => {
    expect(read()).toBeNull()
  })

  it('reads state after writing it', () => {
    write({ value: 'picker-state' })

    expect(read()).toEqual({ value: 'picker-state' })
  })

  it('overwrites only its namespace', () => {
    write({ value: 'first' })
    write({ value: 'second' })

    expect(read()).toEqual({ value: 'second' })
  })

  it('preserves unrelated history state when writing', () => {
    historyState = { unrelated: { value: true } }

    write({ value: 'picker-state' })

    expect(historyState.unrelated).toEqual({ value: true })
    expect(read()).toEqual({ value: 'picker-state' })
  })

  it('clears its namespace', () => {
    write({ value: 'picker-state' })
    clear()

    expect(read()).toBeNull()
  })

  it('preserves unrelated history state when clearing', () => {
    historyState = {
      unrelated: { value: true },
      pdfBrowserTabState: { value: 'picker-state' },
    }

    clear()

    expect(historyState).toEqual({ unrelated: { value: true } })
    expect(replaceState).toHaveBeenCalledOnce()
  })

  it.each([123, true, 'abc', Symbol('state')])('handles invalid history state: %s', (invalidState) => {
    historyState = invalidState

    expect(() => read()).not.toThrow()
    expect(read()).toBeNull()
    expect(() => write({ value: 'picker-state' })).not.toThrow()
    expect(read()).toEqual({ value: 'picker-state' })

    historyState = invalidState
    expect(() => clear()).not.toThrow()
    expect(historyState).toBe(invalidState)
  })
})
