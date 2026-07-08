import { describe, expect, it } from 'vitest'
import { PdfRenderScheduler } from './PdfRenderScheduler.js'

function toArray(pageSet) {
  return [...pageSet].sort((a, b) => a - b)
}

describe('PdfRenderScheduler', () => {
  it('commits the first render window through owned state', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [2], renderPages: [1, 2, 3], primaryPage: 2, frozen: false })

    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([1, 2, 3])
    expect(scheduler.hasPending()).toBe(false)
  })

  it('keeps Phase 1B pending replacement behavior unchanged', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [1], renderPages: [1, 2, 3], primaryPage: 1 })
    scheduler.updateWindow({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })

    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([1, 2, 3, 70])
    expect(scheduler.hasPending()).toBe(true)

    scheduler.markRendered(70)

    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([69, 70, 71])
    expect(scheduler.hasPending()).toBe(false)
  })

  it('keeps overlapping windows as immediate commits', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [2], renderPages: [1, 2, 3], primaryPage: 2 })
    scheduler.updateWindow({ visiblePages: [4], renderPages: [3, 4, 5], primaryPage: 4 })

    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([3, 4, 5])
    expect(scheduler.hasPending()).toBe(false)
  })

  it('preserves committed candidates and clears pending state while frozen', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [1], renderPages: [1, 2, 3], primaryPage: 1 })
    scheduler.updateWindow({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })
    scheduler.updateWindow({ visiblePages: [90], renderPages: [89, 90, 91], primaryPage: 90, frozen: true })

    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([1, 2, 3])
    expect(scheduler.hasPending()).toBe(false)
  })

  it('resets owned state', () => {
    const scheduler = new PdfRenderScheduler()

    scheduler.updateWindow({ visiblePages: [1], renderPages: [1, 2, 3], primaryPage: 1 })
    scheduler.reset()

    expect(toArray(scheduler.getEffectiveCandidates())).toEqual([])
    expect(scheduler.hasPending()).toBe(false)
  })
})
