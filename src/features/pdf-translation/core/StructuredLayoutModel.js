/**
 * StructuredLayoutModel — canonical structured-layout graph for PDF regions.
 *
 * Phase 2d / Phase 1b: this model is the canonical structured source of truth
 * for table, KPI/card, key-value, and dashboard-like structures. It is
 * immutable, framework-agnostic, and additive to the existing line/region/block
 * pipeline. `metadata.table` remains unchanged for backward compatibility, but
 * future consumers should read `metadata.structured` first.
 */

export const STRUCTURED_REGION_KIND_TABLE = 'table'
export const STRUCTURED_REGION_KIND_KPI = 'kpi'
export const STRUCTURED_REGION_KIND_KEY_VALUE = 'key-value'
export const STRUCTURED_REGION_KIND_UNKNOWN = 'unknown'

export const STRUCTURED_GROUP_KIND_GRID = 'grid'
export const STRUCTURED_GROUP_KIND_MIXED = 'mixed'

const STRUCTURED_CELL_ROLE_CELL = 'cell'
const STRUCTURED_CELL_ROLE_HEADER = 'header'
const STRUCTURED_CELL_ROLE_LABEL = 'label'
const STRUCTURED_CELL_ROLE_VALUE = 'value'
const STRUCTURED_CELL_ROLE_DELTA = 'delta'
const STRUCTURED_CELL_ROLE_METRIC = 'metric'
const STRUCTURED_CELL_ROLE_UNKNOWN = 'unknown'

const STRUCTURED_SPAN_TYPE_NONE = 'none'
const STRUCTURED_SPAN_TYPE_CANDIDATE = 'candidate'
const STRUCTURED_SPAN_TYPE_MERGED = 'merged'

function normalizeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function normalizePageSize(pageSize = null) {
  if (!pageSize) return null

  return Object.freeze({
    width: normalizeNumber(pageSize.width),
    height: normalizeNumber(pageSize.height)
  })
}

function normalizeConfidence(value = 0) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function normalizeSpanSize(value = 1) {
  const span = Math.round(normalizeNumber(value, 1))
  return Math.max(1, span)
}

function freezeBoundingBox(boundingBox = null) {
  if (!boundingBox) return null

  return Object.freeze({
    x: normalizeNumber(boundingBox.x),
    y: normalizeNumber(boundingBox.y),
    width: normalizeNumber(boundingBox.width),
    height: normalizeNumber(boundingBox.height)
  })
}

function freezeStringArray(values = []) {
  const seen = new Set()
  const frozen = []

  for (const value of values) {
    if (typeof value !== 'string' || value.length === 0 || seen.has(value)) continue
    seen.add(value)
    frozen.push(value)
  }

  return Object.freeze(frozen)
}

function freezeNumberArray(values = [], { sort = true } = {}) {
  const seen = new Set()
  const frozen = []

  for (const value of values) {
    if (!Number.isFinite(value) || seen.has(value)) continue
    seen.add(value)
    frozen.push(value)
  }

  if (sort) {
    frozen.sort((a, b) => a - b)
  }

  return Object.freeze(frozen)
}

// `lineIds` are preserved when the upstream PDF pipeline exposes stable line
// identities; until then the canonical graph keeps the field as an empty array
// rather than inventing synthetic IDs.
function freezeSourceReferences({
  blockIds = [],
  lineIds = [],
  sourceLineIndices = [],
  sourceItemIndices = [],
  sourceRegionId = null,
  sourceRegionType = null,
  groupId = null,
  groupRegionIds = []
} = {}) {
  return Object.freeze({
    blockIds: freezeStringArray(blockIds),
    lineIds: freezeStringArray(lineIds),
    sourceLineIndices: freezeNumberArray(sourceLineIndices),
    sourceItemIndices: freezeNumberArray(sourceItemIndices),
    sourceRegionId,
    sourceRegionType,
    groupId,
    groupRegionIds: freezeStringArray(groupRegionIds)
  })
}

function freezeCompatibility(compatibility = null) {
  if (!compatibility) {
    return null
  }

  return deepFreeze({ ...compatibility })
}

