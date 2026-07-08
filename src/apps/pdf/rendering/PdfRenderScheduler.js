import { PdfRenderWindowState } from './PdfRenderWindowState.js'
import { PdfRenderJobState } from './PdfRenderJobState.js'

function cloneSet(values) {
  return new Set(values)
}

function setsEqual(first, second) {
  if (first.size !== second.size) return false

  for (const value of first) {
    if (!second.has(value)) return false
  }

  return true
}

export class PdfRenderScheduler {
  constructor() {
    this._renderWindowState = new PdfRenderWindowState()
    this._renderJobState = new PdfRenderJobState()
    this._lastCandidates = new Set()
  }

  updateWindow({ visiblePages, renderPages, primaryPage, frozen = false } = {}) {
    this._renderWindowState.update({
      visiblePages,
      renderPages,
      primaryPage,
      frozen
    })

    if (frozen) {
      return this._unchangedResult()
    }

    return this._candidateTransitionResult(this._renderWindowState.getEffectiveCandidates())
  }

  markRendered(pageNumber) {
    this._renderJobState.markCommitted(pageNumber)

    if (!this._renderWindowState.hasPending()) {
      return this._unchangedResult()
    }

    this._renderWindowState.markRendered(pageNumber)

    return this._candidateTransitionResult(this._renderWindowState.getEffectiveCandidates())
  }

  reset() {
    this._renderWindowState.reset()
    this._renderJobState.reset()
    this._lastCandidates = new Set()
  }

  markRenderStarted(pageNumber) {
    this._renderJobState.markStarted(pageNumber)
  }

  markRenderFailed(pageNumber) {
    this._renderJobState.markFailed(pageNumber)
  }

  markRenderCancelled(pageNumber) {
    this._renderJobState.markCancelled(pageNumber)
  }

  getRenderJobState(pageNumber) {
    return this._renderJobState.getState(pageNumber)
  }

  getRenderJobSnapshot() {
    return this._renderJobState.snapshot()
  }

  getEffectiveCandidates() {
    return this._renderWindowState.getEffectiveCandidates()
  }

  hasPending() {
    return this._renderWindowState.hasPending()
  }

  _candidateTransitionResult(candidates) {
    if (setsEqual(this._lastCandidates, candidates)) {
      return this._unchangedResult()
    }

    this._lastCandidates = cloneSet(candidates)
    return {
      changed: true,
      candidates: cloneSet(candidates)
    }
  }

  _unchangedResult() {
    return {
      changed: false,
      candidates: cloneSet(this._lastCandidates)
    }
  }
}
