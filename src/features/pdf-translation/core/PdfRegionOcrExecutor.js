import { recognizeStructured } from '@/features/screen-capture/services/ocrEngine.js'
import { createPdfRegion } from './PdfRegion.js'

const RECOGNIZED_STATUS = 'recognized'
const CANCELLED_STATUS = 'cancelled'
const FAILED_STATUS = 'failed'

function createOutcome(status, payload = {}) {
  return { status, ...payload }
}

function isCanonicalPdfRegion(region) {
  return Object.isFrozen(region) && createPdfRegion(region) !== null
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function mapRegionToViewportBounds(region, viewport) {
  const points = [
    viewport.convertToViewportPoint(region.left, region.top),
    viewport.convertToViewportPoint(region.right, region.top),
    viewport.convertToViewportPoint(region.left, region.bottom),
    viewport.convertToViewportPoint(region.right, region.bottom)
  ]

  if (!points.every((point) => Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]))) {
    throw new Error('Viewport returned invalid region coordinates')
  }
  if (!Number.isFinite(viewport.width) || viewport.width <= 0) {
    throw new Error('Viewport width must be a positive finite number')
  }
  if (!Number.isFinite(viewport.height) || viewport.height <= 0) {
    throw new Error('Viewport height must be a positive finite number')
  }

  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const maxWidth = Math.ceil(viewport.width)
  const maxHeight = Math.ceil(viewport.height)
  const x = clamp(Math.floor(Math.min(...xs)), 0, maxWidth)
  const y = clamp(Math.floor(Math.min(...ys)), 0, maxHeight)
  const right = clamp(Math.ceil(Math.max(...xs)), x, maxWidth)
  const bottom = clamp(Math.ceil(Math.max(...ys)), y, maxHeight)

  return {
    x,
    y,
    width: right - x,
    height: bottom - y
  }
}

export class PdfRegionOcrExecutor {
  constructor({ pdfDocument, recognize = recognizeStructured, createCanvas = () => document.createElement('canvas') } = {}) {
    this.pdfDocument = pdfDocument
    this.recognize = recognize
    this.createCanvas = createCanvas
  }

  execute({ region, scale, language } = {}) {
    let cancelled = false
    let renderTask = null

    const cancel = () => {
      cancelled = true
      renderTask?.cancel?.()
    }

    const promise = (async () => {
      let canvas = null

      try {
        if (!isCanonicalPdfRegion(region)) {
          throw new TypeError('A canonical PdfRegion is required')
        }
        if (!Number.isFinite(scale) || scale <= 0) {
          throw new RangeError('Scale must be a positive finite number')
        }
        if (typeof this.pdfDocument?.getPage !== 'function') {
          throw new TypeError('A PDFDocumentProxy is required')
        }

        const page = await this.pdfDocument.getPage(region.pageNumber)
        if (cancelled) return createOutcome(CANCELLED_STATUS)
        if (!page?.getViewport || !page?.render) {
          throw new TypeError('A PDFPageProxy is required')
        }

        const viewport = page.getViewport({ scale })
        const bounds = mapRegionToViewportBounds(region, viewport)
        if (bounds.width <= 0 || bounds.height <= 0) {
          throw new RangeError('Mapped region is empty')
        }

        canvas = this.createCanvas()
        canvas.width = bounds.width
        canvas.height = bounds.height
        const context = canvas.getContext?.('2d', { alpha: false })
        if (!context) {
          throw new Error('Canvas 2D context not available')
        }

        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: [1, 0, 0, 1, -bounds.x, -bounds.y],
          intent: 'display'
        })
        if (cancelled) renderTask.cancel?.()

        await renderTask.promise
        renderTask = null
        if (cancelled) return createOutcome(CANCELLED_STATUS)

        const data = await this.recognize(canvas, language)
        if (cancelled) return createOutcome(CANCELLED_STATUS)

        return createOutcome(RECOGNIZED_STATUS, { data })
      } catch (error) {
        if (cancelled || error?.name === 'RenderingCancelledException') {
          return createOutcome(CANCELLED_STATUS)
        }

        return createOutcome(FAILED_STATUS, { error })
      } finally {
        renderTask = null
        if (canvas) {
          canvas.width = 0
          canvas.height = 0
        }
      }
    })()

    return { promise, cancel }
  }
}