function freezeStructureSignals(structureSignals = null) {
  if (!structureSignals) {
    return Object.freeze({})
  }

  const frozen = { ...structureSignals }
  if (frozen.table) frozen.table = freezeCompatibility(frozen.table)
  if (frozen.semantic) frozen.semantic = freezeCompatibility(frozen.semantic)
  if (frozen.signals) frozen.signals = freezeCompatibility(frozen.signals)
  if (frozen.tableSignals) frozen.tableSignals = freezeCompatibility(frozen.tableSignals)
  if (frozen.semanticSignals) frozen.semanticSignals = freezeCompatibility(frozen.semanticSignals)
  return deepFreeze(frozen)
}

function freezeRelationships(relationships = null) {
  if (!relationships) {
    return Object.freeze({})
  }

  const frozen = {
    ...relationships,
    rowIds: freezeStringArray(relationships.rowIds || []),
    columnIds: freezeStringArray(relationships.columnIds || []),
    cellIds: freezeStringArray(relationships.cellIds || []),
    spanIds: freezeStringArray(relationships.spanIds || []),
    rowToCellIds: Array.isArray(relationships.rowToCellIds)
      ? Object.freeze(relationships.rowToCellIds.map((ids) => freezeStringArray(ids || [])))
      : Object.freeze([]),
    columnToCellIds: Array.isArray(relationships.columnToCellIds)
      ? Object.freeze(relationships.columnToCellIds.map((ids) => freezeStringArray(ids || [])))
      : Object.freeze([]),
    spanToCellIds: Array.isArray(relationships.spanToCellIds)
      ? Object.freeze(relationships.spanToCellIds.map((ids) => freezeStringArray(ids || [])))
      : Object.freeze([]),
    sourceBlockIds: freezeStringArray(relationships.sourceBlockIds || []),
    sourceLineIndices: freezeNumberArray(relationships.sourceLineIndices || []),
    sourceItemIndices: freezeNumberArray(relationships.sourceItemIndices || []),
    groupRegionIds: freezeStringArray(relationships.groupRegionIds || [])
  }

  return Object.freeze(frozen)
}

function freezeGridOccupancyRow(row = []) {
  return Object.freeze(row.map((cell) => freezeGridOccupancyCell(cell)))
}

function freezeGridOccupancyCell(cell = null) {
  if (!cell) {
    return Object.freeze({
      rowIndex: 0,
      columnIndex: 0,
      state: 'missing',
      cellId: null,
      ownerCellId: null,
      rowSpan: 1,
      colSpan: 1,
      boundingBox: null
    })
  }

  return Object.freeze({
    rowIndex: normalizeNumber(cell.rowIndex),
    columnIndex: normalizeNumber(cell.columnIndex),
    state: cell.state || 'missing',
    cellId: cell.cellId || null,
    ownerCellId: cell.ownerCellId || null,
    rowSpan: normalizeSpanSize(cell.rowSpan || 1),
    colSpan: normalizeSpanSize(cell.colSpan || 1),
    boundingBox: freezeBoundingBox(cell.boundingBox || null)
  })
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  Object.freeze(value)
  for (const key of Object.keys(value)) {
    deepFreeze(value[key])
  }
  return value
}

function buildMissingGridOccupancy(rowCount, columnCount) {
  return Array.from({ length: rowCount }, (_, rowIndex) => Object.freeze(
    Array.from({ length: columnCount }, (_, columnIndex) => Object.freeze({
      rowIndex,
      columnIndex,
      state: 'missing',
      cellId: null,
      ownerCellId: null,
      rowSpan: 1,
      colSpan: 1,
      boundingBox: null
    }))
  ))
}

export function createStructuredLayoutRow({
  id = '',
  rowId = '',
  rowIndex = 0,
  boundingBox = null,
  cellIds = [],
  sourceReferences = null,
  compatibility = null
} = {}) {
  const canonicalId = id || rowId || `row-${rowIndex}`
  const row = {
    id: canonicalId,
    rowId: canonicalId,
    rowIndex: normalizeNumber(rowIndex),
    boundingBox: freezeBoundingBox(boundingBox),
    cellIds: freezeStringArray(cellIds),
    sourceReferences: freezeSourceReferences(sourceReferences || {})
  }

  if (compatibility) {
    row.compatibility = freezeCompatibility(compatibility)
  }

  return Object.freeze(row)
}

