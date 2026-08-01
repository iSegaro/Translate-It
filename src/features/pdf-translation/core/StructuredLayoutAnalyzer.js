/**
 * StructuredLayoutAnalyzer — canonical structured-layout builder for PDF pages.
 *
 * Phase 2d / Phase 1b: converts table metadata and semantic region signals into
 * the canonical structured graph used by future overlay/cache/adapter code.
 * Existing table metadata stays untouched; this module only derives the additive
 * `metadata.structured` graph.
 */

import {
  createEmptyStructuredLayoutModel,
  createStructuredLayoutCell,
  createStructuredLayoutColumn,
  createStructuredLayoutGroup,
  createStructuredLayoutGrid,
  createStructuredLayoutModel,
  createStructuredLayoutRegion,
  createStructuredLayoutRow,
  createStructuredLayoutSpan,
  STRUCTURED_SPAN_TYPE_CANDIDATE,
  STRUCTURED_CELL_ROLE_CELL,
  STRUCTURED_CELL_ROLE_DELTA,
  STRUCTURED_CELL_ROLE_LABEL,
  STRUCTURED_CELL_ROLE_VALUE,
  STRUCTURED_GROUP_KIND_GRID,
  STRUCTURED_REGION_KIND_KEY_VALUE,
  STRUCTURED_REGION_KIND_KPI,
  STRUCTURED_REGION_KIND_TABLE,
  STRUCTURED_REGION_KIND_UNKNOWN,
  STRUCTURED_SPAN_TYPE_MERGED,
  STRUCTURED_SPAN_TYPE_NONE
} from './StructuredLayoutModel.js'

const KPI_SUBTYPE_CARD = 'kpi-card'
const KPI_SUBTYPE_FINANCIAL = 'financial-kpi'
const KEY_VALUE_SUBTYPE_GRID = 'key-value-grid'
const KEY_VALUE_SUBTYPE_FINANCIAL = 'financial-key-value'
const TABLE_SUBTYPE_TABLE = 'table'
const UNKNOWN_SUBTYPE_UNKNOWN = 'unknown'

const KPI_ROLE_ORDER = [STRUCTURED_CELL_ROLE_LABEL, STRUCTURED_CELL_ROLE_VALUE, STRUCTURED_CELL_ROLE_DELTA]
const KEY_VALUE_ROLE_ORDER = [STRUCTURED_CELL_ROLE_LABEL, STRUCTURED_CELL_ROLE_VALUE]

function normalizeBoundingBox(box = null) {
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

  return normalizeBoundingBox({
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y)
  })
}

