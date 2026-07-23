import { describe, expect, it, vi } from 'vitest'

import { createPresentationDispatcher } from './presentationDispatcher.js'

function createMockAdapter(overrides = {}) {
  return { dispatch: vi.fn(() => undefined), ...overrides }
}

describe('Presentation Dispatcher', () => {
  it('routes global acknowledgement result to toast adapter', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({
      adapters: { toast, banner: createMockAdapter(), 'progress-bar': createMockAdapter() }
    })

    dispatcher.dispatch({ type: 'export-completed' })

    expect(toast.dispatch).toHaveBeenCalledWith({ type: 'export-completed' })
  })

  it('routes global persistent-information result to banner adapter', () => {
    const banner = createMockAdapter()
    const dispatcher = createPresentationDispatcher({
      adapters: { toast: createMockAdapter(), banner, 'progress-bar': createMockAdapter() }
    })

    dispatcher.dispatch({ type: 'comparison-completed' })

    expect(banner.dispatch).toHaveBeenCalledWith({ type: 'comparison-completed' })
  })

  it('routes global progress result to progress adapter', () => {
    const progress = createMockAdapter()
    const dispatcher = createPresentationDispatcher({
      adapters: { toast: createMockAdapter(), banner: createMockAdapter(), 'progress-bar': progress }
    })

    dispatcher.dispatch({ type: 'translation-progress' })

    expect(progress.dispatch).toHaveBeenCalledWith({ type: 'translation-progress' })
  })

  it('returns early for component-scoped result', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    const result = dispatcher.dispatch({ type: 'pane-empty', pane: 'translated' })

    expect(result).toBeUndefined()
    expect(toast.dispatch).not.toHaveBeenCalled()
  })

  it('returns early for element-scoped result', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    const result = dispatcher.dispatch({ type: 'block-translation-loading', blockId: 'b12', pageNumber: 3 })

    expect(result).toBeUndefined()
    expect(toast.dispatch).not.toHaveBeenCalled()
  })

  it('returns early for element-scoped result with pageNumber', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    const result = dispatcher.dispatch({ type: 'page-ocr-complete', pageNumber: 5 })

    expect(result).toBeUndefined()
    expect(toast.dispatch).not.toHaveBeenCalled()
  })

  it('returns undefined when surface has no registered adapter', () => {
    const dispatcher = createPresentationDispatcher({ adapters: {} })

    const result = dispatcher.dispatch({ type: 'export-completed' })

    expect(result).toBeUndefined()
  })

  it('returns undefined when adapter has no dispatch method', () => {
    const dispatcher = createPresentationDispatcher({
      adapters: { toast: {} }
    })

    const result = dispatcher.dispatch({ type: 'export-completed' })

    expect(result).toBeUndefined()
  })

  it('propagates adapter exception', () => {
    const error = new Error('Toast failed')
    const toast = { dispatch: () => { throw error } }
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    expect(() => dispatcher.dispatch({ type: 'export-completed' })).toThrow(error)
  })

  it('falls through to toast for unknown result type', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    dispatcher.dispatch({ type: 'nonexistent-type' })

    expect(toast.dispatch).toHaveBeenCalledWith({ type: 'nonexistent-type' })
  })

  it('falls through to toast for null result', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    dispatcher.dispatch(null)

    expect(toast.dispatch).toHaveBeenCalledWith(null)
  })

  it('is safe with empty adapter registry', () => {
    const dispatcher = createPresentationDispatcher()

    expect(() => dispatcher.dispatch({ type: 'export-completed' })).not.toThrow()
    expect(() => dispatcher.dispatch({ type: 'pane-empty', pane: 'translated' })).not.toThrow()
    expect(() => dispatcher.dispatch(null)).not.toThrow()
  })

  it('returns frozen dispatcher', () => {
    const dispatcher = createPresentationDispatcher()
    expect(Object.isFrozen(dispatcher)).toBe(true)
  })

  it('has no state leakage across multiple dispatches', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    dispatcher.dispatch({ type: 'export-completed' })
    dispatcher.dispatch({ type: 'export-failed' })
    dispatcher.dispatch({ type: 'pane-empty', pane: 'translated' })

    expect(toast.dispatch).toHaveBeenCalledTimes(2)
  })

  it('returns undefined when adapter returns undefined', () => {
    const toast = createMockAdapter({ dispatch: () => undefined })
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    const result = dispatcher.dispatch({ type: 'export-completed' })

    expect(result).toBeUndefined()
  })

  it('returns exact reference when adapter returns arbitrary object', () => {
    const handle = { updateProgress: () => {}, finish: () => {} }
    const progress = createMockAdapter({ dispatch: () => handle })
    const dispatcher = createPresentationDispatcher({ adapters: { 'progress-bar': progress } })

    const result = dispatcher.dispatch({ type: 'translation-progress' })

    expect(result).toBe(handle)
  })

  it('returns exact primitive when adapter returns primitive', () => {
    const progress = createMockAdapter({ dispatch: () => 42 })
    const dispatcher = createPresentationDispatcher({ adapters: { 'progress-bar': progress } })

    const result = dispatcher.dispatch({ type: 'translation-progress' })

    expect(result).toBe(42)
  })

  it('routes through adapter registry', () => {
    const toast = createMockAdapter()
    const banner = createMockAdapter()
    const progress = createMockAdapter()

    const dispatcher = createPresentationDispatcher({
      adapters: { toast, banner, 'progress-bar': progress }
    })

    dispatcher.dispatch({ type: 'export-completed' })
    dispatcher.dispatch({ type: 'comparison-completed' })
    dispatcher.dispatch({ type: 'translation-progress' })

    expect(toast.dispatch).toHaveBeenCalledTimes(1)
    expect(banner.dispatch).toHaveBeenCalledTimes(1)
    expect(progress.dispatch).toHaveBeenCalledTimes(1)
  })

  it('never invokes adapters for non-Global results — registry lookup not reached', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    dispatcher.dispatch({ type: 'block-translation-loading', blockId: 'b12', pageNumber: 3 })
    dispatcher.dispatch({ type: 'pane-empty', pane: 'translated' })
    dispatcher.dispatch({ type: 'page-ocr-complete', pageNumber: 5 })

    expect(toast.dispatch).not.toHaveBeenCalled()
  })
})
