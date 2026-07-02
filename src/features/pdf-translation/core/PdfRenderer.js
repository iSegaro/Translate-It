import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { PdfTextLayerRenderer } from './PdfTextLayerRenderer.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfRenderer')
const RENDER_CLEANUP_DELAY_MS = 200

export class PdfRenderer {
  constructor({ scheduleTimeout, cancelTimeout } = {}) {
    this.renderTasks = new Map()
    this._cleanupTimeout = null
    this._scheduleTimeout = scheduleTimeout || ((fn, ms) => setTimeout(fn, ms))
    this._cancelTimeout = cancelTimeout || ((id) => clearTimeout(id))
  }

  async renderPage(pdfDocument, metric, pageNumber, canvasEl, textLayerRenderer) {
    if (!pdfDocument || !canvasEl || !metric) return false

    const previous = this.renderTasks.get(pageNumber)
    previous?.cancel?.()

    const page = await pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: metric.scale })

    canvasEl.width = Math.floor(viewport.width)
    canvasEl.height = Math.floor(viewport.height)
    canvasEl.style.width = `${Math.floor(viewport.width)}px`
    canvasEl.style.height = `${Math.floor(viewport.height)}px`

    const context = canvasEl.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!context) {
      throw new Error('Canvas 2D context not available')
    }

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      intent: 'display'
    })

    this.renderTasks.set(pageNumber, renderTask)

    try {
      await renderTask.promise
      if (textLayerRenderer instanceof PdfTextLayerRenderer) {
        const cw = Math.floor(viewport.width)
        const ch = Math.floor(viewport.height)
        await textLayerRenderer.render(page, viewport, cw, ch)
      }
      return true
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') {
        logger.warn(`Failed to render page ${pageNumber}:`, error)
      }
      return false
    } finally {
      if (this.renderTasks.get(pageNumber) === renderTask) {
        this.renderTasks.delete(pageNumber)
      }
      page.cleanup?.()
    }
  }

  clearPage(pageNumber, canvasEl, textLayerRenderer) {
    this.renderTasks.get(pageNumber)?.cancel?.()
    this.renderTasks.delete(pageNumber)

    if (canvasEl) {
      const context = canvasEl.getContext('2d')
      context?.clearRect(0, 0, canvasEl.width, canvasEl.height)
      canvasEl.width = 0
      canvasEl.height = 0
    }

    if (textLayerRenderer instanceof PdfTextLayerRenderer) {
      textLayerRenderer.clear()
    }
  }

  cancelAll() {
    for (const renderTask of this.renderTasks.values()) {
      renderTask.cancel?.()
    }
    this.renderTasks.clear()
  }

  cancelScheduledCleanup() {
    if (this._cleanupTimeout) {
      this._cancelTimeout(this._cleanupTimeout)
      this._cleanupTimeout = null
    }
  }

  scheduleCleanup(visiblePageNumbers) {
    this.cancelScheduledCleanup()

    this._cleanupTimeout = this._scheduleTimeout(() => {
      this._cleanupTimeout = null
      for (const [pageNumber, renderTask] of this.renderTasks.entries()) {
        if (!visiblePageNumbers.has(pageNumber)) {
          renderTask.cancel?.()
        }
      }
    }, RENDER_CLEANUP_DELAY_MS)
  }

  destroy() {
    this.cancelScheduledCleanup()
    this.cancelAll()
  }
}
