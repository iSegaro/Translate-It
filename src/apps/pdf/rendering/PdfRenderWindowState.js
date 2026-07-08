function normalizePageNumber(value) {
  const pageNumber = Number(value)
  return Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null
}

function normalizePageSet(values) {
  const normalized = new Set()

  if (!values || typeof values[Symbol.iterator] !== 'function') {
    return normalized
  }

  for (const value of values) {
    const pageNumber = normalizePageNumber(value)
    if (pageNumber) {
      normalized.add(pageNumber)
    }
  }

  return normalized
}

function setsOverlap(first, second) {
  for (const value of first) {
    if (second.has(value)) return true
  }

  return false
}

function cloneSet(values) {
  return new Set(values)
}

export class PdfRenderWindowState {
  constructor() {
    this.reset()
  }

  update({ visiblePages, renderPages, primaryPage, frozen = false } = {}) {
    if (frozen) {
      this.clearPending()
      return
    }

    const nextCommitted = normalizePageSet(renderPages)
    if (nextCommitted.size === 0) {
      return
    }

    const nextVisible = normalizePageSet(visiblePages)
    const nextPrimary = normalizePageNumber(primaryPage)

    if (this._committedCandidates.size === 0 || setsOverlap(this._committedCandidates, nextCommitted)) {
      this._commit({ renderPages: nextCommitted })
      return
    }

    this._pendingReplacement = {
      renderPages: nextCommitted,
      visiblePages: nextVisible,
      primaryPage: nextPrimary
    }
  }

  markRendered(pageNumber) {
    const renderedPage = normalizePageNumber(pageNumber)
    if (!renderedPage || !this._pendingReplacement) return

    if (!this._isPendingDestinationPage(renderedPage)) return

    this._commit({ renderPages: this._pendingReplacement.renderPages })
  }

  reset() {
    this._committedCandidates = new Set()
    this._pendingReplacement = null
  }

  clearPending() {
    this._pendingReplacement = null
  }

  getEffectiveCandidates() {
    const effectiveCandidates = cloneSet(this._committedCandidates)

    if (!this._pendingReplacement) {
      return effectiveCandidates
    }

    for (const pageNumber of this._pendingReplacement.visiblePages) {
      effectiveCandidates.add(pageNumber)
    }

    if (this._pendingReplacement.primaryPage) {
      effectiveCandidates.add(this._pendingReplacement.primaryPage)
    }

    return effectiveCandidates
  }

  getCommittedCandidates() {
    return cloneSet(this._committedCandidates)
  }

  hasPending() {
    return !!this._pendingReplacement
  }

  _commit({ renderPages }) {
    this._committedCandidates = cloneSet(renderPages)
    this.clearPending()
  }

  _isPendingDestinationPage(pageNumber) {
    return this._pendingReplacement.visiblePages.has(pageNumber) || this._pendingReplacement.primaryPage === pageNumber
  }
}
