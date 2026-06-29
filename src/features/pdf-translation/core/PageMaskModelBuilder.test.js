import { describe, it, expect } from 'vitest'
import { buildPageMaskModel } from './PageMaskModelBuilder.js'
import {
  createStructuredLayoutCell,
  createStructuredLayoutColumn,
  createStructuredLayoutGroup,
  createStructuredLayoutGrid,
  createStructuredLayoutModel,
  createStructuredLayoutRegion,
  createStructuredLayoutRow,
  STRUCTURED_REGION_KIND_KEY_VALUE,
  STRUCTURED_REGION_KIND_TABLE,
  STRUCTURED_REGION_KIND_UNKNOWN,
  STRUCTURED_SPAN_TYPE_NONE
} from './StructuredLayoutModel.js'

function makePageSize(width = 612, height = 792) {
  return Object.freeze({ width, height })
}

function makeBlock(id, {
  boundingBox = { x: 40, y: 100, width: 200, height: 20 },
  role = 'paragraph',
  text = 'Hello world',
  regionId = null,
  isStructured = false
} = {}) {
  return {
    id,
    boundingBox,
    role,
    text,
    regionId,
    roleMetadata: { isStructured }
  }
}

function makeRegion(id, {
  type = 'paragraph',
  boundingBox = { x: 40, y: 100, width: 200, height: 60 },
  blockIds = [],
  semantic = null
} = {}) {
  return {
    id,
    type,
    boundingBox,
    childRegionIds: [],
    blockIds,
    metadata: {
      lineCount: 2,
      fontSize: 12,
      gapThreshold: 36,
      ...(semantic ? { semantic } : {})
    }
  }
}

function makeTableRegion(id, {
  boundingBox = { x: 40, y: 100, width: 300, height: 60 },
  occupancy = []
} = {}) {
  return {
    id,
    type: 'table',
    boundingBox,
    childRegionIds: [],
    blockIds: [],
    metadata: {
      lineCount: 2,
      fontSize: 12,
      gapThreshold: 36,
      table: {
        columnCount: 2,
        rowCount: occupancy.length,
        grid: {
          rows: [],
          columns: [],
          occupancy
        }
      }
    }
  }
}

function makeOccupancyCell(rowIndex, columnIndex, state, {
  cellId = null,
  ownerCellId = cellId,
  boundingBox = { x: 40, y: 100, width: 60, height: 14 }
} = {}) {
  return Object.freeze({
    rowIndex,
    columnIndex,
    state,
    cellId,
    ownerCellId,
    colSpan: 1,
    rowSpan: 1,
    boundingBox: Object.freeze(boundingBox)
  })
}

function uniqueNumbers(values = []) {
  return [...new Set(values.filter((value) => Number.isInteger(value)))]
}

function makeStructuredCell(regionId, {
  id = `${regionId}-r0-c0`,
  rowIndex = 0,
  columnIndex = 0,
  boundingBox = { x: 40, y: 100, width: 60, height: 14 },
  rowSpan = 1,
  colSpan = 1,
  spanType = STRUCTURED_SPAN_TYPE_NONE,
  role = 'cell',
  text = 'Structured cell',
  confidence = 0.9,
  sourceLineIndex = rowIndex,
  sourceItemIndex = columnIndex,
  spanCandidate = false,
  estimatedRowSpan = 1,
  estimatedColSpan = 1,
  sourceRegionType = STRUCTURED_REGION_KIND_TABLE
} = {}) {
  return createStructuredLayoutCell({
    id,
    cellId: id,
    regionId,
    rowIndex,
    columnIndex,
    rowSpan,
    colSpan,
    spanType,
    role,
    text,
    boundingBox,
    sourceReferences: {
      blockIds: ['block-1'],
      lineIds: [],
      sourceLineIndices: [sourceLineIndex],
      sourceItemIndices: [sourceItemIndex],
      sourceRegionId: regionId,
      sourceRegionType
    },
    spanCandidate,
    estimatedRowSpan,
    estimatedColSpan,
    confidence
  })
}

function makeStructuredRow(regionId, {
  rowIndex = 0,
  boundingBox = null,
  cellIds = [],
  sourceLineIndices = [rowIndex],
  sourceItemIndices = [],
  sourceRegionType = STRUCTURED_REGION_KIND_TABLE
} = {}) {
  return createStructuredLayoutRow({
    id: `${regionId}-row-${rowIndex}`,
    rowIndex,
    boundingBox,
    cellIds,
    sourceReferences: {
      blockIds: ['block-1'],
      lineIds: [],
      sourceLineIndices,
      sourceItemIndices,
      sourceRegionId: regionId,
      sourceRegionType
    }
  })
}

function makeStructuredColumn(regionId, {
  columnIndex = 0,
  x = 40,
  width = 60,
  cellIds = [],
  sourceLineIndices = [],
  sourceItemIndices = [],
  sourceRegionType = STRUCTURED_REGION_KIND_TABLE
} = {}) {
  return createStructuredLayoutColumn({
    id: `${regionId}-col-${columnIndex}`,
    columnIndex,
    x,
    width,
    cellIds,
    sourceReferences: {
      blockIds: ['block-1'],
      lineIds: [],
      sourceLineIndices,
      sourceItemIndices,
      sourceRegionId: regionId,
      sourceRegionType
    }
  })
}

