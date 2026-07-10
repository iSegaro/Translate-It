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
  if (!Array.isArray(pageGeometries) || pageGeometries.length === 0) {
    console.log('[LAYOUT-DIAG][resolver-result]', JSON.stringify({
      selectedPage: null,
      algorithm: 'resolveCurrentPage',
      reason: 'no geometries',
      previousCurrentPage: null,
      scrollTop: Number(scrollTop || 0)
    }))
    return null
  }

  const targetScrollTop = Number(scrollTop || 0)

  const firstPage = pageGeometries.length > 0 ? { pageNumber: pageGeometries[0]?.pageNumber, top: pageGeometries[0]?.top } : null
  const lastPage = pageGeometries.length > 0 ? { pageNumber: pageGeometries[pageGeometries.length - 1]?.pageNumber, bottom: pageGeometries[pageGeometries.length - 1]?.bottom } : null
  const pageNumbers = pageGeometries.map(g => g?.pageNumber)
  const sorted = pageGeometries.every((g, i) => i === 0 || Number(g.top) >= Number(pageGeometries[i - 1].top))
  const duplicatePageNumbers = pageNumbers.filter((pn, i) => pageNumbers.indexOf(pn) !== i)
  const invalidGeometries = pageGeometries.filter(g => !Number.isFinite(Number(g.top)) || !Number.isFinite(Number(g.bottom)) || Number(g.height) < 0 || Number.isNaN(Number(g.height)))
  console.log('[LAYOUT-DIAG][geometry]', JSON.stringify({
    geometryCount: pageGeometries.length,
    sorted,
    firstPage: firstPage ?? pageGeometries[0]?.pageNumber,
    lastPage: lastPage?.pageNumber ?? pageGeometries[pageGeometries.length - 1]?.pageNumber,
    duplicatePageNumbers: duplicatePageNumbers.length > 0 ? duplicatePageNumbers : null,
    missingPageNumbers: null,
    invalidGeometryCount: invalidGeometries.length,
    invalidGeometryPageNumbers: invalidGeometries.length > 0 ? invalidGeometries.map(g => g?.pageNumber) : null,
    scrollTop: targetScrollTop
  }))

  let nearestPage = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const pageGeometry of pageGeometries) {
    const pageNumber = Number(pageGeometry?.pageNumber)
    const top = Number(pageGeometry?.top)
    const bottom = Number(pageGeometry?.bottom)
    const height = Number(pageGeometry?.height)
    const viewportHeight = Number(pageGeometry?.viewportHeight ?? 0)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) continue
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue

    const containsScrollTop = top <= targetScrollTop && targetScrollTop < bottom
    const distance = containsScrollTop ? 0 : getDistanceFromPage(targetScrollTop, { top, bottom })

    const viewportTop = targetScrollTop
    const viewportBottom = targetScrollTop + viewportHeight
    const visible = bottom > viewportTop && top < viewportBottom

    console.log('[LAYOUT-DIAG][resolver]', JSON.stringify({
      pageNumber,
      top,
      bottom,
      height,
      scrollTop: targetScrollTop,
      viewportTop,
      viewportBottom,
      distanceFromViewportTop: Math.abs(top - targetScrollTop),
      containsScrollTop,
      visible,
      selectionScore: null,
      rejected: containsScrollTop ? null : (distance === 0 ? 'gap' : 'not in range'),
      selected: containsScrollTop
    }))

    if (containsScrollTop) {
      console.log('[LAYOUT-DIAG][resolver-result]', JSON.stringify({
        selectedPage: pageNumber,
        algorithm: 'resolveCurrentPage',
        reason: 'exact match',
        previousCurrentPage: null,
        scrollTop: targetScrollTop
      }))
      return pageNumber
    }

    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestPage = pageNumber
    }
  }

  console.log('[LAYOUT-DIAG][resolver-result]', JSON.stringify({
    selectedPage: nearestPage,
    algorithm: 'resolveCurrentPage',
    reason: nearestPage ? 'nearest by distance' : 'no candidates',
    previousCurrentPage: null,
    scrollTop: targetScrollTop,
    nearestDistance: nearestDistance === Number.POSITIVE_INFINITY ? null : nearestDistance
  }))

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
  if (!Array.isArray(pageGeometries) || pageGeometries.length === 0) {
    console.log('[LAYOUT-DIAG][resolver-result]', JSON.stringify({
      selectedPage: null,
      algorithm: 'resolvePrimaryVisiblePage',
      reason: 'no geometries',
      scrollTop: Number(scrollTop || 0)
    }))
    return null
  }

  const targetScrollTop = Number(scrollTop || 0)
  let bestPage = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const pageGeometry of pageGeometries) {
    const pageNumber = Number(pageGeometry?.pageNumber)
    const top = Number(pageGeometry?.top)
    const bottom = Number(pageGeometry?.bottom)
    const height = Number(pageGeometry?.height)
    const viewportHeight = Number(pageGeometry?.viewportHeight ?? 0)
    if (!Number.isInteger(pageNumber) || pageNumber < 1) continue
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue

    const viewportTop = targetScrollTop
    const viewportBottom = targetScrollTop + viewportHeight
    const isBelowViewport = bottom <= targetScrollTop
    const isAboveViewport = top >= viewportBottom
    const visible = !isBelowViewport && !isAboveViewport
    const containsScrollTop = top <= targetScrollTop && targetScrollTop < bottom

    if (isBelowViewport) {
      console.log('[LAYOUT-DIAG][resolver]', JSON.stringify({
        pageNumber,
        top,
        bottom,
        height,
        scrollTop: targetScrollTop,
        viewportTop,
        viewportBottom,
        distanceFromViewportTop: Math.abs(top - targetScrollTop),
        containsScrollTop,
        visible,
        selectionScore: null,
        rejected: 'below viewport',
        selected: false
      }))
      continue
    }
    if (isAboveViewport) {
      console.log('[LAYOUT-DIAG][resolver]', JSON.stringify({
        pageNumber,
        top,
        bottom,
        height,
        scrollTop: targetScrollTop,
        viewportTop,
        viewportBottom,
        distanceFromViewportTop: Math.abs(top - targetScrollTop),
        containsScrollTop,
        visible,
        selectionScore: null,
        rejected: 'above viewport',
        selected: false
      }))
      continue
    }

    const distance = Math.abs(top - targetScrollTop)
    const isBest = distance < bestDistance

    console.log('[LAYOUT-DIAG][resolver]', JSON.stringify({
      pageNumber,
      top,
      bottom,
      height,
      scrollTop: targetScrollTop,
      viewportTop,
      viewportBottom,
      distanceFromViewportTop: distance,
      containsScrollTop,
      visible: true,
      selectionScore: distance,
      rejected: null,
      selected: isBest
    }))

    if (isBest) {
      bestDistance = distance
      bestPage = pageNumber
    }
  }

  if (bestPage) {
    console.log('[LAYOUT-DIAG][resolver-result]', JSON.stringify({
      selectedPage: bestPage,
      algorithm: 'resolvePrimaryVisiblePage',
      reason: 'closest top to viewport',
      scrollTop: targetScrollTop,
      bestDistance
    }))
    return bestPage
  }

  console.log('[LAYOUT-DIAG][resolver-result]', JSON.stringify({
    selectedPage: null,
    algorithm: 'resolvePrimaryVisiblePage',
    reason: 'no visible pages, falling back to resolveCurrentPage',
    scrollTop: targetScrollTop
  }))

  return resolveCurrentPage(scrollTop, pageGeometries)
}

export {
  CURRENT_PAGE_SOURCE,
  resolveCurrentPage,
  resolvePrimaryVisiblePage
}
