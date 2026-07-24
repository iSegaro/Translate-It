import { describe, expect, it, vi } from 'vitest'

import { createPresentationDispatcher } from './presentationDispatcher.js'

function createMockAdapter(overrides = {}) {
  return { dispatch: vi.fn(() => undefined), ...overrides }
}

describe('Presentation Dispatcher', () => {
  it('routes acknowledgement intent to toast adapter', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({
      adapters: { toast, banner: createMockAdapter(), 'progress-bar': createMockAdapter() }
    })

    dispatcher.dispatch({ intent: 'acknowledgement', severity: 'success', message: 'Hello' })

    expect(toast.dispatch).toHaveBeenCalledWith({ intent: 'acknowledgement', severity: 'success', message: 'Hello' })
  })

  it('routes outcome intent to banner adapter', () => {
    const banner = createMockAdapter()
    const dispatcher = createPresentationDispatcher({
      adapters: { toast: createMockAdapter(), banner, 'progress-bar': createMockAdapter() }
    })

    dispatcher.dispatch({ intent: 'outcome', notification: { id: '1', variant: 'success', title: 'T', message: 'M' } })

    expect(banner.dispatch).toHaveBeenCalledWith({ intent: 'outcome', notification: { id: '1', variant: 'success', title: 'T', message: 'M' } })
  })

  it('routes activity intent to progress adapter', () => {
    const progress = createMockAdapter()
    const dispatcher = createPresentationDispatcher({
      adapters: { toast: createMockAdapter(), banner: createMockAdapter(), 'progress-bar': progress }
    })

    dispatcher.dispatch({ intent: 'activity', running: true, title: 'Running' })

    expect(progress.dispatch).toHaveBeenCalledWith({ intent: 'activity', running: true, title: 'Running' })
  })

  it('returns early for element-scoped result', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    const result = dispatcher.dispatch({ intent: 'progress', type: 'block-translation-loading', blockId: 'b12', pageNumber: 3 })

    expect(result).toBeUndefined()
    expect(toast.dispatch).not.toHaveBeenCalled()
  })

  it('returns early for component-scoped result', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    const result = dispatcher.dispatch({ intent: 'acknowledgement', type: 'pane-empty', pane: 'translated' })

    expect(result).toBeUndefined()
    expect(toast.dispatch).not.toHaveBeenCalled()
  })

  it('returns undefined when surface has no registered adapter', () => {
    const dispatcher = createPresentationDispatcher({ adapters: {} })

    const result = dispatcher.dispatch({ intent: 'acknowledgement' })

    expect(result).toBeUndefined()
  })

  it('returns undefined when adapter has no dispatch method', () => {
    const dispatcher = createPresentationDispatcher({
      adapters: { toast: {} }
    })

    const result = dispatcher.dispatch({ intent: 'acknowledgement' })

    expect(result).toBeUndefined()
  })

  it('propagates adapter exception', () => {
    const error = new Error('Toast failed')
    const toast = { dispatch: () => { throw error } }
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    expect(() => dispatcher.dispatch({ intent: 'acknowledgement' })).toThrow(error)
  })

  it('is safe with null input', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    dispatcher.dispatch(null)

    expect(toast.dispatch).not.toHaveBeenCalled()
  })

  it('is safe with empty adapter registry', () => {
    const dispatcher = createPresentationDispatcher()

    expect(() => dispatcher.dispatch({ intent: 'acknowledgement' })).not.toThrow()
  })

  it('returns frozen dispatcher', () => {
    expect(Object.isFrozen(createPresentationDispatcher())).toBe(true)
  })

  it('has no state leakage across multiple dispatches', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    dispatcher.dispatch({ intent: 'acknowledgement' })
    dispatcher.dispatch({ intent: 'acknowledgement' })
    dispatcher.dispatch({ intent: 'activity', type: 'block-translation-loading', blockId: 'b12', pageNumber: 3 })

    expect(toast.dispatch).toHaveBeenCalledTimes(2)
  })

  it('returns undefined when adapter returns undefined', () => {
    const toast = createMockAdapter({ dispatch: () => undefined })
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    const result = dispatcher.dispatch({ intent: 'acknowledgement' })

    expect(result).toBeUndefined()
  })

  it('returns exact reference when adapter returns arbitrary object', () => {
    const handle = { updateProgress: () => {}, finish: () => {} }
    const progress = createMockAdapter({ dispatch: () => handle })
    const dispatcher = createPresentationDispatcher({ adapters: { 'progress-bar': progress } })

    const result = dispatcher.dispatch({ intent: 'activity' })

    expect(result).toBe(handle)
  })

  it('returns exact primitive when adapter returns primitive', () => {
    const progress = createMockAdapter({ dispatch: () => 42 })
    const dispatcher = createPresentationDispatcher({ adapters: { 'progress-bar': progress } })

    const result = dispatcher.dispatch({ intent: 'activity' })

    expect(result).toBe(42)
  })

  it('routes through adapter registry', () => {
    const toast = createMockAdapter()
    const banner = createMockAdapter()
    const progress = createMockAdapter()

    const dispatcher = createPresentationDispatcher({
      adapters: { toast, banner, 'progress-bar': progress }
    })

    dispatcher.dispatch({ intent: 'acknowledgement' })
    dispatcher.dispatch({ intent: 'outcome' })
    dispatcher.dispatch({ intent: 'activity' })

    expect(toast.dispatch).toHaveBeenCalledTimes(1)
    expect(banner.dispatch).toHaveBeenCalledTimes(1)
    expect(progress.dispatch).toHaveBeenCalledTimes(1)
  })

  it('never invokes adapters for non-Global results', () => {
    const toast = createMockAdapter()
    const dispatcher = createPresentationDispatcher({ adapters: { toast } })

    dispatcher.dispatch({ intent: 'acknowledgement', type: 'block-translation-loading', blockId: 'b12', pageNumber: 3 })
    dispatcher.dispatch({ intent: 'outcome', type: 'pane-empty', pane: 'translated' })
    dispatcher.dispatch({ intent: 'activity', type: 'page-ocr-complete', pageNumber: 5 })

    expect(toast.dispatch).not.toHaveBeenCalled()
  })
})
