import { describe, expect, it } from 'vitest'
import { PdfRenderWindowState } from './PdfRenderWindowState.js'

function toArray(pageSet) {
  return [...pageSet].sort((a, b) => a - b)
}

describe('PdfRenderWindowState', () => {
  it('commits the first valid render window immediately', () => {
    const state = new PdfRenderWindowState()

    state.update({ visiblePages: [2], renderPages: [1, 2, 3], primaryPage: 2 })

    expect(toArray(state.getCommittedCandidates())).toEqual([1, 2, 3])
    expect(toArray(state.getEffectiveCandidates())).toEqual([1, 2, 3])
    expect(state.hasPending()).toBe(false)
  })

  it('commits overlapping render windows immediately', () => {
    const state = new PdfRenderWindowState()
    state.update({ visiblePages: [2], renderPages: [1, 2, 3], primaryPage: 2 })

    state.update({ visiblePages: [4], renderPages: [3, 4, 5], primaryPage: 4 })

    expect(toArray(state.getCommittedCandidates())).toEqual([3, 4, 5])
    expect(toArray(state.getEffectiveCandidates())).toEqual([3, 4, 5])
    expect(state.hasPending()).toBe(false)
  })

  it('creates a pending replacement for a forward disjoint jump', () => {
    const state = new PdfRenderWindowState()
    state.update({ visiblePages: [1], renderPages: [1, 2], primaryPage: 1 })

    state.update({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })

    expect(toArray(state.getCommittedCandidates())).toEqual([1, 2])
    expect(toArray(state.getEffectiveCandidates())).toEqual([1, 2, 70])
    expect(state.hasPending()).toBe(true)
  })

  it('creates a pending replacement for a reverse disjoint jump', () => {
    const state = new PdfRenderWindowState()
    state.update({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })

    state.update({ visiblePages: [1], renderPages: [1, 2], primaryPage: 1 })

    expect(toArray(state.getCommittedCandidates())).toEqual([69, 70, 71])
    expect(toArray(state.getEffectiveCandidates())).toEqual([1, 69, 70, 71])
    expect(state.hasPending()).toBe(true)
  })

  it('ignores stale markRendered calls outside the pending destination', () => {
    const state = new PdfRenderWindowState()
    state.update({ visiblePages: [1], renderPages: [1, 2], primaryPage: 1 })
    state.update({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })

    state.markRendered(2)
    state.markRendered(69)

    expect(toArray(state.getCommittedCandidates())).toEqual([1, 2])
    expect(state.hasPending()).toBe(true)
  })

  it('commits pending replacement after destination page renders', () => {
    const state = new PdfRenderWindowState()
    state.update({ visiblePages: [1], renderPages: [1, 2], primaryPage: 1 })
    state.update({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })

    state.markRendered(70)

    expect(toArray(state.getCommittedCandidates())).toEqual([69, 70, 71])
    expect(toArray(state.getEffectiveCandidates())).toEqual([69, 70, 71])
    expect(state.hasPending()).toBe(false)
  })

  it('commits pending replacement when the pending primary page renders even if not visible', () => {
    const state = new PdfRenderWindowState()
    state.update({ visiblePages: [1], renderPages: [1, 2], primaryPage: 1 })
    state.update({ visiblePages: [], renderPages: [69, 70, 71], primaryPage: 70 })

    state.markRendered(70)

    expect(toArray(state.getCommittedCandidates())).toEqual([69, 70, 71])
    expect(state.hasPending()).toBe(false)
  })

  it('supersedes pending replacement with a newer disjoint jump', () => {
    const state = new PdfRenderWindowState()
    state.update({ visiblePages: [1], renderPages: [1, 2], primaryPage: 1 })
    state.update({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })

    state.update({ visiblePages: [90], renderPages: [89, 90, 91], primaryPage: 90 })

    expect(toArray(state.getCommittedCandidates())).toEqual([1, 2])
    expect(toArray(state.getEffectiveCandidates())).toEqual([1, 2, 90])
    expect(state.hasPending()).toBe(true)

    state.markRendered(70)
    expect(toArray(state.getCommittedCandidates())).toEqual([1, 2])
    expect(state.hasPending()).toBe(true)

    state.markRendered(90)
    expect(toArray(state.getCommittedCandidates())).toEqual([89, 90, 91])
    expect(state.hasPending()).toBe(false)
  })

  it('clears only pending state', () => {
    const state = new PdfRenderWindowState()
    state.update({ visiblePages: [1], renderPages: [1, 2], primaryPage: 1 })
    state.update({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })

    state.clearPending()

    expect(toArray(state.getCommittedCandidates())).toEqual([1, 2])
    expect(toArray(state.getEffectiveCandidates())).toEqual([1, 2])
    expect(state.hasPending()).toBe(false)
  })

  it('resets all internal state', () => {
    const state = new PdfRenderWindowState()
    state.update({ visiblePages: [1], renderPages: [1, 2], primaryPage: 1 })
    state.update({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })

    state.reset()

    expect(toArray(state.getCommittedCandidates())).toEqual([])
    expect(toArray(state.getEffectiveCandidates())).toEqual([])
    expect(state.hasPending()).toBe(false)
  })

  it('keeps committed pages and pending destination pages as effective candidates during pending', () => {
    const state = new PdfRenderWindowState()
    state.update({ visiblePages: [10], renderPages: [9, 10, 11], primaryPage: 10 })

    state.update({ visiblePages: [50, 51], renderPages: [49, 50, 51, 52], primaryPage: 50 })

    expect(toArray(state.getEffectiveCandidates())).toEqual([9, 10, 11, 50, 51])
  })

  it('normalizes empty and invalid inputs', () => {
    const state = new PdfRenderWindowState()

    state.update({ visiblePages: [1], renderPages: [], primaryPage: 1 })
    expect(toArray(state.getCommittedCandidates())).toEqual([])

    state.update({ visiblePages: ['2', 0, -1, 2.5, Number.NaN], renderPages: ['1', 2, 2, null], primaryPage: '2' })
    expect(toArray(state.getCommittedCandidates())).toEqual([1, 2])
    expect(toArray(state.getEffectiveCandidates())).toEqual([1, 2])
    expect(state.hasPending()).toBe(false)
  })

  it('frozen update preserves committed state and clears pending state', () => {
    const state = new PdfRenderWindowState()
    state.update({ visiblePages: [1], renderPages: [1, 2], primaryPage: 1 })
    state.update({ visiblePages: [70], renderPages: [69, 70, 71], primaryPage: 70 })

    state.update({ visiblePages: [90], renderPages: [89, 90, 91], primaryPage: 90, frozen: true })

    expect(toArray(state.getCommittedCandidates())).toEqual([1, 2])
    expect(toArray(state.getEffectiveCandidates())).toEqual([1, 2])
    expect(state.hasPending()).toBe(false)
  })
})
