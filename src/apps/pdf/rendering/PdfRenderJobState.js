export const PDF_RENDER_JOB_STATE = Object.freeze({
  IDLE: 'idle',
  RENDERING: 'rendering',
  COMMITTED: 'committed',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
})

function normalizePageNumber(value) {
  const pageNumber = Number(value)
  return Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null
}

export class PdfRenderJobState {
  constructor() {
    this._jobs = new Map()
  }

  markStarted(pageNumber) {
    this._setState(pageNumber, PDF_RENDER_JOB_STATE.RENDERING)
  }

  markCommitted(pageNumber) {
    this._setState(pageNumber, PDF_RENDER_JOB_STATE.COMMITTED)
  }

  markFailed(pageNumber) {
    this._setState(pageNumber, PDF_RENDER_JOB_STATE.FAILED)
  }

  markCancelled(pageNumber) {
    this._setState(pageNumber, PDF_RENDER_JOB_STATE.CANCELLED)
  }

  resetPage(pageNumber) {
    const normalized = normalizePageNumber(pageNumber)
    if (!normalized) return

    this._jobs.delete(normalized)
  }

  reset() {
    this._jobs.clear()
  }

  getState(pageNumber) {
    const normalized = normalizePageNumber(pageNumber)
    if (!normalized) return PDF_RENDER_JOB_STATE.IDLE

    return this._jobs.get(normalized) || PDF_RENDER_JOB_STATE.IDLE
  }

  snapshot() {
    return new Map(this._jobs)
  }

  _setState(pageNumber, state) {
    const normalized = normalizePageNumber(pageNumber)
    if (!normalized) return

    this._jobs.set(normalized, state)
  }
}
