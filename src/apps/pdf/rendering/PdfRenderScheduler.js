import { PdfRenderWindowState } from './PdfRenderWindowState.js'
import { PDF_RENDER_JOB_STATE, PdfRenderJobState } from './PdfRenderJobState.js'

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
    this._lastRenderAllowedPages = new Set()
  }

  updateWindow({ visiblePages, renderPages, primaryPage, frozen = false } = {}) {
    this._renderWindowState.update({
      visiblePages,
      renderPages,
      primaryPage,
      frozen
    })

    if (frozen) {
      return this._result({ candidatesChanged: false, renderAllowedChanged: false })
    }

    this._lastRenderPlan = this._buildRenderPlan({
      visiblePages,
      renderPages,
      primaryPage
    })

    const candidatesChanged = this._applyCandidateTransition(this._renderWindowState.getEffectiveCandidates())
    const renderAllowedChanged = this._applyRenderAllowedPages()

    return this._result({ candidatesChanged, renderAllowedChanged })
  }

  markRendered(pageNumber) {
    this._renderJobState.markCommitted(pageNumber)

    if (!this._renderWindowState.hasPending()) {
      const renderAllowedChanged = this._applyRenderAllowedPages()
      return this._result({ candidatesChanged: false, renderAllowedChanged })
    }

    this._renderWindowState.markRendered(pageNumber)

    const candidatesChanged = this._applyCandidateTransition(this._renderWindowState.getEffectiveCandidates())
    const renderAllowedChanged = this._applyRenderAllowedPages()

    return this._result({ candidatesChanged, renderAllowedChanged })
  }

  reset() {
    this._renderWindowState.reset()
    this._renderJobState.reset()
    this._lastCandidates = new Set()
    this._lastRenderPlan = []
    this._lastRenderAllowedPages = new Set()
  }

  markRenderStarted(pageNumber) {
    this._renderJobState.markStarted(pageNumber)
    const renderAllowedChanged = this._applyRenderAllowedPages()
    return this._result({ candidatesChanged: false, renderAllowedChanged })
  }

  markRenderFailed(pageNumber) {
    this._renderJobState.markFailed(pageNumber)
    const renderAllowedChanged = this._applyRenderAllowedPages()
    return this._result({ candidatesChanged: false, renderAllowedChanged })
  }

  markRenderCancelled(pageNumber) {
    this._renderJobState.markCancelled(pageNumber)
    const renderAllowedChanged = this._applyRenderAllowedPages()
    return this._result({ candidatesChanged: false, renderAllowedChanged })
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

  getRenderAllowedPages() {
    return cloneSet(this._lastRenderAllowedPages)
  }

  getEffectiveCandidates() {
    return this._renderWindowState.getEffectiveCandidates()
  }

  hasPending() {
    return this._renderWindowState.hasPending()
  }

  _applyCandidateTransition(candidates) {
    if (setsEqual(this._lastCandidates, candidates)) {
      return false
    }

    this._lastCandidates = cloneSet(candidates)
    return true
  }

  _applyRenderAllowedPages() {
    const nextAllowedPages = this._buildRenderAllowedPages()
    if (setsEqual(this._lastRenderAllowedPages, nextAllowedPages)) {
      return false
    }

    this._lastRenderAllowedPages = nextAllowedPages
    return true
  }

  _result({ candidatesChanged, renderAllowedChanged }) {
    return {
      changed: candidatesChanged,
      candidates: cloneSet(this._lastCandidates),
      plan: this.getRenderPlan(),
      renderAllowedChanged,
      renderAllowedPages: this.getRenderAllowedPages()
    }
  }

  _buildRenderAllowedPages() {
    const candidatePages = cloneSet(this._lastCandidates)
    const visibleItems = this._lastRenderPlan.filter(item => (
      item.priorityGroup === PDF_RENDER_PRIORITY_GROUP.PRIMARY_VISIBLE ||
      item.priorityGroup === PDF_RENDER_PRIORITY_GROUP.VISIBLE
    ))

    if (visibleItems.length === 0) {
      return candidatePages
    }

    const primaryItem = visibleItems.find(item => item.priorityGroup === PDF_RENDER_PRIORITY_GROUP.PRIMARY_VISIBLE)
    if (!primaryItem) {
      return new Set(visibleItems.map(item => item.pageNumber))
    }

    if (!this._hasRenderStarted(primaryItem.pageNumber)) {
      return new Set([primaryItem.pageNumber])
    }

    const visiblePages = new Set(visibleItems.map(item => item.pageNumber))
    const allVisibleStarted = visibleItems.every(item => this._hasRenderStarted(item.pageNumber))
    return allVisibleStarted ? candidatePages : visiblePages
  }

  _hasRenderStarted(pageNumber) {
    return this._renderJobState.getState(pageNumber) !== PDF_RENDER_JOB_STATE.IDLE
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
