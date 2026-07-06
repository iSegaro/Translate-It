import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { PdfTextLayerRenderer } from './PdfTextLayerRenderer.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfRenderer')
const RENDER_CLEANUP_DELAY_MS = 200

const CANVAS_ID_KEY = Symbol('pdfRendererCanvasId')

export class PdfRenderer {
  constructor({ scheduleTimeout, cancelTimeout } = {}) {
    this.renderTasks = new Map()
    this._cleanupTimeout = null
    this._scheduleTimeout = scheduleTimeout || ((fn, ms) => setTimeout(fn, ms))
    this._cancelTimeout = cancelTimeout || ((id) => clearTimeout(id))
    this._nextCanvasId = 0
  }

  _getCanvasId(canvasEl) {
    if (!canvasEl) return ''
    if (!canvasEl[CANVAS_ID_KEY]) {
      canvasEl[CANVAS_ID_KEY] = String(++this._nextCanvasId)
    }
    return canvasEl[CANVAS_ID_KEY]
  }

  _taskKey(pageNumber, canvasEl) {
    return `${pageNumber}:${this._getCanvasId(canvasEl)}`
  }

  static _parsePageNumber(key) {
    const colon = key.indexOf(':')
    return colon > 0 ? Number(key.slice(0, colon)) : NaN
  }

  async renderPage({
    pdfDocument,
    metric,
    pageNumber,
    canvas: canvasEl,
    textLayerRenderer,
    pageSession
  }) {
    if (!pdfDocument || !canvasEl || !metric) return false

    const key = this._taskKey(pageNumber, canvasEl)
    const previous = this.renderTasks.get(key)
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

    this.renderTasks.set(key, renderTask)

    try {
      await renderTask.promise
      if (textLayerRenderer instanceof PdfTextLayerRenderer) {
        const cw = Math.floor(viewport.width)
        const ch = Math.floor(viewport.height)
        const textContent = pageSession?.textContent ?? null
        await textLayerRenderer.render(page, viewport, cw, ch, textContent)
      }
      return true
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') {
        logger.warn(`Failed to render page ${pageNumber}:`, error)
      }
      return false
    } finally {
      if (this.renderTasks.get(key) === renderTask) {
        this.renderTasks.delete(key)
      }
      page.cleanup?.()
    }
  }

  clearPage(pageNumber, canvasEl, textLayerRenderer) {
    const key = this._taskKey(pageNumber, canvasEl)
    this.renderTasks.get(key)?.cancel?.()
    this.renderTasks.delete(key)

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

  // keepSet contains pages that should remain render/session active
  // (visible pages + render candidates).
  scheduleCleanup(keepSet, onCleanup) {
    this.cancelScheduledCleanup()

    this._cleanupTimeout = this._scheduleTimeout(() => {
      this._cleanupTimeout = null
      for (const [key, renderTask] of this.renderTasks.entries()) {
        const pageNumber = PdfRenderer._parsePageNumber(key)
        if (!Number.isFinite(pageNumber) || !keepSet.has(pageNumber)) {
          renderTask.cancel?.()
        }
      }
      onCleanup?.()
    }, RENDER_CLEANUP_DELAY_MS)
  }

  destroy() {
    this.cancelScheduledCleanup()
    this.cancelAll()
  }
}