function makeStructuredRegion(regionId, {
  kind = STRUCTURED_REGION_KIND_TABLE,
  subtype = 'table',
  boundingBox = { x: 40, y: 100, width: 300, height: 60 },
  rows = [],
  columns = [],
  cells = [],
  blockIds = ['block-1'],
  sourceRegionType = kind,
  confidence = 0.9,
  classificationSource = 'table',
  structureSignals = null
} = {}) {
  const occupancy = rows.map((row) => {
    return columns.map((column) => {
      const cell = cells.find((entry) => entry.rowIndex === row.rowIndex && entry.columnIndex === column.columnIndex) || null
      if (cell) {
        return Object.freeze({
          rowIndex: row.rowIndex,
          columnIndex: column.columnIndex,
          state: 'occupied',
          cellId: cell.id,
          ownerCellId: cell.id,
          rowSpan: cell.rowSpan,
          colSpan: cell.colSpan,
          boundingBox: cell.boundingBox ? Object.freeze({ ...cell.boundingBox }) : null
        })
      }

      return Object.freeze({
        rowIndex: row.rowIndex,
        columnIndex: column.columnIndex,
        state: 'missing',
        cellId: null,
        ownerCellId: null,
        rowSpan: 1,
        colSpan: 1,
        boundingBox: null
      })
    })
  })

  const grid = createStructuredLayoutGrid({
    dimensions: { rowCount: rows.length, columnCount: columns.length },
    rows,
    columns,
    occupancy
  })

  const rowIds = rows.map((row) => row.id)
  const columnIds = columns.map((column) => column.id)
  const cellIds = cells.map((cell) => cell.id)

  return createStructuredLayoutRegion({
    id: regionId,
    kind,
    subtype,
    confidence,
    sourceRegionType,
    boundingBox,
    rows,
    columns,
    cells,
    spans: [],
    grid,
    relationships: {
      rowIds,
      columnIds,
      cellIds,
      spanIds: [],
      rowToCellIds: rows.map((row) => row.cellIds),
      columnToCellIds: columns.map((column) => column.cellIds),
      spanToCellIds: [],
      sourceBlockIds: blockIds,
      sourceLineIndices: uniqueNumbers(cells.flatMap((cell) => cell.sourceReferences.sourceLineIndices || [])),
      sourceItemIndices: uniqueNumbers(cells.flatMap((cell) => cell.sourceReferences.sourceItemIndices || [])),
      groupId: null,
      groupRegionIds: []
    },
    structureSignals: structureSignals || {
      sourceType: kind === STRUCTURED_REGION_KIND_TABLE ? 'table' : 'semantic',
      classificationSource,
      confidence
    },
    sourceReferences: {
      blockIds,
      lineIds: [],
      sourceLineIndices: uniqueNumbers(cells.flatMap((cell) => cell.sourceReferences.sourceLineIndices || [])),
      sourceItemIndices: uniqueNumbers(cells.flatMap((cell) => cell.sourceReferences.sourceItemIndices || [])),
      sourceRegionId: regionId,
      sourceRegionType,
      groupId: null,
      groupRegionIds: []
    },
    blockIds,
    childRegionIds: [],
    lineCount: rows.length,
    groupId: null,
    groupLayout: null,
    classificationSource
  })
}

function makeStructuredPageLayout({
  pageNumber = 1,
  pageSize = makePageSize(),
  structuredRegions = [],
  structuredGroups = [],
  regions = [],
  blocks = []
} = {}) {
  return {
    pageNumber,
    pageSize,
    lines: [],
    blocks,
    regions,
    metadata: {
      structured: createStructuredLayoutModel({
        pageNumber,
        pageSize,
        regions: structuredRegions,
        groups: structuredGroups
      })
    }
  }
}

function makeStructuredGroup(groupId, {
  kind = 'grid',
  layout = 'row',
  confidence = 0.9,
  boundingBox = null,
  regionIds = [],
  regionKinds = [],
  sourceRegionType = null
} = {}) {
  return createStructuredLayoutGroup({
    id: groupId,
    groupId,
    kind,
    layout,
    confidence,
    boundingBox,
    regionIds,
    regionKinds,
    relationships: {
      memberRegionIds: regionIds
    },
    sourceReferences: {
      blockIds: [],
      lineIds: [],
      sourceLineIndices: [],
      sourceItemIndices: [],
      sourceRegionId: groupId,
      sourceRegionType,
      groupId,
      groupRegionIds: regionIds
    },
    structureSignals: {
      confidence,
      layout,
      memberCount: regionIds.length
    }
  })
}

