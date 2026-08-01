import { createPdfRegion } from './PdfRegion.js'

/**
 * Map a page-local CSS rectangle into canonical PDF user space.
 *
 * @param {object} params
 * @param {number} params.pageNumber
 * @param {{x: number, y: number, width: number, height: number}} params.rect
 * @param {object} params.viewport
 * @returns {Readonly<object>|null}
 */
export function mapPageLocalCssRectToPdfRegion({ pageNumber, rect, viewport } = {}) {
  const { x, y, width, height } = rect || {}
  if (![x, y, width, height].every(Number.isFinite)) return null
  if (width <= 0 || height <= 0) return null
  if (typeof viewport?.convertToPdfPoint !== 'function') return null

  const points = [
    viewport.convertToPdfPoint(x, y),
    viewport.convertToPdfPoint(x + width, y),
    viewport.convertToPdfPoint(x, y + height),
    viewport.convertToPdfPoint(x + width, y + height)
  ]
  const xs = points.map((point) => point?.[0])
  const ys = points.map((point) => point?.[1])

  return createPdfRegion({
    pageNumber,
    left: Math.min(...xs),
    top: Math.max(...ys),
    right: Math.max(...xs),
    bottom: Math.min(...ys)
  })
}