function normalizeText(text = '') {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function getLineByIndex(lines, index) {
  if (!Number.isInteger(index) || index < 0 || index >= lines.length) return null
  return lines[index] || null
}

function getIntersectionArea(a = null, b = null) {
  if (!a || !b) return 0
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  const width = Math.max(0, x2 - x1)
  const height = Math.max(0, y2 - y1)
  return width * height
}

function resolveLineItem(line, { targetText = '', targetBox = null } = {}) {
  if (!line) return null

  const items = Array.isArray(line.items) ? line.items : []
  if (!items.length) {
    return {
      itemIndex: 0,
      boundingBox: normalizeBoundingBox(line.boundingBox || null)
    }
  }

  const normalizedTargetText = normalizeText(targetText)
  if (normalizedTargetText) {
    const exactMatch = items.find((item) => normalizeText(item.text) === normalizedTargetText)
    if (exactMatch) {
      return {
        itemIndex: Number.isInteger(exactMatch.index) ? exactMatch.index : items.indexOf(exactMatch),
        boundingBox: normalizeBoundingBox(exactMatch)
      }
    }

    const partialMatch = items.find((item) => normalizeText(item.text).includes(normalizedTargetText))
    if (partialMatch) {
      return {
        itemIndex: Number.isInteger(partialMatch.index) ? partialMatch.index : items.indexOf(partialMatch),
        boundingBox: normalizeBoundingBox(partialMatch)
      }
    }
  }

  const normalizedTargetBox = normalizeBoundingBox(targetBox)
  if (normalizedTargetBox) {
    let bestItem = null
    let bestScore = 0
    for (const item of items) {
      const itemBox = normalizeBoundingBox(item)
      const score = getIntersectionArea(itemBox, normalizedTargetBox)
      if (score > bestScore) {
        bestItem = item
        bestScore = score
      }
    }
    if (bestItem) {
      return {
        itemIndex: Number.isInteger(bestItem.index) ? bestItem.index : items.indexOf(bestItem),
        boundingBox: normalizeBoundingBox(bestItem)
      }
    }
  }

  const firstItem = items[0]
  return {
    itemIndex: Number.isInteger(firstItem.index) ? firstItem.index : 0,
    boundingBox: normalizeBoundingBox(firstItem)
  }
}

function getTableSummary(table = null) {
  if (!table) return null

  return {
    columnCount: table.columnCount || 0,
    rowCount: table.rowCount || 0,
    cellCount: Array.isArray(table.cells) ? table.cells.length : 0,
    hasSpanCandidates: table.hasSpanCandidates === true,
    hasMergedCells: table.hasMergedCells === true,
    hasMultiLevelHeaders: table.hasMultiLevelHeaders === true
  }
}

function getSemanticSummary(semantic = null) {
  if (!semantic) return null

  return {
    type: semantic.type || null,
    confidence: semantic.confidence || 0,
    dashboardGroupId: semantic.dashboardGroup?.groupId || null,
    dashboardGroupLayout: semantic.dashboardGroup?.layout || null,
    dashboardGroupRole: semantic.dashboardGroup?.role || null,
    metricCount: Array.isArray(semantic.metrics) ? semantic.metrics.length : 0,
    pairCount: Array.isArray(semantic.pairs) ? semantic.pairs.length : 0,
    hasFinancialStatement: semantic.financialStatement != null
  }
}

function classifyRegion(region) {
  const table = region?.metadata?.table || null
  const semantic = region?.metadata?.semantic || null
  const tableSummary = getTableSummary(table)
  const semanticSummary = getSemanticSummary(semantic)

  if (tableSummary) {
    return {
      kind: STRUCTURED_REGION_KIND_TABLE,
      subtype: TABLE_SUBTYPE_TABLE,
      confidence: tableSummary.cellCount > 0 || tableSummary.columnCount > 0 || tableSummary.rowCount > 0 ? 0.9 : 0.75,
      classificationSource: 'table',
      details: {
        table: tableSummary,
        semantic: semanticSummary
      },
      structureSignals: {
        sourceType: 'table',
        classificationSource: 'table',
        confidence: tableSummary.cellCount > 0 || tableSummary.columnCount > 0 || tableSummary.rowCount > 0 ? 0.9 : 0.75,
        table: tableSummary,
        semantic: semanticSummary
      },
      compatibility: {
        table,
        semantic,
        classificationSource: 'table',
        sourceRegionType: region?.type || null,
        groupId: semantic?.dashboardGroup?.groupId || null,
        groupLayout: semantic?.dashboardGroup?.layout || null
      }
    }
  }

  if (semanticSummary?.type === 'kpi-candidate') {
    return {
      kind: STRUCTURED_REGION_KIND_KPI,
      subtype: semanticSummary.hasFinancialStatement ? KPI_SUBTYPE_FINANCIAL : KPI_SUBTYPE_CARD,
      confidence: semanticSummary.confidence || 0.55,
      classificationSource: 'semantic-kpi',
      details: {
        table: null,
        semantic: semanticSummary
      },
      structureSignals: {
        sourceType: 'semantic',
        classificationSource: 'semantic-kpi',
        confidence: semanticSummary.confidence || 0.55,
        kpi: semanticSummary,
        semantic: semanticSummary,
        signals: semantic?.signals || null
      },
      compatibility: {
        table: null,
        semantic,
        classificationSource: 'semantic-kpi',
        sourceRegionType: region?.type || null,
        groupId: semantic?.dashboardGroup?.groupId || null,
        groupLayout: semantic?.dashboardGroup?.layout || null
      }
    }
  }

  if (semanticSummary?.type === 'key-value-candidate') {
    return {
      kind: STRUCTURED_REGION_KIND_KEY_VALUE,
      subtype: semanticSummary.hasFinancialStatement ? KEY_VALUE_SUBTYPE_FINANCIAL : KEY_VALUE_SUBTYPE_GRID,
      confidence: semanticSummary.confidence || 0.55,
      classificationSource: 'semantic-key-value',
      details: {
        table: null,
        semantic: semanticSummary
      },
      structureSignals: {
        sourceType: 'semantic',
        classificationSource: 'semantic-key-value',
        confidence: semanticSummary.confidence || 0.55,
        keyValue: semanticSummary,
        semantic: semanticSummary,
        signals: semantic?.signals || null
      },
      compatibility: {
        table: null,
        semantic,
        classificationSource: 'semantic-key-value',
        sourceRegionType: region?.type || null,
        groupId: semantic?.dashboardGroup?.groupId || null,
        groupLayout: semantic?.dashboardGroup?.layout || null
      }
    }
  }

  return {
    kind: STRUCTURED_REGION_KIND_UNKNOWN,
    subtype: UNKNOWN_SUBTYPE_UNKNOWN,
    confidence: 0,
    classificationSource: 'fallback',
    details: {
      table: null,
      semantic: semanticSummary
    },
    structureSignals: {
      sourceType: 'fallback',
      classificationSource: 'fallback',
      confidence: 0,
      semantic: semanticSummary
    },
    compatibility: {
      table: null,
      semantic,
      classificationSource: 'fallback',
      sourceRegionType: region?.type || null,
      groupId: semantic?.dashboardGroup?.groupId || null,
      groupLayout: semantic?.dashboardGroup?.layout || null
    }
  }
}

function buildTableColumns(regionId, table, blockIds) {
  const columns = Array.isArray(table.columns) ? table.columns : []
  const cells = Array.isArray(table.cells) ? table.cells : []

  return columns.map((column, columnIndex) => {
    const columnCellIds = cells
      .filter((cell) => (cell.columnIndex ?? column.index ?? columnIndex) === columnIndex)
      .map((cell) => cell.cellId || `${regionId}-r${cell.rowIndex}-c${cell.columnIndex}`)

    return createStructuredLayoutColumn({
      id: `${regionId}-col-${columnIndex}`,
      columnIndex,
      x: column.x,
      width: column.width,
      cellIds: columnCellIds,
      sourceReferences: {
        blockIds,
        sourceLineIndices: cells
          .filter((cell) => (cell.columnIndex ?? column.index ?? columnIndex) === columnIndex)
          .flatMap((cell) => (Number.isInteger(cell.sourceLineIndex) ? [cell.sourceLineIndex] : [])),
        sourceItemIndices: cells
          .filter((cell) => (cell.columnIndex ?? column.index ?? columnIndex) === columnIndex)
          .flatMap((cell) => (Number.isInteger(cell.sourceItemIndex) ? [cell.sourceItemIndex] : []))
      },
      compatibility: {
        align: column.align || null,
        itemCount: column.itemCount || 0,
        averageWidth: column.averageWidth || null
      }
    })
  })
}

function buildTableRows(regionId, table, columns, cells, blockIds) {
  const rows = Array.isArray(table.rows) ? table.rows : []

  return rows.map((row, rowIndex) => {
    const currentRowIndex = Number.isInteger(row.index) ? row.index : rowIndex
    const rowCells = cells
      .filter((cell) => cell.rowIndex === currentRowIndex)
      .sort((a, b) => a.columnIndex - b.columnIndex)

    return createStructuredLayoutRow({
      id: `${regionId}-row-${currentRowIndex}`,
      rowIndex: currentRowIndex,
      boundingBox: {
        x: columns.length ? columns[0].x : 0,
        y: row.y || 0,
        width: columns.length ? (columns[columns.length - 1].x + columns[columns.length - 1].width) - columns[0].x : 0,
        height: row.height || 0
      },
      cellIds: rowCells.map((cell) => cell.id),
      sourceReferences: {
        blockIds,
        sourceLineIndices: [
          ...(Array.isArray(row.lineIndices) ? row.lineIndices : []),
          ...rowCells.flatMap((cell) => (Number.isInteger(cell.sourceLineIndex) ? [cell.sourceLineIndex] : []))
        ],
        sourceItemIndices: rowCells.flatMap((cell) => (Number.isInteger(cell.sourceItemIndex) ? [cell.sourceItemIndex] : []))
      },
      compatibility: {
        lineIndices: Array.isArray(row.lineIndices) ? row.lineIndices : [],
        lineCount: row.lineCount || 0
      }
    })
  })
}

function buildTableCells(regionId, table, classification, blockIds) {
  const cells = Array.isArray(table.cells) ? table.cells : []
  const gridRows = Array.isArray(table.grid?.rows) ? table.grid.rows : []
  const occupancyRows = Array.isArray(table.grid?.occupancy) ? table.grid.occupancy : []
  const gridCellLookup = new Map()

  for (const row of gridRows) {
    for (const gridCell of row || []) {
      if (gridCell?.cellId == null) continue
      gridCellLookup.set(`${gridCell.rowIndex}:${gridCell.columnIndex}`, gridCell)
    }
  }

  return cells.map((cell, cellIndex) => {
    const rowIndex = Number.isInteger(cell.rowIndex) ? cell.rowIndex : 0
    const columnIndex = Number.isInteger(cell.columnIndex) ? cell.columnIndex : 0
    const gridCell = gridCellLookup.get(`${rowIndex}:${columnIndex}`) || null
    const occupancyCell = occupancyRows[rowIndex]?.[columnIndex] || null
    const rowSpan = gridCell?.rowSpan || occupancyCell?.rowSpan || 1
    const colSpan = gridCell?.colSpan || occupancyCell?.colSpan || (cell.spanCandidate && cell.estimatedColSpan > 1 ? cell.estimatedColSpan : 1)
    const spanType = gridCell?.spanType === 'colspan-candidate' || cell.spanCandidate === true || (cell.estimatedColSpan || 1) > 1
      ? STRUCTURED_SPAN_TYPE_CANDIDATE
      : STRUCTURED_SPAN_TYPE_NONE

    return createStructuredLayoutCell({
      id: cell.cellId || `${regionId}-r${rowIndex}-c${columnIndex}-i${cellIndex}`,
      cellId: cell.cellId || `${regionId}-r${rowIndex}-c${columnIndex}-i${cellIndex}`,
      regionId,
      rowIndex,
      columnIndex,
      rowSpan,
      colSpan,
      spanType,
      role: STRUCTURED_CELL_ROLE_CELL,
      text: cell.text || '',
      boundingBox: cell.boundingBox || null,
      sourceReferences: {
        blockIds,
        lineIds: [],
        sourceLineIndices: Number.isInteger(cell.sourceLineIndex) ? [cell.sourceLineIndex] : [],
        sourceItemIndices: Number.isInteger(cell.sourceItemIndex) ? [cell.sourceItemIndex] : [],
        sourceRegionId: regionId,
        sourceRegionType: STRUCTURED_REGION_KIND_TABLE
      },
      spanCandidate: cell.spanCandidate === true,
      estimatedRowSpan: 1,
      estimatedColSpan: cell.estimatedColSpan || colSpan || 1,
      confidence: classification.confidence,
      compatibility: {
        spanCandidate: cell.spanCandidate === true,
        estimatedRowSpan: 1,
        estimatedColSpan: cell.estimatedColSpan || colSpan || 1,
        confidence: classification.confidence
      }
    })
  })
}

function buildTableSpans(regionId, cells) {
  const spans = []

  for (const cell of cells) {
    if (!cell.spanCandidate && cell.rowSpan <= 1 && cell.colSpan <= 1) continue
    spans.push(createStructuredLayoutSpan({
      id: `${regionId}-span-${cell.rowIndex}-${cell.columnIndex}-${cell.spanCandidate ? STRUCTURED_SPAN_TYPE_CANDIDATE : STRUCTURED_SPAN_TYPE_MERGED}`,
      regionId,
      rowIndex: cell.rowIndex,
      columnIndex: cell.columnIndex,
      rowSpan: cell.rowSpan,
      colSpan: cell.colSpan,
      spanType: cell.spanCandidate ? STRUCTURED_SPAN_TYPE_CANDIDATE : STRUCTURED_SPAN_TYPE_MERGED,
      cellIds: [cell.id],
      boundingBox: cell.boundingBox || null,
      confidence: cell.confidence,
      sourceReferences: cell.sourceReferences,
      compatibility: {
        spanCandidate: cell.spanCandidate,
        estimatedRowSpan: cell.estimatedRowSpan,
        estimatedColSpan: cell.estimatedColSpan,
        confidence: cell.confidence
      }
    }))
  }

  return spans
}

function buildTableOccupancy(table, rows, columns, cells) {
  const tableOccupancy = Array.isArray(table.grid?.occupancy) ? table.grid.occupancy : []
  if (tableOccupancy.length && tableOccupancy.every((row) => Array.isArray(row))) {
    return tableOccupancy
  }

  const cellMap = new Map(cells.map((cell) => [`${cell.rowIndex}:${cell.columnIndex}`, cell]))
  return rows.map((row) => columns.map((column) => {
    const cell = cellMap.get(`${row.rowIndex}:${column.columnIndex}`) || null
    if (cell) {
      return {
        rowIndex: row.rowIndex,
        columnIndex: column.columnIndex,
        state: 'occupied',
        cellId: cell.id,
        ownerCellId: cell.id,
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
        boundingBox: cell.boundingBox || null
      }
    }

    return {
      rowIndex: row.rowIndex,
      columnIndex: column.columnIndex,
      state: 'missing',
      cellId: null,
      ownerCellId: null,
      rowSpan: 1,
      colSpan: 1,
      boundingBox: row.boundingBox
        ? {
            x: column.x,
            y: row.boundingBox.y,
            width: column.width,
            height: row.boundingBox.height
          }
        : null
    }
  }))
}

function buildTableStructuredRegion(region, index, classification) {
  const table = region?.metadata?.table || null
  if (!table) {
    return buildEmptyStructuredRegion(region, index, classification, STRUCTURED_REGION_KIND_UNKNOWN)
  }

  const blockIds = region.blockIds || []
  const cells = buildTableCells(region.id || `region-${index}`, table, classification, blockIds)
  const columns = buildTableColumns(region.id || `region-${index}`, table, blockIds)
  const rows = buildTableRows(region.id || `region-${index}`, table, columns, cells, blockIds)
  const spans = buildTableSpans(region.id || `region-${index}`, cells)
  const occupancy = buildTableOccupancy(table, rows, columns, cells)
  const grid = createStructuredLayoutGrid({
    dimensions: {
      rowCount: rows.length,
      columnCount: columns.length
    },
    rows,
    columns,
    occupancy
  })

  const rowIds = rows.map((row) => row.id)
  const columnIds = columns.map((column) => column.id)
  const cellIds = cells.map((cell) => cell.id)
  const spanIds = spans.map((span) => span.id)
  const sourceLineIndices = []
  const sourceItemIndices = []

  for (const row of rows) {
    for (const lineIndex of row.sourceReferences.sourceLineIndices) {
      if (!sourceLineIndices.includes(lineIndex)) sourceLineIndices.push(lineIndex)
    }
    for (const itemIndex of row.sourceReferences.sourceItemIndices) {
      if (!sourceItemIndices.includes(itemIndex)) sourceItemIndices.push(itemIndex)
    }
  }

  const relationships = {
    rowIds,
    columnIds,
    cellIds,
    spanIds,
    rowToCellIds: rows.map((row) => row.cellIds),
    columnToCellIds: columns.map((column) => column.cellIds),
    spanToCellIds: spans.map((span) => span.cellIds),
    sourceBlockIds: region.blockIds || [],
    sourceLineIndices,
    sourceItemIndices,
    groupId: region.metadata?.semantic?.dashboardGroup?.groupId || null,
    groupRegionIds: []
  }

  const semantic = region.metadata?.semantic || null
  const semanticSummary = getSemanticSummary(semantic)
  const tableSummary = getTableSummary(table)

  return createStructuredLayoutRegion({
    id: region.id || `region-${index}`,
    regionId: region.id || `region-${index}`,
    kind: STRUCTURED_REGION_KIND_TABLE,
    subtype: TABLE_SUBTYPE_TABLE,
    confidence: classification.confidence,
    sourceRegionType: region.type || STRUCTURED_REGION_KIND_UNKNOWN,
    boundingBox: normalizeBoundingBox(region.boundingBox || null),
    rows,
    columns,
    cells,
    spans,
    grid,
    relationships,
    structureSignals: {
      sourceType: 'table',
      classificationSource: classification.classificationSource,
      confidence: classification.confidence,
      table: tableSummary,
      semantic: semanticSummary,
      signals: {
        rowCount: rows.length,
        columnCount: columns.length,
        cellCount: cells.length,
        spanCount: spans.length
      }
    },
    sourceReferences: {
      blockIds: region.blockIds || [],
      lineIds: [],
      sourceLineIndices,
      sourceItemIndices,
      sourceRegionId: region.id || `region-${index}`,
      sourceRegionType: region.type || STRUCTURED_REGION_KIND_UNKNOWN,
      groupId: relationships.groupId,
      groupRegionIds: []
    },
    compatibility: classification.compatibility,
    details: classification.details,
    blockIds: region.blockIds || [],
    childRegionIds: region.childRegionIds || [],
    lineCount: Number(region?.metadata?.lineCount) || 0,
    groupId: relationships.groupId,
    groupLayout: region.metadata?.semantic?.dashboardGroup?.layout || null,
    classificationSource: classification.classificationSource
  })
}

function buildSemanticEntryComponents({ entry, entryIndex, region, lines, kind }) {
  const regionId = region.id || `region-${entryIndex}`
  const blockIds = region.blockIds || []
  const entries = []

  const componentSources = kind === STRUCTURED_REGION_KIND_KPI
    ? [
        { role: STRUCTURED_CELL_ROLE_LABEL, text: entry.label || '', lineIndex: entry.labelLineIndex, targetBox: null },
        { role: STRUCTURED_CELL_ROLE_VALUE, text: entry.value || '', lineIndex: entry.valueLineIndex, targetBox: null },
        { role: STRUCTURED_CELL_ROLE_DELTA, text: entry.delta || '', lineIndex: entry.deltaLineIndex, targetBox: null }
      ]
    : [
        { role: STRUCTURED_CELL_ROLE_LABEL, text: entry.label || '', lineIndex: entry.labelLineIndex, targetBox: entry.labelBbox || null },
        { role: STRUCTURED_CELL_ROLE_VALUE, text: entry.value || '', lineIndex: entry.valueLineIndex, targetBox: entry.valueBbox || null }
      ]

  for (const component of componentSources) {
    const normalizedText = normalizeText(component.text)
    if (!normalizedText && component.lineIndex == null && !component.targetBox) continue

    const line = getLineByIndex(lines, component.lineIndex)
    const resolved = resolveLineItem(line, { targetText: component.text, targetBox: component.targetBox })
    const boundingBox = resolved?.boundingBox || normalizeBoundingBox(component.targetBox) || normalizeBoundingBox(line?.boundingBox || null)
    if (!boundingBox) continue

    entries.push({
      role: component.role,
      text: component.text || line?.text || '',
      boundingBox,
      sourceLineIndex: component.lineIndex != null ? component.lineIndex : null,
      sourceItemIndex: resolved?.itemIndex ?? null,
      sourceReferences: {
        blockIds,
        lineIds: [],
        sourceLineIndices: component.lineIndex != null ? [component.lineIndex] : [],
        sourceItemIndices: resolved?.itemIndex != null ? [resolved.itemIndex] : [],
        sourceRegionId: regionId,
        sourceRegionType: region.type || STRUCTURED_REGION_KIND_UNKNOWN
      }
    })
  }

  return entries
}

function buildSemanticStructuredRegion(region, index, classification, kind) {
  const semantic = region?.metadata?.semantic || null
  const entries = kind === STRUCTURED_REGION_KIND_KPI
    ? Array.isArray(semantic?.metrics) ? semantic.metrics : []
    : Array.isArray(semantic?.pairs) ? semantic.pairs : []

  const orderedRoleSource = kind === STRUCTURED_REGION_KIND_KPI ? KPI_ROLE_ORDER : KEY_VALUE_ROLE_ORDER
  const entryKind = kind === STRUCTURED_REGION_KIND_KPI ? 'metric' : 'pair'
  const entryComponents = entries.map((entry, entryIndex) => buildSemanticEntryComponents({
    entry,
    entryIndex,
    region,
    lines: region.__lines || [],
    kind
  }))

  const allComponents = entryComponents.flat()
  if (allComponents.length === 0) {
    return buildEmptyStructuredRegion(region, index, classification, kind)
  }

  const presentRoles = orderedRoleSource.filter((role) => allComponents.some((component) => component.role === role))
  const roleToColumnIndex = new Map(presentRoles.map((role, columnIndex) => [role, columnIndex]))

  const cells = []
  const rows = []
  const sourceLineIndices = []
  const sourceItemIndices = []

  for (let entryIndex = 0; entryIndex < entryComponents.length; entryIndex++) {
    const components = entryComponents[entryIndex]
    const rowCellIds = []

    for (const component of components) {
      const columnIndex = roleToColumnIndex.get(component.role)
      if (!Number.isInteger(columnIndex)) continue

      const cellId = `${region.id || `region-${index}`}-r${entryIndex}-c${columnIndex}-${component.role}`
      const cell = createStructuredLayoutCell({
        id: cellId,
        cellId,
        regionId: region.id || `region-${index}`,
        rowIndex: entryIndex,
        columnIndex,
        rowSpan: 1,
        colSpan: 1,
        spanType: STRUCTURED_SPAN_TYPE_NONE,
        role: component.role,
        text: component.text || '',
        boundingBox: component.boundingBox,
        sourceReferences: component.sourceReferences,
        spanCandidate: false,
        estimatedRowSpan: 1,
        estimatedColSpan: 1,
        confidence: classification.confidence,
        compatibility: {
          entryIndex,
          entryKind,
          role: component.role,
          confidence: classification.confidence
        }
      })

      cells.push(cell)
      rowCellIds.push(cell.id)

      if (Number.isInteger(component.sourceLineIndex) && !sourceLineIndices.includes(component.sourceLineIndex)) {
        sourceLineIndices.push(component.sourceLineIndex)
      }
      if (Number.isInteger(component.sourceItemIndex) && !sourceItemIndices.includes(component.sourceItemIndex)) {
        sourceItemIndices.push(component.sourceItemIndex)
      }
    }

    rows.push(createStructuredLayoutRow({
      id: `${region.id || `region-${index}`}-row-${entryIndex}`,
      rowIndex: entryIndex,
      boundingBox: unionBoundingBoxes(components.map((component) => component.boundingBox)),
      cellIds: rowCellIds,
      sourceReferences: {
        blockIds: region.blockIds || [],
        lineIds: [],
        sourceLineIndices: components.map((component) => component.sourceLineIndex).filter((value) => Number.isInteger(value)),
        sourceItemIndices: components.map((component) => component.sourceItemIndex).filter((value) => Number.isInteger(value)),
        sourceRegionId: region.id || `region-${index}`,
        sourceRegionType: region.type || STRUCTURED_REGION_KIND_UNKNOWN
      },
      compatibility: {
        entryIndex,
        entryKind,
        sourceCellCount: rowCellIds.length
      }
    }))
  }

  if (cells.length === 0) {
    return buildEmptyStructuredRegion(region, index, classification, kind)
  }

  const columns = presentRoles.map((role, columnIndex) => {
    const roleCells = cells.filter((cell) => cell.role === role)
    const boundingBox = unionBoundingBoxes(roleCells.map((cell) => cell.boundingBox))
    const x = boundingBox ? boundingBox.x : 0
    const width = boundingBox ? boundingBox.width : 0

    return createStructuredLayoutColumn({
      id: `${region.id || `region-${index}`}-col-${columnIndex}`,
      columnIndex,
      x,
      width,
      cellIds: roleCells.map((cell) => cell.id),
      sourceReferences: {
        blockIds: region.blockIds || [],
        lineIds: [],
        sourceLineIndices: roleCells.flatMap((cell) => cell.sourceReferences.sourceLineIndices || []),
        sourceItemIndices: roleCells.flatMap((cell) => cell.sourceReferences.sourceItemIndices || []),
        sourceRegionId: region.id || `region-${index}`,
        sourceRegionType: region.type || STRUCTURED_REGION_KIND_UNKNOWN
      },
      compatibility: {
        role,
        cellCount: roleCells.length
      }
    })
  })

  const grid = createStructuredLayoutGrid({
    dimensions: {
      rowCount: rows.length,
      columnCount: columns.length
    },
    rows,
    columns,
    occupancy: rows.map((row) => columns.map((column) => {
      const cell = cells.find((entry) => entry.rowIndex === row.rowIndex && entry.columnIndex === column.columnIndex) || null
      if (cell) {
        return {
          rowIndex: row.rowIndex,
          columnIndex: column.columnIndex,
          state: 'occupied',
          cellId: cell.id,
          ownerCellId: cell.id,
          rowSpan: cell.rowSpan,
          colSpan: cell.colSpan,
          boundingBox: cell.boundingBox
        }
      }

      return {
        rowIndex: row.rowIndex,
        columnIndex: column.columnIndex,
        state: 'missing',
        cellId: null,
        ownerCellId: null,
        rowSpan: 1,
        colSpan: 1,
        boundingBox: row.boundingBox
          ? {
              x: column.x,
              y: row.boundingBox.y,
              width: column.width,
              height: row.boundingBox.height
            }
          : null
      }
    }))
  })

  const semanticSummary = getSemanticSummary(semantic)
  const groupId = semantic?.dashboardGroup?.groupId || null
  const groupLayout = semantic?.dashboardGroup?.layout || null
  const structureSignals = {
    sourceType: 'semantic',
    classificationSource: classification.classificationSource,
    confidence: classification.confidence,
    semantic: semanticSummary,
    signals: semantic?.signals || null,
    [kind === STRUCTURED_REGION_KIND_KPI ? 'kpi' : 'keyValue']: semanticSummary
  }

  return createStructuredLayoutRegion({
    id: region.id || `region-${index}`,
    regionId: region.id || `region-${index}`,
    kind,
    subtype: classification.subtype,
    confidence: classification.confidence,
    sourceRegionType: region.type || STRUCTURED_REGION_KIND_UNKNOWN,
    boundingBox: normalizeBoundingBox(region.boundingBox || null),
    rows,
    columns,
    cells,
    spans: [],
    grid,
    relationships: {
      rowIds: rows.map((row) => row.id),
      columnIds: columns.map((column) => column.id),
      cellIds: cells.map((cell) => cell.id),
      spanIds: [],
      rowToCellIds: rows.map((row) => row.cellIds),
      columnToCellIds: columns.map((column) => column.cellIds),
      spanToCellIds: [],
      sourceBlockIds: region.blockIds || [],
      sourceLineIndices,
      sourceItemIndices,
      groupId,
      groupRegionIds: []
    },
    structureSignals,
    sourceReferences: {
      blockIds: region.blockIds || [],
      lineIds: [],
      sourceLineIndices,
      sourceItemIndices,
      sourceRegionId: region.id || `region-${index}`,
      sourceRegionType: region.type || STRUCTURED_REGION_KIND_UNKNOWN,
      groupId,
      groupRegionIds: []
    },
    compatibility: classification.compatibility,
    details: classification.details,
    blockIds: region.blockIds || [],
    childRegionIds: region.childRegionIds || [],
    lineCount: Number(region?.metadata?.lineCount) || 0,
    groupId,
    groupLayout,
    classificationSource: classification.classificationSource
  })
}

function buildEmptyStructuredRegion(region, index, classification, kind = STRUCTURED_REGION_KIND_UNKNOWN) {
  const semantic = region?.metadata?.semantic || null
  const semanticSummary = getSemanticSummary(semantic)
  const groupId = semantic?.dashboardGroup?.groupId || null
  const groupLayout = semantic?.dashboardGroup?.layout || null

  return createStructuredLayoutRegion({
    id: region.id || `region-${index}`,
    regionId: region.id || `region-${index}`,
    kind,
    subtype: classification.subtype || UNKNOWN_SUBTYPE_UNKNOWN,
    confidence: classification.confidence,
    sourceRegionType: region.type || STRUCTURED_REGION_KIND_UNKNOWN,
    boundingBox: normalizeBoundingBox(region.boundingBox || null),
    rows: [],
    columns: [],
    cells: [],
    spans: [],
    grid: createStructuredLayoutGrid({
      dimensions: { rowCount: 0, columnCount: 0 },
      rows: [],
      columns: [],
      occupancy: []
    }),
    relationships: {
      rowIds: [],
      columnIds: [],
      cellIds: [],
      spanIds: [],
      rowToCellIds: [],
      columnToCellIds: [],
      spanToCellIds: [],
      sourceBlockIds: region.blockIds || [],
      sourceLineIndices: [],
      sourceItemIndices: [],
      groupId,
      groupRegionIds: []
    },
    structureSignals: {
      sourceType: kind === STRUCTURED_REGION_KIND_UNKNOWN ? 'fallback' : 'semantic',
      classificationSource: classification.classificationSource,
      confidence: classification.confidence,
      semantic: semanticSummary,
      signals: semantic?.signals || null
    },
    sourceReferences: {
      blockIds: region.blockIds || [],
      lineIds: [],
      sourceLineIndices: [],
      sourceItemIndices: [],
      sourceRegionId: region.id || `region-${index}`,
      sourceRegionType: region.type || STRUCTURED_REGION_KIND_UNKNOWN,
      groupId,
      groupRegionIds: []
    },
    compatibility: classification.compatibility,
    details: classification.details,
    blockIds: region.blockIds || [],
    childRegionIds: region.childRegionIds || [],
    lineCount: Number(region?.metadata?.lineCount) || 0,
    groupId,
    groupLayout,
    classificationSource: classification.classificationSource
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
      const confidence = group.confidenceValues.length
        ? group.confidenceValues.reduce((sum, value) => sum + value, 0) / group.confidenceValues.length
        : 0

      return createStructuredLayoutGroup({
        id: group.groupId,
        groupId: group.groupId,
        kind: STRUCTURED_GROUP_KIND_GRID,
        layout: group.layout || 'row',
        confidence,
        boundingBox: unionBoundingBoxes(group.boundingBoxes),
        regionIds: group.regionIds,
        regionKinds: group.regionKinds,
        relationships: {
          memberRegionIds: group.regionIds
        },
        sourceReferences: {
          blockIds: [],
          lineIds: [],
          sourceLineIndices: [],
          sourceItemIndices: [],
          sourceRegionId: group.groupId,
          sourceRegionType: null,
          groupId: group.groupId,
          groupRegionIds: group.regionIds
        },
        structureSignals: {
          confidence,
          layout: group.layout || 'row',
          memberCount: group.regionIds.length
        },
        compatibility: {
          layout: group.layout || 'row',
          regionKinds: group.regionKinds
        }
      })
    })
}

function buildRegionEntry(region, index, lines) {
  const classification = classifyRegion(region)
  const structuredRegion = {
    ...region,
    __lines: lines
  }

  if (classification.kind === STRUCTURED_REGION_KIND_TABLE) {
    return buildTableStructuredRegion(structuredRegion, index, classification)
  }

  if (classification.kind === STRUCTURED_REGION_KIND_KPI) {
    return buildSemanticStructuredRegion(structuredRegion, index, classification, STRUCTURED_REGION_KIND_KPI)
  }

  if (classification.kind === STRUCTURED_REGION_KIND_KEY_VALUE) {
    return buildSemanticStructuredRegion(structuredRegion, index, classification, STRUCTURED_REGION_KIND_KEY_VALUE)
  }

  return buildEmptyStructuredRegion(structuredRegion, index, classification, STRUCTURED_REGION_KIND_UNKNOWN)
}

export function analyzeStructuredLayout({
  pageNumber = 0,
  pageSize = null,
  regions = [],
  lines = []
} = {}) {
  if (!regions.length) {
    return createEmptyStructuredLayoutModel(pageNumber, pageSize)
  }

  const structuredRegions = regions.map((region, index) => buildRegionEntry(region, index, lines))
  const groups = buildGroups(structuredRegions)

  return createStructuredLayoutModel({
    pageNumber,
    pageSize,
    regions: structuredRegions,
    groups
  })
}
