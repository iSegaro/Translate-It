import { describe, expect, it } from 'vitest'
import { PDF_RENDER_JOB_STATE, PdfRenderJobState } from './PdfRenderJobState.js'

describe('PdfRenderJobState', () => {
  it('returns idle for unknown pages', () => {
    const jobs = new PdfRenderJobState()

    expect(jobs.getState(1)).toBe(PDF_RENDER_JOB_STATE.IDLE)
  })

  it('tracks started and committed transitions', () => {
    const jobs = new PdfRenderJobState()

    jobs.markStarted(3)
    expect(jobs.getState(3)).toBe(PDF_RENDER_JOB_STATE.RENDERING)

    jobs.markCommitted(3)
    expect(jobs.getState(3)).toBe(PDF_RENDER_JOB_STATE.COMMITTED)
  })

  it('tracks failed and cancelled transitions', () => {
    const jobs = new PdfRenderJobState()

    jobs.markFailed(4)
    jobs.markCancelled(5)

    expect(jobs.getState(4)).toBe(PDF_RENDER_JOB_STATE.FAILED)
    expect(jobs.getState(5)).toBe(PDF_RENDER_JOB_STATE.CANCELLED)
  })

  it('resets one page without clearing others', () => {
    const jobs = new PdfRenderJobState()

    jobs.markStarted(1)
    jobs.markCommitted(2)
    jobs.resetPage(1)

    expect(jobs.getState(1)).toBe(PDF_RENDER_JOB_STATE.IDLE)
    expect(jobs.getState(2)).toBe(PDF_RENDER_JOB_STATE.COMMITTED)
  })

  it('resets all pages', () => {
    const jobs = new PdfRenderJobState()

    jobs.markStarted(1)
    jobs.markFailed(2)
    jobs.reset()

    expect(jobs.getState(1)).toBe(PDF_RENDER_JOB_STATE.IDLE)
    expect(jobs.getState(2)).toBe(PDF_RENDER_JOB_STATE.IDLE)
    expect(jobs.snapshot().size).toBe(0)
  })

  it('ignores invalid page numbers', () => {
    const jobs = new PdfRenderJobState()

    jobs.markStarted(0)
    jobs.markCommitted(-1)
    jobs.markFailed(1.5)
    jobs.markCancelled(Number.NaN)

    expect(jobs.snapshot().size).toBe(0)
    expect(jobs.getState(0)).toBe(PDF_RENDER_JOB_STATE.IDLE)
  })

  it('returns a defensive snapshot', () => {
    const jobs = new PdfRenderJobState()

    jobs.markStarted(1)
    const snapshot = jobs.snapshot()
    snapshot.set(2, PDF_RENDER_JOB_STATE.FAILED)

    expect(jobs.getState(2)).toBe(PDF_RENDER_JOB_STATE.IDLE)
  })
})
