function isFinitePageNumber(value) {
  const pageNumber = Number(value)
  return Number.isInteger(pageNumber) && pageNumber > 0
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function getScrollMetrics(scrollContainer) {
  const scrollTop = Number(scrollContainer?.scrollTop || 0)
  const scrollHeight = Number(scrollContainer?.scrollHeight || 0)
  const clientHeight = Number(scrollContainer?.clientHeight || 0)

  return {
    scrollTop,
    scrollHeight,
    clientHeight,
    maxScrollTop: Math.max(0, scrollHeight - clientHeight)
  }
}

function getElementClientMetrics(element) {
  return {
    width: Number(element?.clientWidth || 0),
    height: Number(element?.clientHeight || 0)
  }
}

function getElementViewportRect(element) {
  return element?.getBoundingClientRect?.() || null
}

function getPageGeometry(pageElement, scrollContainer) {
  if (!pageElement || !scrollContainer) return null

  const pageNumber = Number(pageElement.dataset?.pageNumber)
  if (!isFinitePageNumber(pageNumber)) return null

  const pageRect = getElementViewportRect(pageElement)
  const containerRect = getElementViewportRect(scrollContainer)
  if (!pageRect || !containerRect) return null
  const scrollTop = Number(scrollContainer.scrollTop || 0)
  const top = pageRect.top - containerRect.top + scrollTop
  const height = Number(pageRect.height || 0)
  const bottom = top + height
  const width = Number(pageRect.width || 0)
  const visibleTop = Math.max(pageRect.top, containerRect.top)
  const visibleBottom = Math.min(pageRect.bottom, containerRect.bottom)
  const visibleHeight = Math.max(0, visibleBottom - visibleTop)

  return {
    pageNumber,
    top,
    bottom,
    height,
    width,
    centerY: top + (height / 2),
    visibilityHint: height > 0 ? clampRatio(visibleHeight / height) : 0,
    element: pageElement,
    rect: pageRect
  }
}

function getPageElements(scrollContainer, pageSelector) {
  if (!scrollContainer || !pageSelector) return []

  return [...scrollContainer.querySelectorAll(pageSelector)]
}

function getPageGeometries(scrollContainer, pageSelector) {
  return getPageElements(scrollContainer, pageSelector)
    .map((pageElement) => getPageGeometry(pageElement, scrollContainer))
    .filter(Boolean)
}

/**
 * Resolves page from scroll position using sorted page geometries.
 *
 * IMPORTANT:
 * - pageGeometries MUST be pre-sorted by top ASC (ascending page position)
 * - This function does NOT sort internally for performance reasons
 * - Caller is responsible for ensuring deterministic order
 *
 * @param {number} scrollTop
 * @param {Array<{pageNumber:number, top:number}>} pageGeometries
 * @returns {object|null}
 */
function resolvePageFromScroll(scrollTop, pageGeometries = []) {
  if (!pageGeometries.length) return null

  const targetScrollTop = Number(scrollTop || 0)
  let bestPage = pageGeometries[0]

  for (const pageGeometry of pageGeometries) {
    if (pageGeometry.top <= targetScrollTop) {
      bestPage = pageGeometry
      continue
    }

    break
  }

  return bestPage
}

function getPageRatio(scrollTop, pageGeometry) {
  if (!pageGeometry || pageGeometry.height <= 0) return 0

  return clampRatio((Number(scrollTop || 0) - pageGeometry.top) / pageGeometry.height)
}

function getScrollSpaceTop(element, scrollContainer) {
  if (!element || !scrollContainer) return null

  const elementRect = getElementViewportRect(element)
  const containerRect = getElementViewportRect(scrollContainer)
  if (!elementRect || !containerRect) return null
  return elementRect.top - containerRect.top + Number(scrollContainer.scrollTop || 0)
}

function getCanvasScrollTop(canvasElement, scrollContainer, cssY = 0) {
  const canvasTop = getScrollSpaceTop(canvasElement, scrollContainer)
  if (!Number.isFinite(canvasTop)) return null

  return canvasTop + Number(cssY || 0)
}

function findPrimaryPageGeometry(scrollContainer, pageSelector) {
  if (!scrollContainer) return null

  // NOTE: This preserves legacy visible-page selection policy.
  // Will be replaced in Phase 3 (Deterministic Current Page).
  const containerRect = getElementViewportRect(scrollContainer)
  if (!containerRect) return null
  const pageGeometries = getPageGeometries(scrollContainer, pageSelector)
  if (pageGeometries.length === 0) return null

  let best = null

  for (const geometry of pageGeometries) {
    const rect = geometry.rect
    if (rect.bottom <= containerRect.top) continue
    if (rect.top >= containerRect.bottom) continue

    const dist = Math.abs(rect.top - containerRect.top)
    if (!best || dist < best.dist) {
      best = { ...geometry, el: geometry.element, dist }
    }
  }

  if (!best) {
    for (const geometry of pageGeometries) {
      const rect = geometry.rect
      if (rect.bottom <= containerRect.top) continue

      best = { ...geometry, el: geometry.element }
      break
    }
  }

  return best
}

export {
  getScrollMetrics,
  getElementClientMetrics,
  getElementViewportRect,
  getPageElements,
  getPageGeometry,
  getPageGeometries,
  resolvePageFromScroll,
  getPageRatio,
  getScrollSpaceTop,
  getCanvasScrollTop,
  findPrimaryPageGeometry
}
