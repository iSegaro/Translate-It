import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'pdfViewportPageResolverTrace')

function getPageElements(container, pageSelector) {
  if (!container || !pageSelector) return []

  return [...container.querySelectorAll(pageSelector)]
}

function findPrimaryPageTarget(container, pageSelector) {
  if (!container) return null

  const containerRect = container.getBoundingClientRect()
  const pageElements = getPageElements(container, pageSelector)
  if (pageElements.length === 0) return null

  let best = null
  const visiblePages = []

  for (const el of pageElements) {
    const pageNumber = Number(el.dataset.pageNumber)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) continue

    const rect = el.getBoundingClientRect()
    if (rect.bottom <= containerRect.top) continue
    if (rect.top >= containerRect.bottom) continue

    const visibleHeight = Math.max(0, Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top))
    const distanceToViewportTop = Math.abs(rect.top - containerRect.top)
    visiblePages.push({
      pageNumber,
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      visibleHeight,
      distanceToViewportTop
    })

    const dist = Math.abs(rect.top - containerRect.top)
    if (!best || dist < best.dist) {
      best = { el, rect, dist, pageNumber }
    }
  }

  if (!best) {
    for (const el of pageElements) {
      const pageNumber = Number(el.dataset.pageNumber)
      if (!Number.isInteger(pageNumber) || pageNumber < 1) continue

      const rect = el.getBoundingClientRect()
      if (rect.bottom <= containerRect.top) continue

      best = { el, rect, pageNumber }
      break
    }
  }

  if (best) {
    const selectionReason = best.dist != null ? 'closest-top' : 'first-visible'
    logger.debug(JSON.stringify({
      message: '[PrimaryPageResolver]',
      viewportTop: containerRect.top,
      viewportBottom: containerRect.bottom,
      pages: visiblePages,
      selectedPage: best.pageNumber,
      selectionReason
    }))
  }

  return best
}

function getPrimaryPage(container, pageSelector) {
  return findPrimaryPageTarget(container, pageSelector)?.pageNumber || null
}

export {
  getPageElements,
  findPrimaryPageTarget,
  getPrimaryPage
}