export function createStructuredLayoutColumn({
  id = '',
  columnId = '',
  columnIndex = 0,
  x = 0,
  width = 0,
  cellIds = [],
  sourceReferences = null,
  compatibility = null
} = {}) {
  const canonicalId = id || columnId || `col-${columnIndex}`
  const column = {
    id: canonicalId,
    columnId: canonicalId,
    columnIndex: normalizeNumber(columnIndex),
    x: normalizeNumber(x),
    width: normalizeNumber(width),
    cellIds: freezeStringArray(cellIds),
    sourceReferences: freezeSourceReferences(sourceReferences || {})
  }

  if (compatibility) {
    column.compatibility = freezeCompatibility(compatibility)
  }

  return Object.freeze(column)
}

export function createStructuredLayoutCell({
  id = '',
  cellId = '',
  regionId = '',
  rowIndex = 0,
  columnIndex = 0,
  rowSpan = 1,
  colSpan = 1,
  spanType = STRUCTURED_SPAN_TYPE_NONE,
  role = STRUCTURED_CELL_ROLE_UNKNOWN,
  text = '',
  boundingBox = null,
  sourceReferences = null,
  spanCandidate = false,
  estimatedRowSpan = 1,
  estimatedColSpan = 1,
  confidence = 0,
  compatibility = null
} = {}) {
  const canonicalId = id || cellId || `${regionId || 'cell'}-r${rowIndex}-c${columnIndex}`
  const normalizedSourceReferences = freezeSourceReferences(sourceReferences || {})

  const cell = {
    id: canonicalId,
    cellId: canonicalId,
    regionId,
    rowIndex: normalizeNumber(rowIndex),
    columnIndex: normalizeNumber(columnIndex),
    rowSpan: normalizeSpanSize(rowSpan),
    colSpan: normalizeSpanSize(colSpan),
    spanType: spanType || STRUCTURED_SPAN_TYPE_NONE,
    role: role || STRUCTURED_CELL_ROLE_UNKNOWN,
    text: text || '',
    boundingBox: freezeBoundingBox(boundingBox),
    sourceReferences: normalizedSourceReferences,
    blockIds: normalizedSourceReferences.blockIds,
    lineIds: normalizedSourceReferences.lineIds,
    sourceLineIndex: normalizedSourceReferences.sourceLineIndices.length > 0
      ? normalizedSourceReferences.sourceLineIndices[0]
      : null,
    sourceItemIndex: normalizedSourceReferences.sourceItemIndices.length > 0
      ? normalizedSourceReferences.sourceItemIndices[0]
      : null,
    spanCandidate: spanCandidate === true,
    estimatedRowSpan: normalizeSpanSize(estimatedRowSpan),
    estimatedColSpan: normalizeSpanSize(estimatedColSpan),
    confidence: normalizeConfidence(confidence)
  }

  if (compatibility) {
    cell.compatibility = freezeCompatibility(compatibility)
  }

  return Object.freeze(cell)
}

export function createStructuredLayoutSpan({
  id = '',
  spanId = '',
  regionId = '',
  rowIndex = 0,
  columnIndex = 0,
  rowSpan = 1,
  colSpan = 1,
  spanType = STRUCTURED_SPAN_TYPE_NONE,
  cellIds = [],
  boundingBox = null,
  confidence = 0,
  sourceReferences = null,
  compatibility = null
} = {}) {
  const canonicalId = id || spanId || `${regionId || 'span'}-r${rowIndex}-c${columnIndex}-${spanType}`
  const span = {
    id: canonicalId,
    spanId: canonicalId,
    regionId,
    rowIndex: normalizeNumber(rowIndex),
    columnIndex: normalizeNumber(columnIndex),
    rowSpan: normalizeSpanSize(rowSpan),
    colSpan: normalizeSpanSize(colSpan),
    spanType: spanType || STRUCTURED_SPAN_TYPE_NONE,
    cellIds: freezeStringArray(cellIds),
    boundingBox: freezeBoundingBox(boundingBox),
    confidence: normalizeConfidence(confidence),
    sourceReferences: freezeSourceReferences(sourceReferences || {})
  }

  if (compatibility) {
    span.compatibility = freezeCompatibility(compatibility)
  }

  return Object.freeze(span)
}

