import { ANCHOR_SOURCE, createCanonicalAnchor, resolveDOMScrollFromAnchor } from './pdfCanonicalAnchor.js'
import { getPageGeometries } from './pdfGeometryModel.js'
import { resolveCurrentPage } from './pdfCurrentPageResolver.js'

function normalizeSelector(pageSelector) {
  return pageSelector || '[data-page-number]'
}

function getGeometryForPage(pageGeometries, pageNumber) {
  return pageGeometries.find((geometry) => geometry?.pageNumber === pageNumber) || null
}

function getPageRatioFromGeometry(scrollTop, geometry) {
  if (!geometry || !Number.isFinite(Number(geometry.height)) || Number(geometry.height) <= 0) {
    return 0
  }

  const ratio = (Number(scrollTop || 0) - Number(geometry.top || 0)) / Number(geometry.height)
  if (!Number.isFinite(ratio)) return 0
  return Math.min(1, Math.max(0, ratio))
}

function resolveEffectiveGeometries(container, selector, heightResolver) {
  const geometries = getPageGeometries(container, selector)
  if (!heightResolver) return geometries

  return geometries.map((geo) => {
    const height = heightResolver(geo)
    if (Number.isFinite(height) && height > 0 && height !== geo.height) {
      return {
        ...geo,
        height,
        bottom: geo.top + height,
        centerY: geo.top + (height / 2)
      }
    }

    return geo
  })
}

function buildSyncState({
  sourceScrollTop,
  sourceContainer,
  targetContainer,
  pageSelector,
  heightResolver
} = {}) {
  const selector = normalizeSelector(pageSelector)
  const sourceGeometries = resolveEffectiveGeometries(sourceContainer, selector, heightResolver)
  const targetGeometries = resolveEffectiveGeometries(targetContainer, selector, heightResolver)
  const sourceFirstGeo = sourceGeometries.length > 0 ? { pageNumber: sourceGeometries[0]?.pageNumber, top: sourceGeometries[0]?.top } : null
  const sourceLastGeo = sourceGeometries.length > 0 ? { pageNumber: sourceGeometries[sourceGeometries.length - 1]?.pageNumber, bottom: sourceGeometries[sourceGeometries.length - 1]?.bottom } : null
  console.log('[LAYOUT-DIAG][geometry]', JSON.stringify({
    source: 'buildSyncState',
    geometryCount: sourceGeometries.length,
    firstPage: sourceFirstGeo,
    lastPage: sourceLastGeo,
    scrollTop: sourceScrollTop,
    sourceScrollHeight: sourceContainer?.scrollHeight ?? 0,
    sourceClientHeight: sourceContainer?.clientHeight ?? 0
  }))
  const pageNumber = resolveCurrentPage(sourceScrollTop, sourceGeometries)
  const sourceGeometry = pageNumber ? getGeometryForPage(sourceGeometries, pageNumber) : null
  if (!sourceGeometry) {
    return {
      sourceAnchor: null,
      sourceGeometry: null,
      pageNumber: null,
      pageRatio: 0,
      sourceGeometries,
      targetGeometries
    }
  }

  const pageRatio = getPageRatioFromGeometry(sourceScrollTop, sourceGeometry)
  const sourceAnchor = createCanonicalAnchor({
    pageNumber,
    pageRatio,
    source: ANCHOR_SOURCE.GEOMETRY
  })

  return {
    sourceAnchor,
    sourceGeometry,
    pageNumber,
    pageRatio,
    sourceGeometries,
    targetGeometries
  }
}

function mapAnchorToTargetScroll({
  canonicalAnchor,
  targetGeometryModel
} = {}) {
  return resolveDOMScrollFromAnchor(canonicalAnchor, targetGeometryModel)
}

function syncScroll({
  sourceScrollTop,
  sourceContainer,
  targetContainer,
  pageSelector,
  heightResolver
} = {}) {
  const syncState = buildSyncState({
    sourceScrollTop,
    sourceContainer,
    targetContainer,
    pageSelector,
    heightResolver
  })

  const targetScrollTop = mapAnchorToTargetScroll({
    canonicalAnchor: syncState.sourceAnchor,
    targetGeometryModel: syncState.targetGeometries
  })

  return {
    ...syncState,
    targetScrollTop
  }
}

export {
  buildSyncState,
  mapAnchorToTargetScroll,
  syncScroll
}
