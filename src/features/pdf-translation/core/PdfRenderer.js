import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { PDF_PAGE_BACKGROUND, PDF_MAX_PAGE_RASTER_PIXELS, PDF_MAX_CANVAS_DIMENSION, PDF_MAX_PAGE_RASTER_BYTES, PDF_MIN_RASTER_OUTPUT_SCALE } from './pdfRenderingConstants.js'
import { resolvePdfRasterPlan } from './PdfRasterPlan.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfRenderer')

const CANVAS_ID_KEY = Symbol('pdfRendererCanvasId')

export const PDF_RENDER_RESULT_STATUS = Object.freeze({
  SUCCESS: 'success',
  CANCELLED: 'cancelled',
  FAILED: 'failed'
})

export function createPdfRenderResult(status, error = null, bitmap = null, raster = null) {
  const result = error ? { status, error } : { status }
  if (bitmap) result.bitmap = bitmap
  if (raster) result.raster = raster
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
    canvas: canvasEl
  }) {
    if (!pdfDocument || !canvasEl || !metric) {
      return createPdfRenderResult(PDF_RENDER_RESULT_STATUS.FAILED)
    }

    const key = this._taskKey(pageNumber, canvasEl)
    const previous = this.renderTasks.get(key)
    previous?.cancel?.()

    const page = await pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: metric.scale })

    const plan = resolvePdfRasterPlan({
      logicalWidth: Math.floor(viewport.width),
      logicalHeight: Math.floor(viewport.height),
      maxRasterPixels: PDF_MAX_PAGE_RASTER_PIXELS,
      maxCanvasDimension: PDF_MAX_CANVAS_DIMENSION,
      maxEstimatedBytes: PDF_MAX_PAGE_RASTER_BYTES,
      minRasterOutputScale: PDF_MIN_RASTER_OUTPUT_SCALE
    })

    if (!plan.renderable) {
      return createPdfRenderResult(PDF_RENDER_RESULT_STATUS.FAILED, null, null, plan)
    }

    const hasReusableCanvas = canvasEl.width > 0 && canvasEl.height > 0
    const renderCanvas = hasReusableCanvas ? document.createElement('canvas') : canvasEl
    renderCanvas.width = plan.backingWidth
    renderCanvas.height = plan.backingHeight

    canvasEl.style.width = `${plan.logicalWidth}px`
    canvasEl.style.height = `${plan.logicalHeight}px`

    const context = renderCanvas.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!context) {
      throw new Error('Canvas 2D context not available')
    }

    context.fillStyle = PDF_PAGE_BACKGROUND
    context.fillRect(0, 0, plan.backingWidth, plan.backingHeight)

    const renderParams = {
      canvasContext: context,
      viewport,
      intent: 'display'
    }

    if (plan.degraded) {
      renderParams.transform = [plan.rasterScaleX, 0, 0, plan.rasterScaleY, 0, 0]
    }

    const renderTask = page.render(renderParams)

    this.renderTasks.set(key, renderTask)

    try {
      await renderTask.promise

      if (hasReusableCanvas) {
        canvasEl.width = plan.backingWidth
        canvasEl.height = plan.backingHeight
        const visibleCtx = canvasEl.getContext('2d', { alpha: false })
        visibleCtx.drawImage(renderCanvas, 0, 0)
      }

      let bitmap = null
      try {
        bitmap = await createImageBitmap(renderCanvas)
      } catch {
        // Bitmap creation failed — continue without cache entry
      }
      return createPdfRenderResult(PDF_RENDER_RESULT_STATUS.SUCCESS, null, bitmap, plan)
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

    textLayerRenderer?.clear?.()
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

  destroy() {
    this.cancelAll()
  }
}