export function createStructuredLayoutGrid({
  dimensions = null,
  rows = [],
  columns = [],
  occupancy = []
} = {}) {
  const rowCount = normalizeNumber(dimensions?.rowCount, rows.length)
  const columnCount = normalizeNumber(dimensions?.columnCount, columns.length)
  const canonicalOccupancy = occupancy.length > 0
    ? occupancy.map((row) => freezeGridOccupancyRow(row))
    : (rowCount > 0 && columnCount > 0 ? buildMissingGridOccupancy(rowCount, columnCount) : [])

  return Object.freeze({
    dimensions: Object.freeze({
      rowCount,
      columnCount
    }),
    rows: Object.freeze([...rows]),
    columns: Object.freeze([...columns]),
    occupancy: Object.freeze(canonicalOccupancy)
  })
}

function freezeDetails(details = null) {
  if (!details) {
    return null
  }

  return Object.freeze({
    table: details.table ? deepFreeze({ ...details.table }) : null,
    semantic: details.semantic ? deepFreeze({ ...details.semantic }) : null
  })
}

export function createStructuredLayoutRegion({
  id = '',
  regionId = '',
  kind = STRUCTURED_REGION_KIND_UNKNOWN,
  subtype = null,
  confidence = 0,
  sourceRegionType = null,
  boundingBox = null,
  rows = [],
  columns = [],
  cells = [],
  spans = [],
  grid = null,
  relationships = null,
  structureSignals = null,
  sourceReferences = null,
  compatibility = null,
  details = null,
  blockIds = [],
  childRegionIds = [],
  lineCount = 0,
  groupId = null,
  groupLayout = null,
  classificationSource = 'fallback'
} = {}) {
  const canonicalId = id || regionId
  const frozenRows = Object.freeze([...rows])
  const frozenColumns = Object.freeze([...columns])
  const frozenCells = Object.freeze([...cells])
  const frozenSpans = Object.freeze([...spans])
  const frozenGrid = grid || createStructuredLayoutGrid({
    dimensions: { rowCount: frozenRows.length, columnCount: frozenColumns.length },
    rows: frozenRows,
    columns: frozenColumns,
    occupancy: []
  })

  const region = {
    id: canonicalId,
    regionId: canonicalId,
    kind,
    subtype,
    confidence: normalizeConfidence(confidence),
    sourceRegionType,
    boundingBox: freezeBoundingBox(boundingBox),
    rows: frozenRows,
    columns: frozenColumns,
    cells: frozenCells,
    spans: frozenSpans,
    grid: frozenGrid,
    relationships: freezeRelationships(relationships || {}),
    structureSignals: freezeStructureSignals(structureSignals || {}),
    sourceReferences: freezeSourceReferences(sourceReferences || {}),
    blockIds: freezeStringArray(blockIds),
    childRegionIds: freezeStringArray(childRegionIds),
    lineCount: normalizeNumber(lineCount),
    groupId,
    groupLayout,
    classificationSource
  }

  if (compatibility) {
    region.compatibility = freezeCompatibility(compatibility)
  }
  if (details) {
    region.details = freezeDetails(details)
  }

  return Object.freeze(region)
}

export function createStructuredLayoutGroup({
  id = '',
  groupId = '',
  kind = STRUCTURED_GROUP_KIND_GRID,
  layout = 'row',
  confidence = 0,
  boundingBox = null,
  regionIds = [],
  regionKinds = [],
  relationships = null,
  sourceReferences = null,
  structureSignals = null,
  compatibility = null
} = {}) {
  const canonicalId = id || groupId
  const frozenRegionIds = freezeStringArray(regionIds)
  const frozenRegionKinds = freezeStringArray(regionKinds)

  const group = {
    id: canonicalId,
    groupId: canonicalId,
    kind,
    layout,
    confidence: normalizeConfidence(confidence),
    boundingBox: freezeBoundingBox(boundingBox),
    regionIds: frozenRegionIds,
    regionKinds: frozenRegionKinds,
    memberCount: frozenRegionIds.length,
    relationships: freezeRelationships({
      ...(relationships || {}),
      groupRegionIds: frozenRegionIds
    }),
    sourceReferences: freezeSourceReferences(sourceReferences || {}),
    structureSignals: freezeStructureSignals(structureSignals || {})
  }

  if (compatibility) {
    group.compatibility = freezeCompatibility(compatibility)
  }

  return Object.freeze(group)
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
    version: 2,
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

function isBoundingBox(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  )
}

