import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { PdfTextLayerRenderer } from './PdfTextLayerRenderer.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfRenderer')

const CANVAS_ID_KEY = Symbol('pdfRendererCanvasId')
const PDF_PAGE_BACKGROUND = '#fff'

export const PDF_RENDER_RESULT_STATUS = Object.freeze({
  SUCCESS: 'success',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
})

export function createPdfRenderResult(status, error = null, bitmap = null) {
  const result = error ? { status, error } : { status }
  if (bitmap) result.bitmap = bitmap
  return result
}

export class PdfRenderer {
  constructor() {
    this.renderTasks = new Map()
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
    if (!pdfDocument || !canvasEl || !metric) {
      return createPdfRenderResult(PDF_RENDER_RESULT_STATUS.FAILED)
    }

    const key = this._taskKey(pageNumber, canvasEl)
    const previous = this.renderTasks.get(key)
    previous?.cancel?.()

    const page = await pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: metric.scale })

    const newWidth = Math.floor(viewport.width)
    const newHeight = Math.floor(viewport.height)

    const hasReusableCanvas = canvasEl.width > 0 && canvasEl.height > 0
    const renderCanvas = hasReusableCanvas ? document.createElement('canvas') : canvasEl
    renderCanvas.width = newWidth
    renderCanvas.height = newHeight

    canvasEl.style.width = `${newWidth}px`
    canvasEl.style.height = `${newHeight}px`

    const context = renderCanvas.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!context) {
      throw new Error('Canvas 2D context not available')
    }

    context.fillStyle = PDF_PAGE_BACKGROUND
    context.fillRect(0, 0, newWidth, newHeight)

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      intent: 'display'
    })

    this.renderTasks.set(key, renderTask)

    try {
      await renderTask.promise

      // Create bitmap for cache before blitting to visible canvas
      let bitmap = null
      try {
        bitmap = await createImageBitmap(renderCanvas)
      } catch {
        // Bitmap creation failed — continue without cache entry
      }

      if (hasReusableCanvas) {
        canvasEl.width = newWidth
        canvasEl.height = newHeight
        const visibleCtx = canvasEl.getContext('2d', { alpha: false })
        visibleCtx.drawImage(renderCanvas, 0, 0)
      }
      if (textLayerRenderer instanceof PdfTextLayerRenderer) {
        const cw = Math.floor(viewport.width)
        const ch = Math.floor(viewport.height)
        const textContent = pageSession?.textContent ?? null
        await textLayerRenderer.render({
          pageNumber,
          viewport,
          containerWidth: cw,
          containerHeight: ch,
          textContent,
          page
        })
      }
      return createPdfRenderResult(PDF_RENDER_RESULT_STATUS.SUCCESS, null, bitmap)
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') {
        logger.warn(`Failed to render page ${pageNumber}:`, error)
      }
      return createPdfRenderResult(
        error?.name === 'RenderingCancelledException'
          ? PDF_RENDER_RESULT_STATUS.CANCELLED
          : PDF_RENDER_RESULT_STATUS.FAILED,
        error
      )
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

  cancelRender(pageNumber, canvasEl) {
    const key = this._taskKey(pageNumber, canvasEl)
    const renderTask = this.renderTasks.get(key)
    if (!renderTask) return false

    renderTask.cancel?.()
    this.renderTasks.delete(key)
    return true
  }

  cancelAll() {
    for (const renderTask of this.renderTasks.values()) {
      renderTask.cancel?.()
    }
    this.renderTasks.clear()
  }

  cancelRendersOutside(keepSet) {
    for (const [key, renderTask] of this.renderTasks.entries()) {
      const pageNumber = PdfRenderer._parsePageNumber(key)
      if (!Number.isFinite(pageNumber) || !keepSet.has(pageNumber)) {
        renderTask.cancel?.()
      }
    }
  }

  destroy() {
    this.cancelAll()
  }
}
