import { PdfRenderWindowState } from './PdfRenderWindowState.js'
import { PdfRenderJobState } from './PdfRenderJobState.js'

export const PDF_RENDER_PRIORITY_GROUP = Object.freeze({
  PRIMARY_VISIBLE: 'primary-visible',
  VISIBLE: 'visible',
  NEAR_BUFFER: 'near-buffer',
  FAR_BUFFER: 'far-buffer'
})

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

function clonePlan(plan) {
  return plan.map(item => ({ ...item }))
}

export class PdfRenderScheduler {
  constructor() {
    this._renderWindowState = new PdfRenderWindowState()
    this._renderJobState = new PdfRenderJobState()
    this._lastCandidates = new Set()
    this._lastRenderPlan = []
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

    this._lastRenderPlan = this._buildRenderPlan({
      visiblePages,
      renderPages,
      primaryPage
    })

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
    this._lastRenderPlan = []
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

  getRenderPlan() {
    return clonePlan(this._lastRenderPlan)
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
      candidates: cloneSet(candidates),
      plan: this.getRenderPlan()
    }
  }

  _unchangedResult() {
    return {
      changed: false,
      candidates: cloneSet(this._lastCandidates),
      plan: this.getRenderPlan()
    }
  }

  _buildRenderPlan({ visiblePages, renderPages, primaryPage } = {}) {
    const renderSet = normalizePageSet(renderPages)
    const visibleSet = normalizePageSet(visiblePages)
    const primary = normalizePageNumber(primaryPage)
    const renderList = [...renderSet]

    return renderList
      .map(pageNumber => ({
        pageNumber,
        priorityGroup: this._resolvePriorityGroup({ pageNumber, primary, visibleSet }),
        distance: primary ? Math.abs(pageNumber - primary) : Number.MAX_SAFE_INTEGER
      }))
      .sort((a, b) => {
        const groupDelta = this._priorityGroupRank(a.priorityGroup) - this._priorityGroupRank(b.priorityGroup)
        if (groupDelta !== 0) return groupDelta

        const distanceDelta = a.distance - b.distance
        if (distanceDelta !== 0) return distanceDelta

        return a.pageNumber - b.pageNumber
      })
      .map((item, index) => ({
        pageNumber: item.pageNumber,
        priority: index,
        priorityGroup: item.priorityGroup
      }))
  }

  _resolvePriorityGroup({ pageNumber, primary, visibleSet }) {
    if (primary && pageNumber === primary && visibleSet.has(pageNumber)) {
      return PDF_RENDER_PRIORITY_GROUP.PRIMARY_VISIBLE
    }

    if (visibleSet.has(pageNumber)) {
      return PDF_RENDER_PRIORITY_GROUP.VISIBLE
    }

    const distance = primary ? Math.abs(pageNumber - primary) : Number.MAX_SAFE_INTEGER
    return distance <= 1 ? PDF_RENDER_PRIORITY_GROUP.NEAR_BUFFER : PDF_RENDER_PRIORITY_GROUP.FAR_BUFFER
  }

  _priorityGroupRank(group) {
    switch (group) {
      case PDF_RENDER_PRIORITY_GROUP.PRIMARY_VISIBLE:
        return 0
      case PDF_RENDER_PRIORITY_GROUP.VISIBLE:
        return 1
      case PDF_RENDER_PRIORITY_GROUP.NEAR_BUFFER:
        return 2
      case PDF_RENDER_PRIORITY_GROUP.FAR_BUFFER:
      default:
        return 3
    }
  }
}