function isSourceReferences(value) {
  if (!value || typeof value !== 'object') return false
  return (
    Array.isArray(value.blockIds) &&
    (value.lineIds == null || Array.isArray(value.lineIds)) &&
    Array.isArray(value.sourceLineIndices) &&
    Array.isArray(value.sourceItemIndices) &&
    Array.isArray(value.groupRegionIds)
  )
}

function isRow(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.id === 'string' &&
    typeof value.rowIndex === 'number' &&
    (value.boundingBox === null || isBoundingBox(value.boundingBox)) &&
    Array.isArray(value.cellIds) &&
    isSourceReferences(value.sourceReferences) &&
    (value.compatibility == null || typeof value.compatibility === 'object')
  )
}

function isColumn(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.id === 'string' &&
    typeof value.columnIndex === 'number' &&
    typeof value.x === 'number' &&
    typeof value.width === 'number' &&
    Array.isArray(value.cellIds) &&
    isSourceReferences(value.sourceReferences) &&
    (value.compatibility == null || typeof value.compatibility === 'object')
  )
}

function isCell(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.id === 'string' &&
    typeof value.regionId === 'string' &&
    typeof value.rowIndex === 'number' &&
    typeof value.columnIndex === 'number' &&
    typeof value.rowSpan === 'number' &&
    typeof value.colSpan === 'number' &&
    typeof value.spanType === 'string' &&
    typeof value.role === 'string' &&
    typeof value.text === 'string' &&
    (value.boundingBox === null || isBoundingBox(value.boundingBox)) &&
    isSourceReferences(value.sourceReferences) &&
    typeof value.spanCandidate === 'boolean' &&
    typeof value.estimatedRowSpan === 'number' &&
    typeof value.estimatedColSpan === 'number' &&
    typeof value.confidence === 'number' &&
    (value.compatibility == null || typeof value.compatibility === 'object')
  )
}

function isSpan(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.id === 'string' &&
    typeof value.regionId === 'string' &&
    typeof value.rowIndex === 'number' &&
    typeof value.columnIndex === 'number' &&
    typeof value.rowSpan === 'number' &&
    typeof value.colSpan === 'number' &&
    typeof value.spanType === 'string' &&
    Array.isArray(value.cellIds) &&
    (value.boundingBox === null || isBoundingBox(value.boundingBox)) &&
    typeof value.confidence === 'number' &&
    isSourceReferences(value.sourceReferences) &&
    (value.compatibility == null || typeof value.compatibility === 'object')
  )
}

function isGrid(value) {
  if (!value || typeof value !== 'object') return false
  return (
    value.dimensions != null &&
    typeof value.dimensions.rowCount === 'number' &&
    typeof value.dimensions.columnCount === 'number' &&
    Array.isArray(value.rows) &&
    Array.isArray(value.columns) &&
    Array.isArray(value.occupancy)
  )
}

function isRelationships(value) {
  if (!value || typeof value !== 'object') return false
  return (
    Array.isArray(value.rowIds) &&
    Array.isArray(value.columnIds) &&
    Array.isArray(value.cellIds) &&
    Array.isArray(value.spanIds) &&
    Array.isArray(value.rowToCellIds) &&
    Array.isArray(value.columnToCellIds) &&
    Array.isArray(value.spanToCellIds) &&
    Array.isArray(value.sourceBlockIds) &&
    Array.isArray(value.sourceLineIndices) &&
    Array.isArray(value.sourceItemIndices) &&
    Array.isArray(value.groupRegionIds)
  )
}

function isStructureSignals(value) {
  return !!value && typeof value === 'object'
}

