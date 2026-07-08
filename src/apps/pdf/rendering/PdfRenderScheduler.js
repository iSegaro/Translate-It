import { PdfRenderWindowState } from './PdfRenderWindowState.js'

export class PdfRenderScheduler {
  constructor() {
    this._renderWindowState = new PdfRenderWindowState()
  }

  updateWindow({ visiblePages, renderPages, primaryPage, frozen = false } = {}) {
    this._renderWindowState.update({
      visiblePages,
      renderPages,
      primaryPage,
      frozen
    })
  }

  markRendered(pageNumber) {
    this._renderWindowState.markRendered(pageNumber)
  }

  reset() {
    this._renderWindowState.reset()
  }

  getEffectiveCandidates() {
    return this._renderWindowState.getEffectiveCandidates()
  }

  hasPending() {
    return this._renderWindowState.hasPending()
  }
}
