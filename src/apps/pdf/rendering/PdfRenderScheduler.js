import { PdfRenderWindowState } from './PdfRenderWindowState.js'

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
    if (!this._renderWindowState.hasPending()) {
      return this._unchangedResult()
    }

    this._renderWindowState.markRendered(pageNumber)

    return this._candidateTransitionResult(this._renderWindowState.getEffectiveCandidates())
  }

  reset() {
    this._renderWindowState.reset()
    this._lastCandidates = new Set()
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
