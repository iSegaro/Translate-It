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

function buildSyncState({
  sourceScrollTop,
  sourceContainer,
  targetContainer,
  pageSelector
} = {}) {
  const selector = normalizeSelector(pageSelector)
  const sourceGeometries = getPageGeometries(sourceContainer, selector)
  const targetGeometries = getPageGeometries(targetContainer, selector)
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
  pageSelector
} = {}) {
  const syncState = buildSyncState({
    sourceScrollTop,
    sourceContainer,
    targetContainer,
    pageSelector
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
