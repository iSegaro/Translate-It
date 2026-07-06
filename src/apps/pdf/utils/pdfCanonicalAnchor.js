import {
  getElementViewportRect,
  getPageGeometry,
  getPageRatio,
  getScrollMetrics,
  getScrollSpaceTop
} from './pdfGeometryModel.js'

const ANCHOR_SOURCE = Object.freeze({
  DOM: 'dom',
  PDF: 'pdf',
  GEOMETRY: 'geometry'
})

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function normalizePageNumber(pageNumber) {
  const numeric = Number(pageNumber)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0
}

function isValidAnchorSource(source) {
  return Object.values(ANCHOR_SOURCE).includes(source)
}

function createCanonicalAnchor({
  pageNumber,
  pageRatio = 0,
  source = ANCHOR_SOURCE.GEOMETRY,
  pdfPoint = null,
  domOffset = null
} = {}) {
  const normalizedPageNumber = normalizePageNumber(pageNumber)
  if (!normalizedPageNumber) return null

  const anchor = {
    pageNumber: normalizedPageNumber,
    pageRatio: clampRatio(toFiniteNumber(pageRatio)),
    source: isValidAnchorSource(source) ? source : ANCHOR_SOURCE.GEOMETRY
  }

  if (pdfPoint && Number.isFinite(Number(pdfPoint.x)) && Number.isFinite(Number(pdfPoint.y))) {
    anchor.pdfPoint = {
      x: Number(pdfPoint.x),
      y: Number(pdfPoint.y)
    }
  }

  if (domOffset && Number.isFinite(Number(domOffset.top))) {
    anchor.domOffset = {
      top: Number(domOffset.top),
      left: Number.isFinite(Number(domOffset.left)) ? Number(domOffset.left) : 0
    }
  }

  return anchor
}

function toCanonicalAnchorFromDOM(pageElement, scrollContainer) {
  const geometry = getPageGeometry(pageElement, scrollContainer)
  if (!geometry) return null

  const scrollMetrics = getScrollMetrics(scrollContainer)
  const scrollTop = scrollMetrics.scrollTop
  const pageRatio = getPageRatio(scrollTop, geometry)
  const top = getScrollSpaceTop(pageElement, scrollContainer)
  const pageRect = getElementViewportRect(pageElement)
  const containerRect = getElementViewportRect(scrollContainer)
  const left = pageRect && containerRect
    ? pageRect.left - containerRect.left + toFiniteNumber(scrollContainer?.scrollLeft)
    : 0

  return createCanonicalAnchor({
    pageNumber: geometry.pageNumber,
    pageRatio,
    source: ANCHOR_SOURCE.DOM,
    domOffset: {
      top: toFiniteNumber(top),
      left
    }
  })
}

function toCanonicalAnchorFromPDF(pdfPoint, pageNumber, viewport) {
  const normalizedPageNumber = normalizePageNumber(pageNumber)
  if (!normalizedPageNumber || !pdfPoint || !viewport?.convertToViewportPoint) return null

  const x = Number(pdfPoint.x)
  const y = Number(pdfPoint.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  const [, cssY] = viewport.convertToViewportPoint(x, y)
  const viewportHeight = toFiniteNumber(viewport.height)
  const pageRatio = viewportHeight > 0 ? clampRatio(cssY / viewportHeight) : 0

  return createCanonicalAnchor({
    pageNumber: normalizedPageNumber,
    pageRatio,
    source: ANCHOR_SOURCE.PDF,
    pdfPoint: { x, y }
  })
}

function resolvePageGeometryForAnchor(anchor, geometryModel) {
  if (!anchor || !geometryModel) return null

  if (Array.isArray(geometryModel)) {
    return geometryModel.find((geometry) => geometry?.pageNumber === anchor.pageNumber) || null
  }

  if (geometryModel.pageNumber === anchor.pageNumber) {
    return geometryModel
  }

  if (typeof geometryModel.getPageGeometry === 'function') {
    return geometryModel.getPageGeometry(anchor.pageNumber) || null
  }

  return null
}

function resolveDOMScrollFromAnchor(anchor, geometryModel) {
  const canonicalAnchor = normalizeCanonicalAnchor(anchor)
  if (!canonicalAnchor) return null

  const geometry = resolvePageGeometryForAnchor(canonicalAnchor, geometryModel)
  if (geometry && Number.isFinite(Number(geometry.top)) && Number.isFinite(Number(geometry.height))) {
    return Number(geometry.top) + (Number(geometry.height) * canonicalAnchor.pageRatio)
  }

  return Number.isFinite(Number(canonicalAnchor.domOffset?.top))
    ? Number(canonicalAnchor.domOffset.top)
    : null
}

function resolvePDFPointFromAnchor(anchor, viewport) {
  const canonicalAnchor = normalizeCanonicalAnchor(anchor)
  if (!canonicalAnchor || !viewport) return null

  if (canonicalAnchor.pdfPoint) {
    return { ...canonicalAnchor.pdfPoint }
  }

  if (!viewport.convertToPdfPoint) return null

  const viewportHeight = toFiniteNumber(viewport.height)
  const cssY = viewportHeight * canonicalAnchor.pageRatio
  const cssX = toFiniteNumber(canonicalAnchor.domOffset?.left)
  const [x, y] = viewport.convertToPdfPoint(cssX, cssY)

  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null

  return {
    x: Number(x),
    y: Number(y)
  }
}

function normalizeCanonicalAnchor(anchor) {
  if (!anchor) return null

  return createCanonicalAnchor({
    pageNumber: anchor.pageNumber,
    pageRatio: anchor.pageRatio ?? anchor.offsetRatio ?? 0,
    source: anchor.source ?? (anchor.pdfPoint ? ANCHOR_SOURCE.PDF : ANCHOR_SOURCE.DOM),
    pdfPoint: anchor.pdfPoint,
    domOffset: anchor.domOffset
  })
}

function toLegacyScrollAnchor(anchor) {
  const canonicalAnchor = normalizeCanonicalAnchor(anchor)
  if (!canonicalAnchor) return null

  const legacyAnchor = {
    pageNumber: canonicalAnchor.pageNumber,
    offsetRatio: canonicalAnchor.pageRatio
  }

  if (canonicalAnchor.pdfPoint) {
    legacyAnchor.pdfPoint = { ...canonicalAnchor.pdfPoint }
  }

  return legacyAnchor
}

export {
  ANCHOR_SOURCE,
  createCanonicalAnchor,
  normalizeCanonicalAnchor,
  resolveDOMScrollFromAnchor,
  resolvePDFPointFromAnchor,
  toCanonicalAnchorFromDOM,
  toCanonicalAnchorFromPDF,
  toLegacyScrollAnchor
}
