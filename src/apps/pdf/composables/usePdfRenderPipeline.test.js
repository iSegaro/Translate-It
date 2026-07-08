import { describe, expect, it, vi } from 'vitest'
import { usePdfRenderPipeline } from './usePdfRenderPipeline.js'

function toArray(set) {
  return [...set].sort((a, b) => a - b)
}

function createMockDeps(overrides = {}) {
  return {
    isOriginalRole: { value: true },
    freezeRenderWindowEviction: { value: false },
    getContainer: vi.fn(() => ({
      scrollTop: 0,
      clientHeight: 600,
      getBoundingClientRect: () => ({ top: 0, left: 0, right: 300, bottom: 600, width: 300, height: 600 })
    })),
    getPageView: vi.fn(() => null),
    onVisiblePagesChange: vi.fn(),
    onRenderCandidatesChange: vi.fn(),
    ...overrides
  }
}

describe('usePdfRenderPipeline', () => {
  it('initializes with empty state', () => {
    const deps = createMockDeps()
    const pipeline = usePdfRenderPipeline(deps)

    expect(toArray(pipeline.renderCandidatePageNumbers.value)).toEqual([])
    expect(toArray(pipeline.renderAllowedPageNumbers.value)).toEqual([])
    expect(pipeline.getRenderPriority(1)).toBeNull()
    expect(pipeline.getRenderPriorityGroup(1)).toBe('')
    expect(pipeline.isRenderAllowed(1)).toBe(false)
  })

  it('exposes all expected methods', () => {
    const deps = createMockDeps()
    const pipeline = usePdfRenderPipeline(deps)

    expect(typeof pipeline.applyRenderWindow).toBe('function')
    expect(typeof pipeline.scheduleRenderWindowUpdate).toBe('function')
    expect(typeof pipeline.cancelRenderWindowFrame).toBe('function')
    expect(typeof pipeline.handleRenderStarted).toBe('function')
    expect(typeof pipeline.handleRenderCommitted).toBe('function')
    expect(typeof pipeline.handleRenderCancelled).toBe('function')
    expect(typeof pipeline.handleRenderFailed).toBe('function')
    expect(typeof pipeline.onFreezeChange).toBe('function')
    expect(typeof pipeline.reset).toBe('function')
  })

  it('handleRenderStarted does not crash without prior window setup', () => {
    const deps = createMockDeps()
    const pipeline = usePdfRenderPipeline(deps)

    expect(() => pipeline.handleRenderStarted(1)).not.toThrow()
  })

  it('handleRenderCommitted does not crash without prior window setup', () => {
    const deps = createMockDeps()
    const pipeline = usePdfRenderPipeline(deps)

    expect(() => pipeline.handleRenderCommitted(1)).not.toThrow()
  })

  it('handleRenderFailed does not crash without prior window setup', () => {
    const deps = createMockDeps()
    const pipeline = usePdfRenderPipeline(deps)

    expect(() => pipeline.handleRenderFailed(1)).not.toThrow()
  })

  it('handleRenderCancelled does not crash without prior window setup', () => {
    const deps = createMockDeps()
    const pipeline = usePdfRenderPipeline(deps)

    expect(() => pipeline.handleRenderCancelled(1)).not.toThrow()
  })

  it('does not call session callbacks for overlay role', () => {
    const deps = createMockDeps({
      isOriginalRole: { value: false }
    })
    const pipeline = usePdfRenderPipeline(deps)

    pipeline.handleRenderStarted(1)

    expect(deps.onVisiblePagesChange).not.toHaveBeenCalled()
    expect(deps.onRenderCandidatesChange).not.toHaveBeenCalled()
  })

  it('reset clears all state and calls callbacks', () => {
    const deps = createMockDeps()
    const pipeline = usePdfRenderPipeline(deps)

    pipeline.handleRenderStarted(1)
    pipeline.reset()

    expect(toArray(pipeline.renderCandidatePageNumbers.value)).toEqual([])
    expect(toArray(pipeline.renderAllowedPageNumbers.value)).toEqual([])
    expect(pipeline.isRenderAllowed(1)).toBe(false)
    expect(deps.onVisiblePagesChange).toHaveBeenCalledWith(new Set())
    expect(deps.onRenderCandidatesChange).toHaveBeenCalledWith(new Set())
  })

  it('cancelRenderWindowFrame is callable without error', () => {
    const deps = createMockDeps()
    const pipeline = usePdfRenderPipeline(deps)

    expect(() => pipeline.cancelRenderWindowFrame()).not.toThrow()
  })

  it('onFreezeChange does not crash', () => {
    const deps = createMockDeps()
    const pipeline = usePdfRenderPipeline(deps)

    expect(() => pipeline.onFreezeChange()).not.toThrow()
  })

  it('getRenderPriority returns null for unknown page', () => {
    const deps = createMockDeps()
    const pipeline = usePdfRenderPipeline(deps)

    expect(pipeline.getRenderPriority(999)).toBeNull()
    expect(pipeline.getRenderPriorityGroup(999)).toBe('')
  })

  it('isRenderAllowed returns false for unknown page', () => {
    const deps = createMockDeps()
    const pipeline = usePdfRenderPipeline(deps)

    expect(pipeline.isRenderAllowed(999)).toBe(false)
  })
})
