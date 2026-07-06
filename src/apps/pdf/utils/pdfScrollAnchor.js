import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { findPrimaryPageTarget } from './pdfViewportPageResolver.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'pdfScrollAnchorTrace')

function traceJson(message, data) {
  return `${message} ${JSON.stringify(data)}`
}

const findBestScrollAnchorTarget = findPrimaryPageTarget

function getPageCanvasElement(pageEl) {
  return pageEl?.querySelector('canvas') || null
}

function findPageElement(container, pageSelector, pageNumber) {
  return [...container.querySelectorAll(pageSelector)].find(
    (el) => Number(el.dataset.pageNumber) === pageNumber
  ) || null
}

function findPageDomTop(container, pageSelector, pageNumber) {
  if (!container) return null

  const pageEl = findPageElement(container, pageSelector, pageNumber)
  if (!pageEl) return null

  const pageRect = pageEl.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return pageRect.top - containerRect.top + container.scrollTop
}

function captureScrollAnchor(container, pageSelector) {
  if (!container) return null

  const scrollTop = container.scrollTop
  const containerRect = container.getBoundingClientRect()
  const best = findBestScrollAnchorTarget(container, pageSelector)
  if (!best) return null

  const pageNumber = Number(best.el.dataset.pageNumber)
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null

  const pageOffsetTop = best.rect.top - containerRect.top + scrollTop
  const offsetRatio = best.rect.height > 0
    ? Math.max(0, Math.min(1, (scrollTop - pageOffsetTop) / best.rect.height))
    : 0

  return { pageNumber, offsetRatio }
}

function restoreScrollAnchor(anchor, container, pageSelector) {
  if (!anchor || !container) {
    return false
  }

  const pageEl = findPageElement(container, pageSelector, anchor.pageNumber)
  if (!pageEl) {
    return false
  }

  const pageRect = pageEl.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const pageOffsetTop = pageRect.top - containerRect.top + container.scrollTop
  const targetScrollTop = pageOffsetTop + pageRect.height * anchor.offsetRatio

  container.scrollTo({
    top: targetScrollTop,
    behavior: 'instant'
  })
  return true
}

function capturePdfBackedScrollAnchor(container, pageSelector, pdfSession) {
  const best = findBestScrollAnchorTarget(container, pageSelector)
  if (!best) return null

  const pageEl = best.el
  const canvasEl = getPageCanvasElement(pageEl)
  const pageNumber = Number(pageEl.dataset.pageNumber)
  const viewport = pdfSession?.getPageViewport?.(pageNumber)
  if (!canvasEl || !viewport?.convertToPdfPoint) return null
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null

  const containerRect = container.getBoundingClientRect()
  const canvasRect = canvasEl.getBoundingClientRect()

  const cssX = (containerRect.left + (containerRect.width / 2)) - canvasRect.left
  const cssY = containerRect.top - canvasRect.top
  const [pdfX, pdfY] = viewport.convertToPdfPoint(cssX, cssY)

  const offsetRatio = best.rect.height > 0
    ? Math.max(0, Math.min(1, (containerRect.top - best.rect.top) / best.rect.height))
    : 0

  logger.debug(traceJson('[PDF Anchor Trace] capturePdfBackedScrollAnchor', {
    pageNumber,
    pageRectTop: best.rect.top,
    canvasRectTop: canvasRect.top,
    containerRectTop: containerRect.top,
    cssX,
    cssY,
    pdfPointX: pdfX,
    pdfPointY: pdfY,
    offsetRatio
  }))

  return {
    pageNumber,
    offsetRatio,
    pdfPoint: { x: pdfX, y: pdfY }
  }
}

function restorePdfBackedScrollAnchor(anchor, container, pageSelector, pdfSession, options = {}) {
  if (!anchor || !container) {
    return false
  }

  const pageEl = findPageElement(container, pageSelector, anchor.pageNumber)
  if (!pageEl) {
    return false
  }

  if (options.zoomMode === 'fit-page') {
    const targetScrollTop = findPageDomTop(container, pageSelector, anchor.pageNumber)
    if (!Number.isFinite(targetScrollTop)) return false

    logger.debug(traceJson('[PDF Anchor Trace] restorePdfBackedScrollAnchor fit-page DOM root', {
      pageNumber: anchor.pageNumber,
      targetScrollTop
    }))

    container.scrollTo({
      top: targetScrollTop,
      behavior: 'instant'
    })
    return true
  }

  if (!anchor.pdfPoint || !pdfSession) {
    return false
  }

  const canvasEl = getPageCanvasElement(pageEl)
  if (!canvasEl) {
    return false
  }

  const viewport = pdfSession.getPageViewport?.(anchor.pageNumber)
  if (!viewport?.convertToViewportPoint) {
    return false
  }

  const viewportPoint = viewport.convertToViewportPoint(anchor.pdfPoint.x, anchor.pdfPoint.y)
  const [, cssY] = viewportPoint
  const canvasRect = canvasEl.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const canvasOffsetTop = canvasRect.top - containerRect.top + container.scrollTop
  const targetScrollTop = canvasOffsetTop + cssY

  logger.debug(traceJson('[PDF Anchor Trace] restorePdfBackedScrollAnchor', {
    pageNumber: anchor.pageNumber,
    pdfPoint: anchor.pdfPoint,
    viewportPoint,
    cssY,
    canvasOffsetTop,
    targetScrollTop
  }))

  container.scrollTo({
    top: targetScrollTop,
    behavior: 'instant'
  })

  logger.debug(traceJson('[PDF Anchor Trace] restorePdfBackedScrollAnchor completed', {
    restoredPageNumber: anchor.pageNumber,
    finalScrollTop: container.scrollTop
  }))

  return true
}

export {
  findBestScrollAnchorTarget,
  getPageCanvasElement,
  findPageDomTop,
  captureScrollAnchor,
  restoreScrollAnchor,
  capturePdfBackedScrollAnchor,
  restorePdfBackedScrollAnchor
}
