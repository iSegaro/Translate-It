import { describe, expect, it } from 'vitest'
import { PDF_RENDER_JOB_STATE } from './PdfRenderJobState.js'
import { PDF_RENDER_PRIORITY_GROUP, PdfRenderScheduler } from './PdfRenderScheduler.js'

function toArray(pageSet) {
  return [...pageSet].sort((a, b) => a - b)
}

describe('PdfRenderScheduler', () => {
  it('commits the first render window through owned state', () => {
    const scheduler = new PdfRenderScheduler()

    const result = scheduler.updateWindow({ visiblePages: [2], renderPages: [1, 2, 3], primaryPage: 2, frozen: false })

    expect(result.changed).toBe(true)
    expect(toArray(result.candidates)).toEqual([1, 2, 3])
    expect(result.plan.map(item => item.pageNumber)).toEqual([2, 1, 3])
    expect(toArray(result.renderAllowedPages)).toEqual([2])
    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([1, 2, 3])
    expect(scheduler.hasPending()).toBe(false)
  })

  it('allows only the primary visible page before render starts', () => {
    const scheduler = new PdfRenderScheduler()

    const result = scheduler.updateWindow({
      visiblePages: [2, 3],
      renderPages: [1, 2, 3, 4],
      primaryPage: 2
    })

    expect(result.renderAllowedChanged).toBe(true)
    expect(toArray(result.renderAllowedPages)).toEqual([2])
  })

  it('allows remaining visible pages after primary starts', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({
      visiblePages: [2, 3],
      renderPages: [1, 2, 3, 4],
      primaryPage: 2
    })
    const result = scheduler.markRenderStarted(2)

    expect(result.renderAllowedChanged).toBe(true)
    expect(toArray(result.renderAllowedPages)).toEqual([2, 3])
  })

  it('allows buffer pages after visible pages have started', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({
      visiblePages: [2, 3],
      renderPages: [1, 2, 3, 4],
      primaryPage: 2
    })
    scheduler.markRenderStarted(2)
    const result = scheduler.markRenderStarted(3)

    expect(result.renderAllowedChanged).toBe(true)
    expect(toArray(result.renderAllowedPages)).toEqual([1, 2, 3, 4])
  })

  it('allows visible pages when no primary exists', () => {
    const scheduler = new PdfRenderScheduler()

    const result = scheduler.updateWindow({
      visiblePages: [2, 3],
      renderPages: [1, 2, 3, 4],
      primaryPage: null
    })

    expect(toArray(result.renderAllowedPages)).toEqual([2, 3])
  })

  it('allows effective candidates when no visible pages exist', () => {
    const scheduler = new PdfRenderScheduler()

    const result = scheduler.updateWindow({
      visiblePages: [],
      renderPages: [1, 2],
      primaryPage: null
    })

    expect(toArray(result.renderAllowedPages)).toEqual([1, 2])
  })

  it('failed primary does not block visible-page eligibility', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({
      visiblePages: [2, 3],
      renderPages: [1, 2, 3, 4],
      primaryPage: 2
    })
    const result = scheduler.markRenderFailed(2)

    expect(result.renderAllowedChanged).toBe(true)
    expect(toArray(result.renderAllowedPages)).toEqual([2, 3])
  })

  it('orders render plan by primary, visible pages, then buffer distance', () => {
    const scheduler = new PdfRenderScheduler()

    const result = scheduler.updateWindow({
      visiblePages: [9, 10],
      renderPages: [1, 8, 9, 10, 11, 12],
      primaryPage: 10
    })

    expect(result.plan).toEqual([
      { pageNumber: 10, priority: 0, priorityGroup: PDF_RENDER_PRIORITY_GROUP.PRIMARY_VISIBLE },
      { pageNumber: 9, priority: 1, priorityGroup: PDF_RENDER_PRIORITY_GROUP.VISIBLE },
      { pageNumber: 11, priority: 2, priorityGroup: PDF_RENDER_PRIORITY_GROUP.NEAR_BUFFER },
      { pageNumber: 8, priority: 3, priorityGroup: PDF_RENDER_PRIORITY_GROUP.FAR_BUFFER },
      { pageNumber: 12, priority: 4, priorityGroup: PDF_RENDER_PRIORITY_GROUP.FAR_BUFFER },
      { pageNumber: 1, priority: 5, priorityGroup: PDF_RENDER_PRIORITY_GROUP.FAR_BUFFER }
    ])
  })

  it('keeps render plan ordering deterministic', () => {
    const scheduler = new PdfRenderScheduler()

    const first = scheduler.updateWindow({
      visiblePages: [5, 6],
      renderPages: [8, 4, 6, 5, 7],
      primaryPage: 6
    }).plan
    const second = scheduler.updateWindow({
      visiblePages: [5, 6],
      renderPages: [8, 4, 6, 5, 7],
      primaryPage: 6
    }).plan

    expect(first).toEqual(second)
    expect(first.map(item => item.pageNumber)).toEqual([6, 5, 7, 4, 8])
  })

  it('does not report false changes for repeated equivalent updates', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [2], renderPages: [1, 2, 3], primaryPage: 2 })
    const result = scheduler.updateWindow({ visiblePages: [2], renderPages: [1, 2, 3], primaryPage: 2 })

    expect(result.changed).toBe(false)
    expect(toArray(result.candidates)).toEqual([1, 2, 3])
  })

  it('keeps Phase 1B pending replacement behavior unchanged', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [1], renderPages: [1, 2, 3], primaryPage: 1 })
    const pendingResult = scheduler.updateWindow({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })

    expect(pendingResult.changed).toBe(true)
    expect(toArray(pendingResult.candidates)).toEqual([1, 2, 3, 70])
    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([1, 2, 3, 70])
    expect(scheduler.hasPending()).toBe(true)

    const commitResult = scheduler.markRendered(70)

    expect(commitResult.changed).toBe(true)
    expect(toArray(commitResult.candidates)).toEqual([69, 70, 71])
    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([69, 70, 71])
    expect(scheduler.hasPending()).toBe(false)
    expect(scheduler.getRenderJobState(70)).toBe(PDF_RENDER_JOB_STATE.COMMITTED)
  })

  it('stores render job lifecycle state', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.markRenderStarted(2)
    expect(scheduler.getRenderJobState(2)).toBe(PDF_RENDER_JOB_STATE.RENDERING)

    scheduler.markRenderFailed(2)
    expect(scheduler.getRenderJobState(2)).toBe(PDF_RENDER_JOB_STATE.FAILED)

    scheduler.markRenderCancelled(3)
    expect(scheduler.getRenderJobState(3)).toBe(PDF_RENDER_JOB_STATE.CANCELLED)
  })

  it('resets render job state with scheduler reset', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.markRenderStarted(1)
    scheduler.updateWindow({ visiblePages: [1], renderPages: [1, 2, 3], primaryPage: 1 })
    scheduler.reset()

    expect(scheduler.getRenderJobState(1)).toBe(PDF_RENDER_JOB_STATE.IDLE)
    expect(scheduler.getRenderJobSnapshot().size).toBe(0)
  })

  it('reports pending commit change only once', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [1], renderPages: [1, 2, 3], primaryPage: 1 })
    scheduler.updateWindow({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })

    expect(scheduler.markRendered(70).changed).toBe(true)
    const repeatedCommit = scheduler.markRendered(70)

    expect(repeatedCommit.changed).toBe(false)
    expect(toArray(repeatedCommit.candidates)).toEqual([69, 70, 71])
  })

  it('reports no change for stale rendered pages', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [1], renderPages: [1, 2, 3], primaryPage: 1 })
    scheduler.updateWindow({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })
    const result = scheduler.markRendered(69)

    expect(result.changed).toBe(false)
    expect(toArray(result.candidates)).toEqual([1, 2, 3, 70])
    expect(scheduler.hasPending()).toBe(true)
  })

  it('keeps overlapping windows as immediate commits', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [2], renderPages: [1, 2, 3], primaryPage: 2 })
    const result = scheduler.updateWindow({ visiblePages: [4], renderPages: [3, 4, 5], primaryPage: 4 })

    expect(result.changed).toBe(true)
    expect(toArray(result.candidates)).toEqual([3, 4, 5])
    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([3, 4, 5])
    expect(scheduler.hasPending()).toBe(false)
  })

  it('preserves committed candidates and clears pending state while frozen', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [1], renderPages: [1, 2, 3], primaryPage: 1 })
    scheduler.updateWindow({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })
    const result = scheduler.updateWindow({ visiblePages: [90], renderPages: [89, 90, 91], primaryPage: 90, frozen: true })

    expect(result.changed).toBe(false)
    expect(toArray(result.candidates)).toEqual([1, 2, 3, 70])
    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([1, 2, 3])
    expect(scheduler.hasPending()).toBe(false)
  })

  it('resets owned state', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [1], renderPages: [1, 2, 3], primaryPage: 1 })
    scheduler.reset()

    expect(toArray(scheduler.updateWindow({}).candidates)).toEqual([])
    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([])
    expect(scheduler.hasPending()).toBe(false)
  })
})