function arraysMatch(a = [], b = []) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function isRegion(value) {
  if (!value || typeof value !== 'object') return false
  if (
    typeof value.id !== 'string' ||
    typeof value.regionId !== 'string' ||
    typeof value.kind !== 'string' ||
    typeof value.confidence !== 'number' ||
    (value.subtype != null && typeof value.subtype !== 'string') ||
    (value.boundingBox !== null && !isBoundingBox(value.boundingBox)) ||
    !Array.isArray(value.rows) ||
    !Array.isArray(value.columns) ||
    !Array.isArray(value.cells) ||
    !Array.isArray(value.spans) ||
    !isGrid(value.grid) ||
    !isRelationships(value.relationships) ||
    !isStructureSignals(value.structureSignals) ||
    !isSourceReferences(value.sourceReferences) ||
    !Array.isArray(value.blockIds) ||
    !Array.isArray(value.childRegionIds) ||
    typeof value.lineCount !== 'number'
  ) {
    return false
  }

  if (value.compatibility != null && typeof value.compatibility !== 'object') return false
  if (value.details != null && typeof value.details !== 'object') return false

  if (value.rows.some((row) => !isRow(row))) return false
  if (value.columns.some((column) => !isColumn(column))) return false
  if (value.cells.some((cell) => !isCell(cell))) return false
  if (value.spans.some((span) => !isSpan(span))) return false

  const rowIds = new Set(value.rows.map((row) => row.id))
  const columnIds = new Set(value.columns.map((column) => column.id))
  const cellIds = new Set(value.cells.map((cell) => cell.id))
  const spanIds = new Set(value.spans.map((span) => span.id))

  if (rowIds.size !== value.rows.length) return false
  if (columnIds.size !== value.columns.length) return false
  if (cellIds.size !== value.cells.length) return false
  if (spanIds.size !== value.spans.length) return false

  if (!arraysMatch(value.relationships.rowIds, value.rows.map((row) => row.id))) return false
  if (!arraysMatch(value.relationships.columnIds, value.columns.map((column) => column.id))) return false
  if (!arraysMatch(value.relationships.cellIds, value.cells.map((cell) => cell.id))) return false
  if (!arraysMatch(value.relationships.spanIds, value.spans.map((span) => span.id))) return false
  if (value.relationships.rowToCellIds.length !== value.rows.length) return false
  if (value.relationships.columnToCellIds.length !== value.columns.length) return false
  if (value.relationships.spanToCellIds.length !== value.spans.length) return false
  if (!value.rows.every((row, index) => arraysMatch(value.relationships.rowToCellIds[index] || [], row.cellIds))) return false
  if (!value.columns.every((column, index) => arraysMatch(value.relationships.columnToCellIds[index] || [], column.cellIds))) return false
  if (!value.spans.every((span, index) => arraysMatch(value.relationships.spanToCellIds[index] || [], span.cellIds))) return false
  if (value.sourceReferences.sourceRegionId != null && value.sourceReferences.sourceRegionId !== value.regionId) return false
  if (value.sourceReferences.groupId != null && value.groupId == null) return false
  if (value.sourceReferences.groupId != null && value.groupId != null && value.sourceReferences.groupId !== value.groupId) return false

  if (value.grid.rows.length !== value.rows.length) return false
  if (value.grid.columns.length !== value.columns.length) return false
  if (value.grid.dimensions.rowCount !== value.rows.length) return false
  if (value.grid.dimensions.columnCount !== value.columns.length) return false
  if (value.grid.occupancy.length !== value.rows.length) return false
  if (value.grid.occupancy.some((row) => row.length !== value.columns.length)) return false
  if (!arraysMatch(value.grid.rows.map((row) => row.id), value.rows.map((row) => row.id))) return false
  if (!arraysMatch(value.grid.columns.map((column) => column.id), value.columns.map((column) => column.id))) return false

  const rowCellLookup = new Map(value.rows.map((row) => [row.id, new Set(row.cellIds)]))
  const columnCellLookup = new Map(value.columns.map((column) => [column.id, new Set(column.cellIds)]))

  for (const cell of value.cells) {
    if (cell.rowIndex < 0 || cell.rowIndex >= value.rows.length) return false
    if (cell.columnIndex < 0 || cell.columnIndex >= value.columns.length) return false
    if (!rowIds.has(value.rows[cell.rowIndex].id)) return false
    if (!columnIds.has(value.columns[cell.columnIndex].id)) return false
  }

  for (const row of value.rows) {
    for (const cellId of row.cellIds) {
      if (!cellIds.has(cellId)) return false
    }
  }

  if (!value.rows.every((row) => row.cellIds.every((cellId) => cellIds.has(cellId)))) return false

  for (const column of value.columns) {
    for (const cellId of column.cellIds) {
      if (!cellIds.has(cellId)) return false
    }
  }

  if (!value.rows.every((row) => row.sourceReferences.sourceRegionId == null || row.sourceReferences.sourceRegionId === value.regionId)) return false
  if (!value.columns.every((column) => column.sourceReferences.sourceRegionId == null || column.sourceReferences.sourceRegionId === value.regionId)) return false
  if (!value.cells.every((cell) => cell.sourceReferences.sourceRegionId == null || cell.sourceReferences.sourceRegionId === value.regionId)) return false
  if (!value.spans.every((span) => span.sourceReferences.sourceRegionId == null || span.sourceReferences.sourceRegionId === value.regionId)) return false
  if (value.groupId != null) {
    if (!value.rows.every((row) => row.sourceReferences.groupId == null || row.sourceReferences.groupId === value.groupId)) return false
    if (!value.columns.every((column) => column.sourceReferences.groupId == null || column.sourceReferences.groupId === value.groupId)) return false
    if (!value.cells.every((cell) => cell.sourceReferences.groupId == null || cell.sourceReferences.groupId === value.groupId)) return false
    if (!value.spans.every((span) => span.sourceReferences.groupId == null || span.sourceReferences.groupId === value.groupId)) return false
  }

  if (!value.columns.every((column) => column.cellIds.every((cellId) => cellIds.has(cellId)))) return false

  for (let rowIndex = 0; rowIndex < value.grid.occupancy.length; rowIndex++) {
    for (let columnIndex = 0; columnIndex < value.grid.occupancy[rowIndex].length; columnIndex++) {
      const occupancyCell = value.grid.occupancy[rowIndex][columnIndex]
      if (!occupancyCell || typeof occupancyCell !== 'object') return false
      if (occupancyCell.rowIndex !== rowIndex || occupancyCell.columnIndex !== columnIndex) return false
      if (!['occupied', 'covered', 'missing'].includes(occupancyCell.state)) return false
      if (occupancyCell.boundingBox !== null && !isBoundingBox(occupancyCell.boundingBox)) return false
      if (occupancyCell.cellId != null && !cellIds.has(occupancyCell.cellId)) return false
      if (occupancyCell.ownerCellId != null && !cellIds.has(occupancyCell.ownerCellId)) return false
    }
  }

  for (const span of value.spans) {
    for (const cellId of span.cellIds) {
      if (!cellIds.has(cellId)) return false
    }
  }

  for (const row of value.rows) {
    for (const cellId of row.cellIds) {
      if (!rowCellLookup.get(row.id).has(cellId)) return false
    }
  }

  for (const column of value.columns) {
    for (const cellId of column.cellIds) {
      if (!columnCellLookup.get(column.id).has(cellId)) return false
    }
  }

  return true
}

