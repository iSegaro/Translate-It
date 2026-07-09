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

function createPageElement(pageNumber, top, height = 100, container) {
  return {
    dataset: { pageNumber: String(pageNumber) },
    getBoundingClientRect: () => ({
      top: top - Number(container.scrollTop || 0),
      bottom: top - Number(container.scrollTop || 0) + height,
      left: 0,
      right: 300,
      width: 300,
      height
    })
  }
}

function createContainer({ scrollTop = 100, clientHeight = 150, pageCount = 8, pageHeight = 100 } = {}) {
  const container = {
    scrollTop,
    clientHeight,
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 300, bottom: clientHeight, width: 300, height: clientHeight }),
    querySelectorAll: vi.fn(() => container.pages)
  }
  container.pages = Array.from({ length: pageCount }, (_, index) => (
    createPageElement(index + 1, index * pageHeight, pageHeight, container)
  ))
  return container
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
    pipeline.reset()

    expect(deps.onVisiblePagesChange).not.toHaveBeenCalled()
    expect(deps.onRenderCandidatesChange).not.toHaveBeenCalled()
  })

  it('overlay role expands local allowed pages after primary render starts', () => {
    const container = createContainer({ scrollTop: 100, clientHeight: 150 })
    const deps = createMockDeps({
      isOriginalRole: { value: false },
      getContainer: vi.fn(() => container)
    })
    const pipeline = usePdfRenderPipeline(deps)

    pipeline.applyRenderWindow()

    expect(toArray(pipeline.renderCandidatePageNumbers.value)).toEqual([1, 2, 3, 4])
    expect(toArray(pipeline.renderAllowedPageNumbers.value)).toEqual([2])

    pipeline.handleRenderStarted(2)

    expect(toArray(pipeline.renderAllowedPageNumbers.value)).toEqual([2, 3])
    expect(deps.onVisiblePagesChange).not.toHaveBeenCalled()
    expect(deps.onRenderCandidatesChange).not.toHaveBeenCalled()
  })

  it('overlay role commits pending render window replacement after destination render commits', () => {
    const container = createContainer({ scrollTop: 0, clientHeight: 100 })
    const deps = createMockDeps({
      isOriginalRole: { value: false },
      getContainer: vi.fn(() => container)
    })
    const pipeline = usePdfRenderPipeline(deps)

    pipeline.applyRenderWindow()
    expect(toArray(pipeline.renderCandidatePageNumbers.value)).toEqual([1, 2])

    container.scrollTop = 600
    pipeline.applyRenderWindow()
    expect(toArray(pipeline.renderCandidatePageNumbers.value)).toEqual([1, 2, 7])

    pipeline.handleRenderCommitted(7)

    expect(toArray(pipeline.renderCandidatePageNumbers.value)).toEqual([6, 7, 8])
    expect(deps.onVisiblePagesChange).not.toHaveBeenCalled()
    expect(deps.onRenderCandidatesChange).not.toHaveBeenCalled()
  })

  it('overlay role handles failed and cancelled lifecycle events locally', () => {
    const container = createContainer({ scrollTop: 100, clientHeight: 150 })
    const deps = createMockDeps({
      isOriginalRole: { value: false },
      getContainer: vi.fn(() => container)
    })
    const pipeline = usePdfRenderPipeline(deps)

    pipeline.applyRenderWindow()
    pipeline.handleRenderFailed(2)

    expect(toArray(pipeline.renderAllowedPageNumbers.value)).toEqual([2, 3])

    pipeline.handleRenderCancelled(3)

    expect(toArray(pipeline.renderAllowedPageNumbers.value)).toEqual([1, 2, 3, 4])
    expect(deps.onVisiblePagesChange).not.toHaveBeenCalled()
    expect(deps.onRenderCandidatesChange).not.toHaveBeenCalled()
  })

  it('original role still updates shared callbacks and local lifecycle state', () => {
    const container = createContainer({ scrollTop: 100, clientHeight: 150 })
    const deps = createMockDeps({
      getContainer: vi.fn(() => container)
    })
    const pipeline = usePdfRenderPipeline(deps)

    pipeline.applyRenderWindow()
    pipeline.handleRenderStarted(2)

    expect(toArray(pipeline.renderAllowedPageNumbers.value)).toEqual([2, 3])
    expect(deps.onVisiblePagesChange).toHaveBeenCalledWith(new Set([2, 3]))
    expect(deps.onRenderCandidatesChange).toHaveBeenCalledWith(new Set([1, 2, 3, 4]))
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
