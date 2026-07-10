import { findPrimaryPageTarget } from './pdfViewportPageResolver.js'

const findBestScrollAnchorTarget = findPrimaryPageTarget

function isPdfAnchor(anchor) {
  return anchor?.pdfPoint != null
}

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
    console.log('[LAYOUT-DIAG][restore]', JSON.stringify({
      caller: 'restoreScrollAnchor',
      success: false,
      reason: !anchor ? 'no anchor' : 'no container'
    }))
    return false
  }

  const pageEl = findPageElement(container, pageSelector, anchor.pageNumber)
  if (!pageEl) {
    console.log('[LAYOUT-DIAG][restore]', JSON.stringify({
      caller: 'restoreScrollAnchor',
      success: false,
      reason: 'page not found',
      page: anchor.pageNumber
    }))
    return false
  }

  const pageRect = pageEl.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const pageOffsetTop = pageRect.top - containerRect.top + container.scrollTop
  const targetScrollTop = pageOffsetTop + pageRect.height * anchor.offsetRatio
  const scrollTopBefore = container.scrollTop

  container.scrollTo({
    top: targetScrollTop,
    behavior: 'instant'
  })

  console.log('[LAYOUT-DIAG][restore]', JSON.stringify({
    caller: 'restoreScrollAnchor',
    success: true,
    owner: 'scroll-anchor',
    anchorType: 'DOM',
    page: anchor.pageNumber,
    offsetRatio: anchor.offsetRatio,
    pdfPoint: null,
    requestedScrollTop: targetScrollTop,
    scrollTopBefore,
    scrollTopAfter: container.scrollTop
  }))
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

  return {
    pageNumber,
    offsetRatio,
    pdfPoint: { x: pdfX, y: pdfY }
  }
}

/**
 * Restore scroll position using either PDF-backed precision or
 * Fit Page DOM-root positioning.
 *
 * When `options.zoomMode === 'fit-page'`: scroll to the DOM top of
 * the target page via findPageDomTop. Ignores pdfPoint entirely.
 * Otherwise: use pdfPoint + viewport conversion for pixel-precise
 * restoration relative to the canvas origin.
 *
 * The dispatch is driven by zoom mode, not anchor shape. A PDF-backed
 * anchor passed with zoomMode 'fit-page' is treated as DOM-root.
 */
function restorePdfBackedScrollAnchor(anchor, container, pageSelector, pdfSession, options = {}) {
  if (!anchor || !container) {
    console.log('[LAYOUT-DIAG][restore]', JSON.stringify({
      caller: 'restorePdfBackedScrollAnchor',
      success: false,
      reason: !anchor ? 'no anchor' : 'no container'
    }))
    return false
  }

  const pageEl = findPageElement(container, pageSelector, anchor.pageNumber)
  if (!pageEl) {
    console.log('[LAYOUT-DIAG][restore]', JSON.stringify({
      caller: 'restorePdfBackedScrollAnchor',
      success: false,
      reason: 'page not found',
      page: anchor.pageNumber
    }))
    return false
  }

  if (options.zoomMode === 'fit-page') {
    const targetScrollTop = findPageDomTop(container, pageSelector, anchor.pageNumber)
    if (!Number.isFinite(targetScrollTop)) {
      console.log('[LAYOUT-DIAG][restore]', JSON.stringify({
        caller: 'restorePdfBackedScrollAnchor(fit-page)',
        success: false,
        reason: 'dom top not finite',
        page: anchor.pageNumber
      }))
      return false
    }
    const scrollTopBefore = container.scrollTop
    container.scrollTo({
      top: targetScrollTop,
      behavior: 'instant'
    })
    console.log('[LAYOUT-DIAG][restore]', JSON.stringify({
      caller: 'restorePdfBackedScrollAnchor(fit-page)',
      success: true,
      owner: 'pdf-backed',
      anchorType: 'fit-page-DOM',
      page: anchor.pageNumber,
      offsetRatio: anchor.offsetRatio,
      pdfPoint: anchor.pdfPoint ?? null,
      requestedScrollTop: targetScrollTop,
      scrollTopBefore,
      scrollTopAfter: container.scrollTop
    }))
    return true
  }

  if (!isPdfAnchor(anchor) || !pdfSession) {
    console.log('[LAYOUT-DIAG][restore]', JSON.stringify({
      caller: 'restorePdfBackedScrollAnchor',
      success: false,
      reason: !isPdfAnchor(anchor) ? 'not pdf anchor' : 'no pdf session',
      page: anchor.pageNumber,
      hasPdfPoint: !!anchor.pdfPoint
    }))
    return false
  }

  const canvasEl = getPageCanvasElement(pageEl)
  if (!canvasEl) {
    console.log('[LAYOUT-DIAG][restore]', JSON.stringify({
      caller: 'restorePdfBackedScrollAnchor',
      success: false,
      reason: 'no canvas element',
      page: anchor.pageNumber
    }))
    return false
  }

  const viewport = pdfSession.getPageViewport?.(anchor.pageNumber)
  if (!viewport?.convertToViewportPoint) {
    console.log('[LAYOUT-DIAG][restore]', JSON.stringify({
      caller: 'restorePdfBackedScrollAnchor',
      success: false,
      reason: 'no viewport conversion',
      page: anchor.pageNumber
    }))
    return false
  }

  const viewportPoint = viewport.convertToViewportPoint(anchor.pdfPoint.x, anchor.pdfPoint.y)
  const [, cssY] = viewportPoint
  const canvasRect = canvasEl.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const canvasOffsetTop = canvasRect.top - containerRect.top + container.scrollTop
  const targetScrollTop = canvasOffsetTop + cssY
  const scrollTopBefore = container.scrollTop

  container.scrollTo({
    top: targetScrollTop,
    behavior: 'instant'
  })

  console.log('[LAYOUT-DIAG][restore]', JSON.stringify({
    caller: 'restorePdfBackedScrollAnchor',
    success: true,
    owner: 'pdf-backed',
    anchorType: 'PDF',
    page: anchor.pageNumber,
    offsetRatio: anchor.offsetRatio,
    pdfPoint: anchor.pdfPoint ?? null,
    requestedScrollTop: targetScrollTop,
    scrollTopBefore,
    scrollTopAfter: container.scrollTop
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
  restorePdfBackedScrollAnchor,
  isPdfAnchor
}
