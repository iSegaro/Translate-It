/**
 * StructuredLayoutModel — shared, additive layout metadata for structured PDF regions.
 *
 * Phase 2d foundation: a page-level model that unifies table, KPI/card,
 * key-value, and dashboard/grid structure signals without changing the
 * existing line/region/block pipeline. The model is immutable and framework-agnostic.
 */

export const STRUCTURED_REGION_KIND_TABLE = 'table'
export const STRUCTURED_REGION_KIND_KPI = 'kpi'
export const STRUCTURED_REGION_KIND_KEY_VALUE = 'key-value'
export const STRUCTURED_REGION_KIND_UNKNOWN = 'unknown'

export const STRUCTURED_GROUP_KIND_GRID = 'grid'
export const STRUCTURED_GROUP_KIND_MIXED = 'mixed'

function normalizePageSize(pageSize = null) {
  if (!pageSize) return null

  return Object.freeze({
    width: Number(pageSize.width) || 0,
    height: Number(pageSize.height) || 0
  })
}

function normalizeConfidence(value = 0) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function freezeBoundingBox(boundingBox = null) {
  if (!boundingBox) return null
  return Object.freeze({
    x: Number(boundingBox.x) || 0,
    y: Number(boundingBox.y) || 0,
    width: Number(boundingBox.width) || 0,
    height: Number(boundingBox.height) || 0
  })
}

function freezeTableDetails(table = null) {
  if (!table) return null

  return Object.freeze({
    columnCount: Number(table.columnCount) || 0,
    rowCount: Number(table.rowCount) || 0,
    cellCount: Array.isArray(table.cells) ? table.cells.length : Number(table.cellCount) || 0,
    hasSpanCandidates: table.hasSpanCandidates === true,
    hasMergedCells: table.hasMergedCells === true,
    hasMultiLevelHeaders: table.hasMultiLevelHeaders === true
  })
}

function freezeSemanticDetails(semantic = null) {
  if (!semantic) return null

  return Object.freeze({
    type: semantic.type || null,
    confidence: normalizeConfidence(semantic.confidence || 0),
    dashboardGroupId: semantic.dashboardGroup?.groupId || null,
    dashboardGroupLayout: semantic.dashboardGroup?.layout || null,
    dashboardGroupRole: semantic.dashboardGroup?.role || null,
    metricCount: Array.isArray(semantic.metrics) ? semantic.metrics.length : 0,
    pairCount: Array.isArray(semantic.pairs) ? semantic.pairs.length : 0,
    hasFinancialStatement: semantic.financialStatement != null
  })
}

function freezeDetails(details = null) {
  if (!details) {
    return Object.freeze({
      table: null,
      semantic: null
    })
  }

  return Object.freeze({
    table: freezeTableDetails(details.table || null),
    semantic: freezeSemanticDetails(details.semantic || null)
  })
}

export function createStructuredLayoutRegion({
  regionId = '',
  kind = STRUCTURED_REGION_KIND_UNKNOWN,
  confidence = 0,
  sourceRegionType = null,
  boundingBox = null,
  blockIds = [],
  childRegionIds = [],
  lineCount = 0,
  groupId = null,
  groupLayout = null,
  classificationSource = 'fallback',
  details = null
} = {}) {
  return Object.freeze({
    regionId,
    kind,
    confidence: normalizeConfidence(confidence),
    sourceRegionType,
    boundingBox: freezeBoundingBox(boundingBox),
    blockIds: Object.freeze([...blockIds]),
    childRegionIds: Object.freeze([...childRegionIds]),
    lineCount: Number(lineCount) || 0,
    groupId,
    groupLayout,
    classificationSource,
    details: freezeDetails(details)
  })
}

export function createStructuredLayoutGroup({
  groupId = '',
  kind = STRUCTURED_GROUP_KIND_GRID,
  layout = 'row',
  confidence = 0,
  boundingBox = null,
  regionIds = [],
  regionKinds = []
} = {}) {
  return Object.freeze({
    groupId,
    kind,
    layout,
    confidence: normalizeConfidence(confidence),
    boundingBox: freezeBoundingBox(boundingBox),
    regionIds: Object.freeze([...regionIds]),
    regionKinds: Object.freeze([...regionKinds]),
    memberCount: regionIds.length
  })
}

function buildSummary(regions = [], groups = []) {
  const regionCount = regions.length
  const tableRegionCount = regions.filter((region) => region.kind === STRUCTURED_REGION_KIND_TABLE).length
  const kpiRegionCount = regions.filter((region) => region.kind === STRUCTURED_REGION_KIND_KPI).length
  const keyValueRegionCount = regions.filter((region) => region.kind === STRUCTURED_REGION_KIND_KEY_VALUE).length
  const fallbackRegionCount = regions.filter((region) => region.kind === STRUCTURED_REGION_KIND_UNKNOWN).length
  const groupedRegionCount = regions.filter((region) => region.groupId != null).length
  const gridGroupCount = groups.filter((group) => group.kind === STRUCTURED_GROUP_KIND_GRID).length
  const mixedGroupCount = groups.filter((group) => group.kind === STRUCTURED_GROUP_KIND_MIXED).length
  const structuredRegionCount = regionCount - fallbackRegionCount

  return Object.freeze({
    regionCount,
    structuredRegionCount,
    tableRegionCount,
    kpiRegionCount,
    keyValueRegionCount,
    fallbackRegionCount,
    groupedRegionCount,
    gridGroupCount,
    mixedGroupCount,
    hasStructuredContent: structuredRegionCount > 0 || groups.length > 0
  })
}

export function createStructuredLayoutModel({
  pageNumber = 0,
  pageSize = null,
  regions = [],
  groups = []
} = {}) {
  const frozenRegions = Object.freeze([...regions])
  const frozenGroups = Object.freeze([...groups])
  const summary = buildSummary(frozenRegions, frozenGroups)

  return Object.freeze({
    version: 1,
    pageNumber,
    pageSize: normalizePageSize(pageSize),
    regions: frozenRegions,
    groups: frozenGroups,
    summary,
    hasStructuredContent: summary.hasStructuredContent
  })
}

export function createEmptyStructuredLayoutModel(pageNumber = 0, pageSize = null) {
  return createStructuredLayoutModel({ pageNumber, pageSize, regions: [], groups: [] })
}

export function isStructuredLayoutModel(value) {
  if (!value || typeof value !== 'object') return false

  return (
    typeof value.version === 'number' &&
    typeof value.pageNumber === 'number' &&
    (value.pageSize === null || (
      typeof value.pageSize === 'object' &&
      typeof value.pageSize.width === 'number' &&
      typeof value.pageSize.height === 'number'
    )) &&
    Array.isArray(value.regions) &&
    Array.isArray(value.groups) &&
    value.summary != null &&
    typeof value.summary.regionCount === 'number' &&
    typeof value.summary.structuredRegionCount === 'number' &&
    typeof value.summary.tableRegionCount === 'number' &&
    typeof value.summary.kpiRegionCount === 'number' &&
    typeof value.summary.keyValueRegionCount === 'number' &&
    typeof value.summary.fallbackRegionCount === 'number' &&
    typeof value.summary.groupedRegionCount === 'number' &&
    typeof value.summary.gridGroupCount === 'number' &&
    typeof value.summary.mixedGroupCount === 'number' &&
    typeof value.summary.hasStructuredContent === 'boolean' &&
    typeof value.hasStructuredContent === 'boolean'
  )
}
