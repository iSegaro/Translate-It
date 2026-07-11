const CURRENT_PAGE_SOURCE = 'geometry'

function getDistanceFromPage(scrollTop, pageGeometry) {
  if (!pageGeometry) return Number.POSITIVE_INFINITY

  if (scrollTop < pageGeometry.top) {
    return pageGeometry.top - scrollTop
  }

  if (scrollTop >= pageGeometry.bottom) {
    return scrollTop - pageGeometry.bottom
  }

  return 0
}

/**
 * Resolve current page from scroll position using sorted GeometryModel output.
 *
 * IMPORTANT:
 * - pageGeometries MUST be pre-sorted by top ASC
 * - This function does NOT read DOM, IntersectionObserver, or Vue state
 * - Fallback chooses nearest page by distance when scrollTop is in a gap
 *
 * @param {number} scrollTop
 * @param {Array<{pageNumber:number, top:number, bottom:number}>} pageGeometries
 * @returns {number|null}
 */
function resolveCurrentPage(scrollTop, pageGeometries = []) {
  if (!Array.isArray(pageGeometries) || pageGeometries.length === 0) return null

  const targetScrollTop = Number(scrollTop || 0)
  let nearestPage = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const pageGeometry of pageGeometries) {
    const pageNumber = Number(pageGeometry?.pageNumber)
    const top = Number(pageGeometry?.top)
    const bottom = Number(pageGeometry?.bottom)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) continue
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue

    if (top <= targetScrollTop && targetScrollTop < bottom) {
      return pageNumber
    }

    const distance = getDistanceFromPage(targetScrollTop, { top, bottom })
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestPage = pageNumber
    }
  }

  return nearestPage
}

/**
 * Resolve current page using legacy primary-visible-page policy from GeometryModel output.
 *
 * This keeps Phase 3 behavior-stable: among visible pages, choose the page
 * whose top edge is closest to the scroll container's visible top edge.
 *
 * @param {number} scrollTop
 * @param {Array<{pageNumber:number, top:number, bottom:number}>} pageGeometries
 * @returns {number|null}
 */
function resolvePrimaryVisiblePage(scrollTop, pageGeometries = []) {
  if (!Array.isArray(pageGeometries) || pageGeometries.length === 0) return null

  const targetScrollTop = Number(scrollTop || 0)
  let bestPage = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const pageGeometry of pageGeometries) {
    const pageNumber = Number(pageGeometry?.pageNumber)
    const top = Number(pageGeometry?.top)
    const bottom = Number(pageGeometry?.bottom)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) continue
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue
    if (bottom <= targetScrollTop) continue
    if (top >= targetScrollTop + Number(pageGeometry?.viewportHeight || 0)) continue

    const distance = Math.abs(top - targetScrollTop)
    if (distance < bestDistance) {
      bestDistance = distance
      bestPage = pageNumber
    }
  }

  if (bestPage) return bestPage

  return resolveCurrentPage(scrollTop, pageGeometries)
}

export {
  CURRENT_PAGE_SOURCE,
  resolveCurrentPage,
  resolvePrimaryVisiblePage
}