function isGroup(value) {
  if (!value || typeof value !== 'object') return false
  if (
    typeof value.id !== 'string' ||
    typeof value.groupId !== 'string' ||
    typeof value.kind !== 'string' ||
    typeof value.layout !== 'string' ||
    typeof value.confidence !== 'number' ||
    (value.boundingBox !== null && !isBoundingBox(value.boundingBox)) ||
    !Array.isArray(value.regionIds) ||
    !Array.isArray(value.regionKinds) ||
    typeof value.memberCount !== 'number' ||
    !isRelationships(value.relationships) ||
    !isSourceReferences(value.sourceReferences) ||
    !isStructureSignals(value.structureSignals)
  ) {
    return false
  }

  if (value.sourceReferences.sourceRegionId != null && value.sourceReferences.sourceRegionId !== value.groupId) return false
  if (value.sourceReferences.groupId != null && value.sourceReferences.groupId !== value.groupId) return false

  return (
    (value.compatibility == null || typeof value.compatibility === 'object')
  )
}

export function isStructuredLayoutRegion(value) {
  return isRegion(value)
}

export function isStructuredLayoutGroup(value) {
  return isGroup(value)
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
    typeof value.hasStructuredContent === 'boolean' &&
    value.regions.every((region) => isStructuredLayoutRegion(region)) &&
    value.groups.every((group) => isStructuredLayoutGroup(group))
  )
}

export {
  STRUCTURED_CELL_ROLE_CELL,
  STRUCTURED_CELL_ROLE_DELTA,
  STRUCTURED_CELL_ROLE_HEADER,
  STRUCTURED_CELL_ROLE_LABEL,
  STRUCTURED_CELL_ROLE_METRIC,
  STRUCTURED_CELL_ROLE_UNKNOWN,
  STRUCTURED_CELL_ROLE_VALUE,
  STRUCTURED_SPAN_TYPE_CANDIDATE,
  STRUCTURED_SPAN_TYPE_MERGED,
  STRUCTURED_SPAN_TYPE_NONE
}
