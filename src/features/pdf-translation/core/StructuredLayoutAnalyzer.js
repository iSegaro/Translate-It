/**
 * StructuredLayoutAnalyzer — additive structured-layout bridge for PDF pages.
 *
 * Phase 2d foundation: converts existing table metadata and semantic region
 * signals into a richer page-level structured model without changing overlay,
 * cache, or translation behavior.
 */

import {
  createEmptyStructuredLayoutModel,
  createStructuredLayoutGroup,
  createStructuredLayoutModel,
  createStructuredLayoutRegion,
  STRUCTURED_GROUP_KIND_GRID,
  STRUCTURED_REGION_KIND_KEY_VALUE,
  STRUCTURED_REGION_KIND_KPI,
  STRUCTURED_REGION_KIND_TABLE,
  STRUCTURED_REGION_KIND_UNKNOWN
} from './StructuredLayoutModel.js'

function getNormalizedBoundingBox(box = null) {
  if (!box) return null
  return {
    x: Number(box.x) || 0,
    y: Number(box.y) || 0,
    width: Number(box.width) || 0,
    height: Number(box.height) || 0
  }
}

function unionBoundingBoxes(boxes = []) {
  const validBoxes = boxes.filter((box) => box && Number.isFinite(box.x) && Number.isFinite(box.y))
  if (!validBoxes.length) return null

  const x = Math.min(...validBoxes.map((box) => box.x))
  const y = Math.min(...validBoxes.map((box) => box.y))
  const right = Math.max(...validBoxes.map((box) => box.x + box.width))
  const bottom = Math.max(...validBoxes.map((box) => box.y + box.height))

  return getNormalizedBoundingBox({
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y)
  })
}

function getTableDetails(table = null) {
  if (!table) return null

  return {
    columnCount: table.columnCount || 0,
    rowCount: table.rowCount || 0,
    cells: Array.isArray(table.cells) ? table.cells : [],
    hasSpanCandidates: table.hasSpanCandidates === true,
    hasMergedCells: table.hasMergedCells === true,
    hasMultiLevelHeaders: table.hasMultiLevelHeaders === true
  }
}

function getSemanticDetails(semantic = null) {
  if (!semantic) return null

  return {
    type: semantic.type || null,
    confidence: semantic.confidence || 0,
    dashboardGroup: semantic.dashboardGroup || null,
    financialStatement: semantic.financialStatement || null,
    metrics: Array.isArray(semantic.metrics) ? semantic.metrics : [],
    pairs: Array.isArray(semantic.pairs) ? semantic.pairs : []
  }
}

function classifyRegion(region) {
  const tableDetails = getTableDetails(region?.metadata?.table || null)
  const semanticDetails = getSemanticDetails(region?.metadata?.semantic || null)

  if (tableDetails) {
    const confidence = tableDetails.cells.length > 0 || tableDetails.columnCount > 0 || tableDetails.rowCount > 0
      ? 0.9
      : 0.75

    return {
      kind: STRUCTURED_REGION_KIND_TABLE,
      confidence,
      classificationSource: 'table',
      details: {
        table: tableDetails,
        semantic: semanticDetails
      }
    }
  }

  if (semanticDetails?.type === 'kpi-candidate') {
    return {
      kind: STRUCTURED_REGION_KIND_KPI,
      confidence: semanticDetails.confidence || 0.55,
      classificationSource: 'semantic-kpi',
      details: {
        table: null,
        semantic: semanticDetails
      }
    }
  }

  if (semanticDetails?.type === 'key-value-candidate') {
    return {
      kind: STRUCTURED_REGION_KIND_KEY_VALUE,
      confidence: semanticDetails.confidence || 0.55,
      classificationSource: 'semantic-key-value',
      details: {
        table: null,
        semantic: semanticDetails
      }
    }
  }

  return {
    kind: STRUCTURED_REGION_KIND_UNKNOWN,
    confidence: 0,
    classificationSource: 'fallback',
    details: {
      table: null,
      semantic: semanticDetails
    }
  }
}

function buildRegionEntry(region, index) {
  const classification = classifyRegion(region)
  const dashboardGroup = region?.metadata?.semantic?.dashboardGroup || null

  return createStructuredLayoutRegion({
    regionId: region.id || `region-${index}`,
    kind: classification.kind,
    confidence: classification.confidence,
    sourceRegionType: region.type || STRUCTURED_REGION_KIND_UNKNOWN,
    boundingBox: getNormalizedBoundingBox(region.boundingBox || null),
    blockIds: region.blockIds || [],
    childRegionIds: region.childRegionIds || [],
    lineCount: Number(region?.metadata?.lineCount) || 0,
    groupId: dashboardGroup?.groupId || null,
    groupLayout: dashboardGroup?.layout || null,
    classificationSource: classification.classificationSource,
    details: classification.details
  })
}

function buildGroups(structuredRegions = []) {
  const groupMap = new Map()

  for (const region of structuredRegions) {
    if (!region.groupId) continue

    if (!groupMap.has(region.groupId)) {
      groupMap.set(region.groupId, {
        groupId: region.groupId,
        layout: region.groupLayout || 'row',
        confidenceValues: [],
        regionIds: [],
        regionKinds: [],
        boundingBoxes: []
      })
    }

    const group = groupMap.get(region.groupId)
    group.regionIds.push(region.regionId)
    group.regionKinds.push(region.kind)
    group.confidenceValues.push(region.confidence)
    if (region.boundingBox) {
      group.boundingBoxes.push(region.boundingBox)
    }
    if (region.groupLayout && group.layout === 'row') {
      group.layout = region.groupLayout
    }
  }

  return [...groupMap.values()]
    .filter((group) => group.regionIds.length > 1)
    .map((group) => {
      const kind = STRUCTURED_GROUP_KIND_GRID
      const confidence = group.confidenceValues.length
        ? group.confidenceValues.reduce((sum, value) => sum + value, 0) / group.confidenceValues.length
        : 0

      return createStructuredLayoutGroup({
        groupId: group.groupId,
        kind,
        layout: group.layout || 'row',
        confidence,
        boundingBox: unionBoundingBoxes(group.boundingBoxes),
        regionIds: group.regionIds,
        regionKinds: group.regionKinds
      })
    })
}

export function analyzeStructuredLayout({
  pageNumber = 0,
  pageSize = null,
  regions = []
} = {}) {
  if (!regions.length) {
    return createEmptyStructuredLayoutModel(pageNumber, pageSize)
  }

  const structuredRegions = regions.map((region, index) => buildRegionEntry(region, index))
  const groups = buildGroups(structuredRegions)

  return createStructuredLayoutModel({
    pageNumber,
    pageSize,
    regions: structuredRegions,
    groups
  })
}
