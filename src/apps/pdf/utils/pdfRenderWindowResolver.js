import { getPageGeometries, getScrollMetrics } from './pdfGeometryModel.js'
import { resolvePrimaryVisiblePage } from './pdfCurrentPageResolver.js'

function normalizeBufferPages(bufferPages) {
  const numeric = Number(bufferPages)
  if (!Number.isFinite(numeric)) return 1
  return Math.max(0, Math.floor(numeric))
}

function computeVisiblePages({
  scrollTop,
  viewportHeight,
  pageGeometries = []
} = {}) {
  const top = Number(scrollTop || 0)
  const bottom = top + Math.max(0, Number(viewportHeight || 0))

  return pageGeometries
    .filter((geometry) => {
      const pageTop = Number(geometry?.top)
      const pageBottom = Number(geometry?.bottom)
      if (!Number.isFinite(pageTop) || !Number.isFinite(pageBottom)) return false
      return pageBottom > top && pageTop < bottom
    })
    .map((geometry) => Number(geometry.pageNumber))
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0)
}

function expandRenderWindow({
  visiblePages = [],
  pageGeometries = [],
  bufferPages = 1
} = {}) {
  if (!visiblePages.length) return []

  const buffer = normalizeBufferPages(bufferPages)
  const orderedPages = pageGeometries
    .map((geometry) => Number(geometry?.pageNumber))
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0)
  const visibleSet = new Set(visiblePages)
  const visibleIndexes = orderedPages
    .map((pageNumber, index) => visibleSet.has(pageNumber) ? index : -1)
    .filter((index) => index >= 0)

  if (!visibleIndexes.length) return []

  const start = Math.max(0, Math.min(...visibleIndexes) - buffer)
  const end = Math.min(orderedPages.length - 1, Math.max(...visibleIndexes) + buffer)

  return orderedPages.slice(start, end + 1)
}

function resolveRenderWindow({
  scrollTop,
  container,
  pageSelector,
  bufferPages = 1
} = {}) {
  const pageGeometries = getPageGeometries(container, pageSelector)
  const scrollMetrics = getScrollMetrics(container)
  const firstGeo = pageGeometries.length > 0 ? { pageNumber: pageGeometries[0]?.pageNumber, top: pageGeometries[0]?.top } : null
  const lastGeo = pageGeometries.length > 0 ? { pageNumber: pageGeometries[pageGeometries.length - 1]?.pageNumber, bottom: pageGeometries[pageGeometries.length - 1]?.bottom } : null
  console.log('[LAYOUT-DIAG][geometry]', JSON.stringify({
    source: 'resolveRenderWindow',
    geometryCount: pageGeometries.length,
    firstPage: firstGeo,
    lastPage: lastGeo,
    scrollTop: scrollMetrics.scrollTop,
    containerScrollHeight: scrollMetrics.scrollHeight,
    containerClientHeight: scrollMetrics.clientHeight
  }))
  const resolvedScrollTop = Number.isFinite(Number(scrollTop))
    ? Number(scrollTop)
    : scrollMetrics.scrollTop
  const viewportHeight = scrollMetrics.clientHeight
  const visiblePages = computeVisiblePages({
    scrollTop: resolvedScrollTop,
    viewportHeight,
    pageGeometries
  })
  const renderPages = expandRenderWindow({
    visiblePages,
    pageGeometries,
    bufferPages
  })
  const primaryPage = resolvePrimaryVisiblePage(resolvedScrollTop, pageGeometries)

  return {
    visiblePages,
    renderPages,
    primaryPage
  }
}

export {
  computeVisiblePages,
  expandRenderWindow,
  resolveRenderWindow
}