describe('PageMaskModelBuilder', () => {
  describe('missing input', () => {
    it('returns empty model for null pageLayout', () => {
      const result = buildPageMaskModel(null)
      expect(result.masks).toHaveLength(0)
      expect(result.metadata.totalMasks).toBe(0)
    })

    it('returns empty model for undefined pageLayout', () => {
      const result = buildPageMaskModel(undefined)
      expect(result.masks).toHaveLength(0)
    })

    it('returns empty model when regions missing', () => {
      const result = buildPageMaskModel({ blocks: [] })
      expect(result.masks).toHaveLength(0)
    })
  })

  describe('paragraph block produces block mask', () => {
    it('creates mask for paragraph block', () => {
      const block = makeBlock('blk-1', {
        boundingBox: { x: 40, y: 100, width: 200, height: 20 },
        regionId: 'p1-r0'
      })
      const region = makeRegion('p1-r0', { type: 'paragraph' })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(result.masks).toHaveLength(1)
      expect(result.masks[0].type).toBe('block')
      expect(result.masks[0].source).toBe('logical-block')
      expect(result.masks[0].ownerId).toBe('blk-1')
      expect(result.masks[0].boundingBox.x).toBe(40)
      expect(result.masks[0].boundingBox.width).toBe(200)
    })
  })

  describe('structured block does not produce block mask', () => {
    it('skips structured blocks', () => {
      const block = makeBlock('blk-1', { isStructured: true, regionId: 'p1-r0' })
      const region = makeRegion('p1-r0')

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(result.masks).toHaveLength(0)
    })
  })

  describe('table block does not produce block mask', () => {
    it('skips blocks in table regions', () => {
      const block = makeBlock('blk-1', { regionId: 'p1-r0' })
      const region = makeTableRegion('p1-r0')

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(result.masks).toHaveLength(0)
    })
  })

  describe('table occupancy occupied cells produce cell masks', () => {
    it('creates masks for occupied cells', () => {
      const occupancy = [
        [
          makeOccupancyCell(0, 0, 'occupied', { cellId: 'c00', boundingBox: { x: 40, y: 100, width: 60, height: 14 } }),
          makeOccupancyCell(0, 1, 'occupied', { cellId: 'c01', boundingBox: { x: 180, y: 100, width: 60, height: 14 } })
        ],
        [
          makeOccupancyCell(1, 0, 'occupied', { cellId: 'c10', boundingBox: { x: 40, y: 120, width: 60, height: 14 } }),
          makeOccupancyCell(1, 1, 'occupied', { cellId: 'c11', boundingBox: { x: 180, y: 120, width: 60, height: 14 } })
        ]
      ]
      const region = makeTableRegion('p1-r0', { occupancy })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [],
        regions: [region]
      })

      expect(result.masks).toHaveLength(4)
      expect(result.masks.every((m) => m.type === 'cell')).toBe(true)
    })
  })

  describe('covered cells produce no mask', () => {
    it('skips covered occupancy entries but adds row mask for complex row', () => {
      const occupancy = [
        [
          makeOccupancyCell(0, 0, 'occupied', { cellId: 'c00', boundingBox: { x: 40, y: 100, width: 140, height: 14 } }),
          makeOccupancyCell(0, 1, 'covered', { ownerCellId: 'c00' })
        ],
        [
          makeOccupancyCell(1, 0, 'occupied', { cellId: 'c10', boundingBox: { x: 40, y: 120, width: 60, height: 14 } }),
          makeOccupancyCell(1, 1, 'occupied', { cellId: 'c11', boundingBox: { x: 180, y: 120, width: 60, height: 14 } })
        ]
      ]
      const region = makeTableRegion('p1-r0', { occupancy })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [],
        regions: [region]
      })

      const coveredMask = result.masks.find((m) => m.ownerId === null)
      expect(coveredMask).toBeUndefined()
      const cellMasks = result.masks.filter((m) => m.type === 'cell')
      const rowMasks = result.masks.filter((m) => m.type === 'row')
      expect(cellMasks).toHaveLength(3)
      expect(rowMasks.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('missing cells produce no mask', () => {
    it('skips missing occupancy entries but adds row mask for complex row', () => {
      const occupancy = [
        [
          makeOccupancyCell(0, 0, 'occupied', { cellId: 'c00', boundingBox: { x: 40, y: 100, width: 60, height: 14 } }),
          makeOccupancyCell(0, 1, 'missing')
        ],
        [
          makeOccupancyCell(1, 0, 'occupied', { cellId: 'c10', boundingBox: { x: 40, y: 120, width: 60, height: 14 } }),
          makeOccupancyCell(1, 1, 'occupied', { cellId: 'c11', boundingBox: { x: 180, y: 120, width: 60, height: 14 } })
        ]
      ]
      const region = makeTableRegion('p1-r0', { occupancy })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [],
        regions: [region]
      })

      const cellMasks = result.masks.filter((m) => m.type === 'cell')
      const rowMasks = result.masks.filter((m) => m.type === 'row')
      expect(cellMasks).toHaveLength(3)
      expect(rowMasks.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('structured-first masks', () => {
    it('creates cell masks from canonical structured cells', () => {
      const regionId = 's-r0'
      const cells = [
        makeStructuredCell(regionId, {
          id: `${regionId}-c0`,
          rowIndex: 0,
          columnIndex: 0,
          boundingBox: { x: 40, y: 100, width: 60, height: 14 }
        }),
        makeStructuredCell(regionId, {
          id: `${regionId}-c1`,
          rowIndex: 0,
          columnIndex: 1,
          boundingBox: { x: 120, y: 100, width: 60, height: 14 }
        })
      ]
      const rows = [
        makeStructuredRow(regionId, {
          rowIndex: 0,
          boundingBox: { x: 40, y: 100, width: 140, height: 14 },
          cellIds: cells.map((cell) => cell.id)
        })
      ]
      const columns = [
        makeStructuredColumn(regionId, { columnIndex: 0, x: 40, width: 60, cellIds: [cells[0].id] }),
        makeStructuredColumn(regionId, { columnIndex: 1, x: 120, width: 60, cellIds: [cells[1].id] })
      ]
      const structuredRegion = makeStructuredRegion(regionId, {
        rows,
        columns,
        cells,
        boundingBox: { x: 40, y: 100, width: 140, height: 14 }
      })

      const result = buildPageMaskModel(makeStructuredPageLayout({
        structuredRegions: [structuredRegion]
      }))

      expect(result.masks).toHaveLength(2)
      expect(result.masks.every((mask) => mask.source === 'structured-cell')).toBe(true)
      expect(result.metadata.cellMasks).toBe(2)
      expect(result.metadata.rowMasks).toBe(0)
    })

    it('creates conservative region masks for KPI and key-value regions', () => {
      const kpiRegionId = 'kpi-r0'
      const kpiRegion = makeStructuredRegion(kpiRegionId, {
        kind: 'kpi',
        subtype: 'kpi-card',
        boundingBox: { x: 40, y: 100, width: 180, height: 40 },
        confidence: 0.82,
        sourceRegionType: 'semantic',
        classificationSource: 'semantic-kpi',
        cells: [
          makeStructuredCell(kpiRegionId, {
            id: `${kpiRegionId}-label`,
            rowIndex: 0,
            columnIndex: 0,
            boundingBox: { x: 40, y: 100, width: 70, height: 14 },
            role: 'label',
            sourceRegionType: 'semantic'
          }),
          makeStructuredCell(kpiRegionId, {
            id: `${kpiRegionId}-value`,
            rowIndex: 0,
            columnIndex: 1,
            boundingBox: { x: 120, y: 100, width: 60, height: 14 },
            role: 'value',
            sourceRegionType: 'semantic'
          })
        ],
        rows: [
          makeStructuredRow(kpiRegionId, {
            rowIndex: 0,
            boundingBox: { x: 40, y: 100, width: 180, height: 14 },
            cellIds: [`${kpiRegionId}-label`, `${kpiRegionId}-value`],
            sourceRegionType: 'semantic'
          })
        ],
        columns: [
          makeStructuredColumn(kpiRegionId, {
            columnIndex: 0,
            x: 40,
            width: 70,
            cellIds: [`${kpiRegionId}-label`],
            sourceRegionType: 'semantic'
          }),
          makeStructuredColumn(kpiRegionId, {
            columnIndex: 1,
            x: 120,
            width: 60,
            cellIds: [`${kpiRegionId}-value`],
            sourceRegionType: 'semantic'
          })
        ]
      })

      const kvRegionId = 'kv-r1'
      const kvRegion = makeStructuredRegion(kvRegionId, {
        kind: 'key-value',
        subtype: 'key-value-grid',
        boundingBox: { x: 40, y: 160, width: 180, height: 22 },
        confidence: 0.74,
        sourceRegionType: 'semantic',
        classificationSource: 'semantic-key-value',
        cells: [
          makeStructuredCell(kvRegionId, {
            id: `${kvRegionId}-label`,
            rowIndex: 0,
            columnIndex: 0,
            boundingBox: { x: 40, y: 160, width: 80, height: 12 },
            role: 'label',
            sourceRegionType: 'semantic'
          }),
          makeStructuredCell(kvRegionId, {
            id: `${kvRegionId}-value`,
            rowIndex: 0,
            columnIndex: 1,
            boundingBox: { x: 130, y: 160, width: 90, height: 12 },
            role: 'value',
            sourceRegionType: 'semantic'
          })
        ],
        rows: [
          makeStructuredRow(kvRegionId, {
            rowIndex: 0,
            boundingBox: { x: 40, y: 160, width: 180, height: 12 },
            cellIds: [`${kvRegionId}-label`, `${kvRegionId}-value`],
            sourceRegionType: 'semantic'
          })
        ],
        columns: [
          makeStructuredColumn(kvRegionId, {
            columnIndex: 0,
            x: 40,
            width: 80,
            cellIds: [`${kvRegionId}-label`],
            sourceRegionType: 'semantic'
          }),
          makeStructuredColumn(kvRegionId, {
            columnIndex: 1,
            x: 130,
            width: 90,
            cellIds: [`${kvRegionId}-value`],
            sourceRegionType: 'semantic'
          })
        ]
      })

      const result = buildPageMaskModel(makeStructuredPageLayout({
        structuredRegions: [kpiRegion, kvRegion]
      }))

      const regionMasks = result.masks.filter((mask) => mask.type === 'region')
      expect(regionMasks).toHaveLength(2)
      expect(regionMasks.map((mask) => mask.ownerId)).toEqual([
        `structured-region:${kpiRegionId}`,
        `structured-region:${kvRegionId}`
      ])
      expect(regionMasks.map((mask) => mask.source)).toEqual(['structured-region', 'structured-region'])
      expect(result.metadata.regionMasks).toBe(2)
    })

    it('does not create broad region masks for tables', () => {
      const regionId = 'table-r0'
      const structuredCell = makeStructuredCell(regionId, {
        id: `${regionId}-c0`,
        rowIndex: 0,
        columnIndex: 0,
        boundingBox: { x: 40, y: 100, width: 80, height: 20 }
      })
      const structuredRegion = makeStructuredRegion(regionId, {
        rows: [makeStructuredRow(regionId, {
          rowIndex: 0,
          boundingBox: { x: 40, y: 100, width: 80, height: 20 },
          cellIds: [structuredCell.id]
        })],
        columns: [makeStructuredColumn(regionId, {
          columnIndex: 0,
          x: 40,
          width: 80,
          cellIds: [structuredCell.id]
        })],
        cells: [structuredCell],
        boundingBox: { x: 40, y: 100, width: 80, height: 20 }
      })

      const result = buildPageMaskModel(makeStructuredPageLayout({
        structuredRegions: [structuredRegion]
      }))

      expect(result.masks.some((mask) => mask.type === 'region')).toBe(false)
      expect(result.metadata.regionMasks).toBe(0)
    })

    it('skips low-confidence and oversized region masks', () => {
      const lowConfidenceRegion = makeStructuredRegion('low-conf', {
        kind: 'kpi',
        subtype: 'kpi-card',
        confidence: 0.4,
        boundingBox: { x: 40, y: 100, width: 120, height: 30 },
        cells: [
          makeStructuredCell('low-conf', {
            id: 'low-conf-c0',
            rowIndex: 0,
            columnIndex: 0,
            boundingBox: { x: 40, y: 100, width: 120, height: 30 },
            sourceRegionType: 'semantic'
          })
        ],
        rows: [
          makeStructuredRow('low-conf', {
            rowIndex: 0,
            boundingBox: { x: 40, y: 100, width: 120, height: 30 },
            cellIds: ['low-conf-c0'],
            sourceRegionType: 'semantic'
          })
        ],
        columns: [
          makeStructuredColumn('low-conf', {
            columnIndex: 0,
            x: 40,
            width: 120,
            cellIds: ['low-conf-c0'],
            sourceRegionType: 'semantic'
          })
        ]
      })

      const oversizedRegion = makeStructuredRegion('oversized', {
        kind: 'key-value',
        subtype: 'key-value-grid',
        confidence: 0.95,
        boundingBox: { x: 20, y: 20, width: 500, height: 700 },
        cells: [
          makeStructuredCell('oversized', {
            id: 'oversized-c0',
            rowIndex: 0,
            columnIndex: 0,
            boundingBox: { x: 20, y: 20, width: 250, height: 20 },
            sourceRegionType: 'semantic'
          })
        ],
        rows: [
          makeStructuredRow('oversized', {
            rowIndex: 0,
            boundingBox: { x: 20, y: 20, width: 250, height: 20 },
            cellIds: ['oversized-c0'],
            sourceRegionType: 'semantic'
          })
        ],
        columns: [
          makeStructuredColumn('oversized', {
            columnIndex: 0,
            x: 20,
            width: 250,
            cellIds: ['oversized-c0'],
            sourceRegionType: 'semantic'
          })
        ]
      })

      const result = buildPageMaskModel(makeStructuredPageLayout({
        structuredRegions: [lowConfidenceRegion, oversizedRegion]
      }))

      expect(result.masks.some((mask) => mask.type === 'region')).toBe(false)
      expect(result.metadata.regionMasks).toBe(0)
    })

    it('keeps simple structured 2x2 tables row-mask free', () => {
      const regionId = 's-r1'
      const cells = [
        makeStructuredCell(regionId, {
          id: `${regionId}-c0`,
          rowIndex: 0,
          columnIndex: 0,
          boundingBox: { x: 40, y: 100, width: 60, height: 14 }
        }),
        makeStructuredCell(regionId, {
          id: `${regionId}-c1`,
          rowIndex: 0,
          columnIndex: 1,
          boundingBox: { x: 120, y: 100, width: 60, height: 14 }
        }),
        makeStructuredCell(regionId, {
          id: `${regionId}-c2`,
          rowIndex: 1,
          columnIndex: 0,
          boundingBox: { x: 40, y: 120, width: 60, height: 14 }
        }),
        makeStructuredCell(regionId, {
          id: `${regionId}-c3`,
          rowIndex: 1,
          columnIndex: 1,
          boundingBox: { x: 120, y: 120, width: 60, height: 14 }
        })
      ]
      const rows = [
        makeStructuredRow(regionId, {
          rowIndex: 0,
          boundingBox: { x: 40, y: 100, width: 140, height: 14 },
          cellIds: [cells[0].id, cells[1].id]
        }),
        makeStructuredRow(regionId, {
          rowIndex: 1,
          boundingBox: { x: 40, y: 120, width: 140, height: 14 },
          cellIds: [cells[2].id, cells[3].id]
        })
      ]
      const columns = [
        makeStructuredColumn(regionId, { columnIndex: 0, x: 40, width: 60, cellIds: [cells[0].id, cells[2].id] }),
        makeStructuredColumn(regionId, { columnIndex: 1, x: 120, width: 60, cellIds: [cells[1].id, cells[3].id] })
      ]
      const structuredRegion = makeStructuredRegion(regionId, {
        rows,
        columns,
        cells,
        boundingBox: { x: 40, y: 100, width: 140, height: 34 }
      })

      const result = buildPageMaskModel(makeStructuredPageLayout({
        structuredRegions: [structuredRegion]
      }))

      expect(result.masks).toHaveLength(4)
      expect(result.masks.every((mask) => mask.source === 'structured-cell')).toBe(true)
      expect(result.metadata.rowMasks).toBe(0)
      expect(result.metadata.regionMasks).toBe(0)
    })

    it('creates conservative row masks from canonical structured rows', () => {
      const regionId = 'kv-r0'
      const cells = [
        makeStructuredCell(regionId, {
          id: `${regionId}-label`,
          rowIndex: 0,
          columnIndex: 0,
          boundingBox: { x: 40, y: 100, width: 80, height: 14 },
          role: 'label',
          text: 'Revenue',
          sourceRegionType: STRUCTURED_REGION_KIND_KEY_VALUE
        }),
        makeStructuredCell(regionId, {
          id: `${regionId}-value`,
          rowIndex: 0,
          columnIndex: 1,
          boundingBox: { x: 140, y: 100, width: 80, height: 14 },
          role: 'value',
          text: '12.5B',
          sourceRegionType: STRUCTURED_REGION_KIND_KEY_VALUE
        })
      ]
      const rows = [
        makeStructuredRow(regionId, {
          rowIndex: 0,
          boundingBox: { x: 40, y: 100, width: 180, height: 14 },
          cellIds: cells.map((cell) => cell.id),
          sourceRegionType: STRUCTURED_REGION_KIND_KEY_VALUE
        })
      ]
      const columns = [
        makeStructuredColumn(regionId, {
          columnIndex: 0,
          x: 40,
          width: 80,
          cellIds: [cells[0].id],
          sourceRegionType: STRUCTURED_REGION_KIND_KEY_VALUE
        }),
        makeStructuredColumn(regionId, {
          columnIndex: 1,
          x: 140,
          width: 80,
          cellIds: [cells[1].id],
          sourceRegionType: STRUCTURED_REGION_KIND_KEY_VALUE
        })
      ]
      const structuredRegion = makeStructuredRegion(regionId, {
        kind: STRUCTURED_REGION_KIND_KEY_VALUE,
        subtype: 'key-value-grid',
        rows,
        columns,
        cells,
        boundingBox: { x: 40, y: 100, width: 180, height: 14 },
        sourceRegionType: STRUCTURED_REGION_KIND_KEY_VALUE,
        classificationSource: 'semantic'
      })

      const result = buildPageMaskModel(makeStructuredPageLayout({
        structuredRegions: [structuredRegion]
      }))

      const rowMasks = result.masks.filter((mask) => mask.type === 'row')
      expect(rowMasks).toHaveLength(1)
      expect(rowMasks[0].source).toBe('structured-row')
      expect(rowMasks[0].boundingBox).toEqual({ x: 40, y: 100, width: 180, height: 14 })
      expect(result.metadata.rowMasks).toBe(1)
    })

    it('prefers canonical structured cells over legacy table metadata when both exist', () => {
      const regionId = 'p1-r0'
      const structuredCell = makeStructuredCell(regionId, {
        id: `${regionId}-c0`,
        rowIndex: 0,
        columnIndex: 0,
        boundingBox: { x: 60, y: 100, width: 80, height: 20 }
      })
      const structuredRow = makeStructuredRow(regionId, {
        rowIndex: 0,
        boundingBox: { x: 60, y: 100, width: 80, height: 20 },
        cellIds: [structuredCell.id]
      })
      const structuredColumn = makeStructuredColumn(regionId, {
        columnIndex: 0,
        x: 60,
        width: 80,
        cellIds: [structuredCell.id]
      })
      const structuredRegion = makeStructuredRegion(regionId, {
        rows: [structuredRow],
        columns: [structuredColumn],
        cells: [structuredCell],
        boundingBox: { x: 60, y: 100, width: 80, height: 20 }
      })
      const legacyRegion = makeTableRegion(regionId, {
        occupancy: [
          [makeOccupancyCell(0, 0, 'occupied', { cellId: 'legacy-cell', boundingBox: { x: 10, y: 100, width: 120, height: 20 } })]
        ]
      })

      const result = buildPageMaskModel(makeStructuredPageLayout({
        structuredRegions: [structuredRegion],
        regions: [legacyRegion]
      }))

      const structuredMask = result.masks.find((mask) => mask.ownerId === structuredCell.id)
      expect(structuredMask.source).toBe('structured-cell')
      expect(structuredMask.boundingBox).toEqual(structuredCell.boundingBox)
      expect(result.masks.some((mask) => mask.source === 'table-occupancy')).toBe(false)
    })

    it('falls back safely to legacy table metadata when structured geometry is invalid', () => {
      const regionId = 'p1-r0'
      const invalidCell = makeStructuredCell(regionId, {
        id: `${regionId}-c0`,
        rowIndex: 0,
        columnIndex: 0,
        boundingBox: null
      })
      const invalidRow = makeStructuredRow(regionId, {
        rowIndex: 0,
        boundingBox: null,
        cellIds: [invalidCell.id]
      })
      const invalidColumn = makeStructuredColumn(regionId, {
        columnIndex: 0,
        x: 10,
        width: 120,
        cellIds: [invalidCell.id]
      })
      const structuredRegion = makeStructuredRegion(regionId, {
        rows: [invalidRow],
        columns: [invalidColumn],
        cells: [invalidCell],
        boundingBox: { x: 10, y: 100, width: 120, height: 20 }
      })
      const legacyRegion = makeTableRegion(regionId, {
        occupancy: [
          [makeOccupancyCell(0, 0, 'occupied', { cellId: 'legacy-cell', boundingBox: { x: 10, y: 100, width: 120, height: 20 } })]
        ]
      })

      const result = buildPageMaskModel(makeStructuredPageLayout({
        structuredRegions: [structuredRegion],
        regions: [legacyRegion]
      }))

      expect(result.masks).toHaveLength(1)
      expect(result.masks[0].source).toBe('table-occupancy')
      expect(result.masks[0].ownerId).toBe('legacy-cell')
      expect(result.metadata.regionMasks).toBe(0)
    })

    it('ignores unknown structured regions and keeps them classification-only', () => {
      const regionId = 'u-r0'
      const unknownRegion = makeStructuredRegion(regionId, {
        kind: STRUCTURED_REGION_KIND_UNKNOWN,
        subtype: 'unknown',
        rows: [],
        columns: [],
        cells: [],
        boundingBox: { x: 40, y: 100, width: 120, height: 20 },
        sourceRegionType: STRUCTURED_REGION_KIND_UNKNOWN,
        classificationSource: 'fallback'
      })

      const result = buildPageMaskModel(makeStructuredPageLayout({
        structuredRegions: [unknownRegion]
      }))

      expect(result.masks).toHaveLength(0)
      expect(result.metadata.totalMasks).toBe(0)
      expect(result.metadata.cellMasks).toBe(0)
      expect(result.metadata.rowMasks).toBe(0)
      expect(result.metadata.regionMasks).toBe(0)
    })
  })

  describe('colspan owner uses expanded occupancy boundingBox', () => {
    it('expanded bbox from occupancy', () => {
      const occupancy = [
        [
          makeOccupancyCell(0, 0, 'occupied', {
            cellId: 'c00',
            colSpan: 2,
            boundingBox: { x: 40, y: 100, width: 200, height: 14 }
          }),
          makeOccupancyCell(0, 1, 'covered', { ownerCellId: 'c00' })
        ],
        [
          makeOccupancyCell(1, 0, 'occupied', { cellId: 'c10', boundingBox: { x: 40, y: 120, width: 60, height: 14 } }),
          makeOccupancyCell(1, 1, 'occupied', { cellId: 'c11', boundingBox: { x: 180, y: 120, width: 60, height: 14 } })
        ]
      ]
      const region = makeTableRegion('p1-r0', { occupancy })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [],
        regions: [region]
      })

      const headerMask = result.masks.find((m) => m.ownerId === 'c00')
      expect(headerMask.boundingBox.width).toBe(200)
    })
  })

  describe('row masks', () => {
    it('simple 2x2 table does not produce row masks', () => {
      const occupancy = [
        [
          makeOccupancyCell(0, 0, 'occupied', { cellId: 'c00', boundingBox: { x: 40, y: 100, width: 60, height: 14 } }),
          makeOccupancyCell(0, 1, 'occupied', { cellId: 'c01', boundingBox: { x: 180, y: 100, width: 60, height: 14 } })
        ],
        [
          makeOccupancyCell(1, 0, 'occupied', { cellId: 'c10', boundingBox: { x: 40, y: 120, width: 60, height: 14 } }),
          makeOccupancyCell(1, 1, 'occupied', { cellId: 'c11', boundingBox: { x: 180, y: 120, width: 60, height: 14 } })
        ]
      ]
      const region = makeTableRegion('p1-r0', { occupancy })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [],
        regions: [region]
      })

      const rowMasks = result.masks.filter((m) => m.type === 'row')
      expect(rowMasks).toHaveLength(0)
      expect(result.metadata.rowMasks).toBe(0)
    })

    it('row with 3+ occupied cells produces row mask', () => {
      const occupancy = [
        [
          makeOccupancyCell(0, 0, 'occupied', { cellId: 'c00', boundingBox: { x: 40, y: 100, width: 50, height: 14 } }),
          makeOccupancyCell(0, 1, 'occupied', { cellId: 'c01', boundingBox: { x: 120, y: 100, width: 50, height: 14 } }),
          makeOccupancyCell(0, 2, 'occupied', { cellId: 'c02', boundingBox: { x: 200, y: 100, width: 50, height: 14 } })
        ],
        [
          makeOccupancyCell(1, 0, 'occupied', { cellId: 'c10', boundingBox: { x: 40, y: 120, width: 60, height: 14 } }),
          makeOccupancyCell(1, 1, 'occupied', { cellId: 'c11', boundingBox: { x: 180, y: 120, width: 60, height: 14 } })
        ]
      ]
      const region = makeTableRegion('p1-r0', { occupancy })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [],
        regions: [region]
      })

      const rowMasks = result.masks.filter((m) => m.type === 'row')
      expect(rowMasks).toHaveLength(1)
      expect(rowMasks[0].ownerId).toBe('table-row:p1-r0:0')
    })

    it('row mask boundingBox spans full row', () => {
      const occupancy = [
        [
          makeOccupancyCell(0, 0, 'occupied', { cellId: 'c00', boundingBox: { x: 40, y: 100, width: 50, height: 14 } }),
          makeOccupancyCell(0, 1, 'occupied', { cellId: 'c01', boundingBox: { x: 120, y: 100, width: 50, height: 14 } }),
          makeOccupancyCell(0, 2, 'occupied', { cellId: 'c02', boundingBox: { x: 200, y: 100, width: 50, height: 14 } })
        ]
      ]
      const region = makeTableRegion('p1-r0', { occupancy })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [],
        regions: [region]
      })

      const rowMask = result.masks.find((m) => m.type === 'row')
      expect(rowMask.boundingBox.x).toBe(40)
      expect(rowMask.boundingBox.y).toBe(100)
      expect(rowMask.boundingBox.width).toBe(210)
      expect(rowMask.boundingBox.height).toBe(14)
    })

    it('row mask ownerId is deterministic', () => {
      const occupancy = [
        [
          makeOccupancyCell(0, 0, 'occupied', { cellId: 'c00', boundingBox: { x: 40, y: 100, width: 50, height: 14 } }),
          makeOccupancyCell(0, 1, 'occupied', { cellId: 'c01', boundingBox: { x: 120, y: 100, width: 50, height: 14 } }),
          makeOccupancyCell(0, 2, 'occupied', { cellId: 'c02', boundingBox: { x: 200, y: 100, width: 50, height: 14 } })
        ]
      ]
      const region = makeTableRegion('p1-r0', { occupancy })
      const input = {
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [],
        regions: [region]
      }

      const r1 = buildPageMaskModel(input)
      const r2 = buildPageMaskModel(input)
      const row1 = r1.masks.find((m) => m.type === 'row')
      const row2 = r2.masks.find((m) => m.type === 'row')

      expect(row1.ownerId).toBe(row2.ownerId)
      expect(row1.ownerId).toMatch(/^table-row:p1-r0:\d+$/)
    })

    it('metadata.rowMasks count is correct', () => {
      const occupancy = [
        [
          makeOccupancyCell(0, 0, 'occupied', { cellId: 'c00', boundingBox: { x: 40, y: 100, width: 50, height: 14 } }),
          makeOccupancyCell(0, 1, 'occupied', { cellId: 'c01', boundingBox: { x: 120, y: 100, width: 50, height: 14 } }),
          makeOccupancyCell(0, 2, 'occupied', { cellId: 'c02', boundingBox: { x: 200, y: 100, width: 50, height: 14 } })
        ],
        [
          makeOccupancyCell(1, 0, 'occupied', { cellId: 'c10', boundingBox: { x: 40, y: 120, width: 50, height: 14 } }),
          makeOccupancyCell(1, 1, 'occupied', { cellId: 'c11', boundingBox: { x: 120, y: 120, width: 50, height: 14 } }),
          makeOccupancyCell(1, 2, 'occupied', { cellId: 'c12', boundingBox: { x: 200, y: 120, width: 50, height: 14 } })
        ]
      ]
      const region = makeTableRegion('p1-r0', { occupancy })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [],
        regions: [region]
      })

      expect(result.metadata.rowMasks).toBe(2)
      expect(result.metadata.totalMasks).toBe(result.metadata.cellMasks + result.metadata.rowMasks + result.metadata.blockMasks)
    })

    it('row mask object, boundingBox, and padding are frozen', () => {
      const occupancy = [
        [
          makeOccupancyCell(0, 0, 'occupied', { cellId: 'c00', boundingBox: { x: 40, y: 100, width: 50, height: 14 } }),
          makeOccupancyCell(0, 1, 'occupied', { cellId: 'c01', boundingBox: { x: 120, y: 100, width: 50, height: 14 } }),
          makeOccupancyCell(0, 2, 'occupied', { cellId: 'c02', boundingBox: { x: 200, y: 100, width: 50, height: 14 } })
        ]
      ]
      const region = makeTableRegion('p1-r0', { occupancy })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [],
        regions: [region]
      })

      const rowMask = result.masks.find((m) => m.type === 'row')
      expect(Object.isFrozen(rowMask)).toBe(true)
      expect(Object.isFrozen(rowMask.boundingBox)).toBe(true)
      expect(Object.isFrozen(rowMask.padding)).toBe(true)
    })
  })

  describe('group masks', () => {
    it('creates a conservative group mask for safe dashboard groups', () => {
      const regionA = makeStructuredRegion('grp-r0', {
        kind: 'kpi',
        subtype: 'kpi-card',
        boundingBox: { x: 40, y: 100, width: 120, height: 40 },
        confidence: 0.84,
        sourceRegionType: 'semantic',
        cells: [
          makeStructuredCell('grp-r0', {
            id: 'grp-r0-c0',
            rowIndex: 0,
            columnIndex: 0,
            boundingBox: { x: 40, y: 100, width: 120, height: 40 },
            sourceRegionType: 'semantic'
          })
        ],
        rows: [makeStructuredRow('grp-r0', {
          rowIndex: 0,
          boundingBox: { x: 40, y: 100, width: 120, height: 40 },
          cellIds: ['grp-r0-c0'],
          sourceRegionType: 'semantic'
        })],
        columns: [makeStructuredColumn('grp-r0', {
          columnIndex: 0,
          x: 40,
          width: 120,
          cellIds: ['grp-r0-c0'],
          sourceRegionType: 'semantic'
        })]
      })

      const regionB = makeStructuredRegion('grp-r1', {
        kind: 'key-value',
        subtype: 'key-value-grid',
        boundingBox: { x: 180, y: 100, width: 120, height: 40 },
        confidence: 0.81,
        sourceRegionType: 'semantic',
        cells: [
          makeStructuredCell('grp-r1', {
            id: 'grp-r1-c0',
            rowIndex: 0,
            columnIndex: 0,
            boundingBox: { x: 180, y: 100, width: 120, height: 40 },
            sourceRegionType: 'semantic'
          })
        ],
        rows: [makeStructuredRow('grp-r1', {
          rowIndex: 0,
          boundingBox: { x: 180, y: 100, width: 120, height: 40 },
          cellIds: ['grp-r1-c0'],
          sourceRegionType: 'semantic'
        })],
        columns: [makeStructuredColumn('grp-r1', {
          columnIndex: 0,
          x: 180,
          width: 120,
          cellIds: ['grp-r1-c0'],
          sourceRegionType: 'semantic'
        })]
      })

      const group = makeStructuredGroup('dashboard-1', {
        boundingBox: null,
        confidence: 0.83,
        regionIds: [regionA.id, regionB.id],
        regionKinds: [regionA.kind, regionB.kind]
      })

      const result = buildPageMaskModel(makeStructuredPageLayout({
        structuredRegions: [regionA, regionB],
        structuredGroups: [group]
      }))

      const groupMasks = result.masks.filter((mask) => mask.type === 'group')
      expect(groupMasks).toHaveLength(1)
      expect(groupMasks[0].ownerId).toBe('structured-group:dashboard-1')
      expect(groupMasks[0].source).toBe('structured-group')
    })

    it('skips low-confidence and oversized groups', () => {
      const lowConfidenceRegionA = makeStructuredRegion('big-r0', {
        kind: 'kpi',
        subtype: 'kpi-card',
        boundingBox: { x: 20, y: 20, width: 120, height: 40 },
        confidence: 0.9,
        sourceRegionType: 'semantic',
        cells: [makeStructuredCell('big-r0', {
          id: 'big-r0-c0',
          rowIndex: 0,
          columnIndex: 0,
          boundingBox: { x: 20, y: 20, width: 120, height: 40 },
          sourceRegionType: 'semantic'
        })],
        rows: [makeStructuredRow('big-r0', {
          rowIndex: 0,
          boundingBox: { x: 20, y: 20, width: 120, height: 40 },
          cellIds: ['big-r0-c0'],
          sourceRegionType: 'semantic'
        })],
        columns: [makeStructuredColumn('big-r0', {
          columnIndex: 0,
          x: 20,
          width: 120,
          cellIds: ['big-r0-c0'],
          sourceRegionType: 'semantic'
        })]
      })

      const lowConfidenceRegionB = makeStructuredRegion('big-r1', {
        kind: 'key-value',
        subtype: 'key-value-grid',
        boundingBox: { x: 180, y: 20, width: 120, height: 40 },
        confidence: 0.9,
        sourceRegionType: 'semantic',
        cells: [makeStructuredCell('big-r1', {
          id: 'big-r1-c0',
          rowIndex: 0,
          columnIndex: 0,
          boundingBox: { x: 180, y: 20, width: 120, height: 40 },
          sourceRegionType: 'semantic'
        })],
        rows: [makeStructuredRow('big-r1', {
          rowIndex: 0,
          boundingBox: { x: 180, y: 20, width: 120, height: 40 },
          cellIds: ['big-r1-c0'],
          sourceRegionType: 'semantic'
        })],
        columns: [makeStructuredColumn('big-r1', {
          columnIndex: 0,
          x: 180,
          width: 120,
          cellIds: ['big-r1-c0'],
          sourceRegionType: 'semantic'
        })]
      })

      const oversizedRegionA = makeStructuredRegion('big-r2', {
        kind: 'kpi',
        subtype: 'kpi-card',
        boundingBox: { x: 10, y: 10, width: 260, height: 700 },
        confidence: 0.9,
        sourceRegionType: 'semantic',
        cells: [makeStructuredCell('big-r2', {
          id: 'big-r2-c0',
          rowIndex: 0,
          columnIndex: 0,
          boundingBox: { x: 10, y: 10, width: 260, height: 700 },
          sourceRegionType: 'semantic'
        })],
        rows: [makeStructuredRow('big-r2', {
          rowIndex: 0,
          boundingBox: { x: 10, y: 10, width: 260, height: 700 },
          cellIds: ['big-r2-c0'],
          sourceRegionType: 'semantic'
        })],
        columns: [makeStructuredColumn('big-r2', {
          columnIndex: 0,
          x: 10,
          width: 260,
          cellIds: ['big-r2-c0'],
          sourceRegionType: 'semantic'
        })]
      })

      const oversizedRegionB = makeStructuredRegion('big-r3', {
        kind: 'key-value',
        subtype: 'key-value-grid',
        boundingBox: { x: 300, y: 10, width: 260, height: 700 },
        confidence: 0.9,
        sourceRegionType: 'semantic',
        cells: [makeStructuredCell('big-r3', {
          id: 'big-r3-c0',
          rowIndex: 0,
          columnIndex: 0,
          boundingBox: { x: 300, y: 10, width: 260, height: 700 },
          sourceRegionType: 'semantic'
        })],
        rows: [makeStructuredRow('big-r3', {
          rowIndex: 0,
          boundingBox: { x: 300, y: 10, width: 260, height: 700 },
          cellIds: ['big-r3-c0'],
          sourceRegionType: 'semantic'
        })],
        columns: [makeStructuredColumn('big-r3', {
          columnIndex: 0,
          x: 300,
          width: 260,
          cellIds: ['big-r3-c0'],
          sourceRegionType: 'semantic'
        })]
      })

      const lowConfidenceGroup = makeStructuredGroup('dashboard-low', {
        confidence: 0.4,
        regionIds: [lowConfidenceRegionA.id, lowConfidenceRegionB.id],
        regionKinds: [lowConfidenceRegionA.kind, lowConfidenceRegionB.kind]
      })
      const oversizedGroup = makeStructuredGroup('dashboard-big', {
        confidence: 0.93,
        regionIds: [oversizedRegionA.id, oversizedRegionB.id],
        regionKinds: [oversizedRegionA.kind, oversizedRegionB.kind]
      })

      const result = buildPageMaskModel(makeStructuredPageLayout({
        structuredRegions: [
          lowConfidenceRegionA,
          lowConfidenceRegionB,
          oversizedRegionA,
          oversizedRegionB
        ],
        structuredGroups: [lowConfidenceGroup, oversizedGroup]
      }))

      expect(result.masks.some((mask) => mask.type === 'group')).toBe(false)
    })
  })

  describe('mask boundingBox clamped to pageSize', () => {
    it('clamps bbox exceeding page width', () => {
      const block = makeBlock('blk-1', {
        boundingBox: { x: 500, y: 100, width: 200, height: 20 },
        regionId: 'p1-r0'
      })
      const region = makeRegion('p1-r0')

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(612, 792),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(result.masks[0].boundingBox.width).toBeLessThanOrEqual(112)
    })

    it('clamps bbox exceeding page height', () => {
      const block = makeBlock('blk-1', {
        boundingBox: { x: 40, y: 780, width: 200, height: 40 },
        regionId: 'p1-r0'
      })
      const region = makeRegion('p1-r0')

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(612, 792),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(result.masks[0].boundingBox.height).toBeLessThanOrEqual(12)
    })
  })

  describe('invalid bbox is dropped after clamp', () => {
    it('drops mask with zero width after clamp', () => {
      const block = makeBlock('blk-1', {
        boundingBox: { x: 700, y: 100, width: 50, height: 20 },
        regionId: 'p1-r0'
      })
      const region = makeRegion('p1-r0')

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(612, 792),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(result.masks).toHaveLength(0)
    })
  })

  describe('padding capped', () => {
    it('padding does not exceed 50% of dimensions', () => {
      const block = makeBlock('blk-1', {
        boundingBox: { x: 40, y: 100, width: 4, height: 4 },
        regionId: 'p1-r0'
      })
      const region = makeRegion('p1-r0')

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      const mask = result.masks[0]
      expect(mask.padding.top).toBeLessThanOrEqual(2)
      expect(mask.padding.right).toBeLessThanOrEqual(2)
      expect(mask.padding.bottom).toBeLessThanOrEqual(2)
      expect(mask.padding.left).toBeLessThanOrEqual(2)
    })
  })

  describe('metadata counts match', () => {
    it('counts are accurate', () => {
      const block = makeBlock('blk-1', { regionId: 'p1-r0' })
      const region = makeRegion('p1-r0')
      const tableOcc = [
        [
          makeOccupancyCell(0, 0, 'occupied', { cellId: 'c00', boundingBox: { x: 40, y: 200, width: 60, height: 14 } }),
          makeOccupancyCell(0, 1, 'occupied', { cellId: 'c01', boundingBox: { x: 180, y: 200, width: 60, height: 14 } })
        ]
      ]
      const tableRegion = makeTableRegion('p1-r1', { occupancy: tableOcc })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region, tableRegion]
      })

      expect(result.metadata.totalMasks).toBe(3)
      expect(result.metadata.blockMasks).toBe(1)
      expect(result.metadata.cellMasks).toBe(2)
      expect(result.metadata.regionMasks).toBe(0)
    })
  })

  describe('deterministic mask ids', () => {
    it('same input produces same ids', () => {
      const block = makeBlock('blk-1', { regionId: 'p1-r0' })
      const region = makeRegion('p1-r0')

      const input = {
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      }

      const r1 = buildPageMaskModel(input)
      const r2 = buildPageMaskModel(input)

      expect(r1.masks[0].id).toBe(r2.masks[0].id)
    })
  })

  describe('all masks and nested objects frozen', () => {
    it('masks array is frozen', () => {
      const block = makeBlock('blk-1', { regionId: 'p1-r0' })
      const region = makeRegion('p1-r0')

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result.masks)).toBe(true)
      expect(Object.isFrozen(result.metadata)).toBe(true)
      expect(Object.isFrozen(result.masks[0])).toBe(true)
      expect(Object.isFrozen(result.masks[0].boundingBox)).toBe(true)
      expect(Object.isFrozen(result.masks[0].padding)).toBe(true)
    })
  })

  describe('contentHint', () => {
    it('heading block gets heading hint', () => {
      const block = makeBlock('blk-1', {
        role: 'heading',
        regionId: 'p1-r0'
      })
      const region = makeRegion('p1-r0')

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(result.masks[0].contentHint).toBe('heading')
    })

    it('numeric text gets numeric hint', () => {
      const block = makeBlock('blk-1', {
        text: '12,345.67',
        regionId: 'p1-r0'
      })
      const region = makeRegion('p1-r0')

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(result.masks[0].contentHint).toBe('numeric')
    })

    it('financial semantic gets financial hint', () => {
      const block = makeBlock('blk-1', { regionId: 'p1-r0' })
      const region = makeRegion('p1-r0', {
        semantic: { financialStatement: { fragmentType: 'income-statement' } }
      })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(result.masks[0].contentHint).toBe('financial')
    })
  })

  describe('backgroundStrategy', () => {
    it('all masks use sample strategy', () => {
      const block = makeBlock('blk-1', { regionId: 'p1-r0' })
      const region = makeRegion('p1-r0')

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(result.masks[0].backgroundStrategy).toBe('sample')
    })
  })

  describe('priority', () => {
    it('cell masks have priority 90', () => {
      const occupancy = [
        [
          makeOccupancyCell(0, 0, 'occupied', { cellId: 'c00', boundingBox: { x: 40, y: 100, width: 60, height: 14 } }),
          makeOccupancyCell(0, 1, 'occupied', { cellId: 'c01', boundingBox: { x: 180, y: 100, width: 60, height: 14 } })
        ]
      ]
      const region = makeTableRegion('p1-r0', { occupancy })

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [],
        regions: [region]
      })

      expect(result.masks.every((m) => m.priority === 90)).toBe(true)
    })

    it('block masks have priority 50', () => {
      const block = makeBlock('blk-1', { regionId: 'p1-r0' })
      const region = makeRegion('p1-r0')

      const result = buildPageMaskModel({
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      })

      expect(result.masks[0].priority).toBe(50)
    })
  })

  describe('no changes to PageLayoutModel shape', () => {
    it('pageLayout is not mutated', () => {
      const block = makeBlock('blk-1', { regionId: 'p1-r0' })
      const region = makeRegion('p1-r0')
      const pageLayout = {
        pageNumber: 1,
        pageSize: makePageSize(),
        lines: [],
        blocks: [block],
        regions: [region]
      }
      const originalKeys = Object.keys(pageLayout)

      buildPageMaskModel(pageLayout)

      expect(Object.keys(pageLayout)).toEqual(originalKeys)
      expect(pageLayout.masks).toBeUndefined()
    })
  })
})
