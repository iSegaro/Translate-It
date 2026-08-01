import { describe, expect, it } from 'vitest'
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
  isStructuredLayoutGroup,
  isStructuredLayoutModel,
  isStructuredLayoutRegion,
  STRUCTURED_GROUP_KIND_GRID,
  STRUCTURED_REGION_KIND_TABLE
} from './StructuredLayoutModel.js'

describe('StructuredLayoutModel', () => {
  it('creates an immutable empty canonical model', () => {
    const model = createEmptyStructuredLayoutModel(3, { width: 500, height: 700 })

    expect(model).toEqual({
      version: 2,
      pageNumber: 3,
      pageSize: { width: 500, height: 700 },
      regions: [],
      groups: [],
      summary: {
        regionCount: 0,
        structuredRegionCount: 0,
        tableRegionCount: 0,
        kpiRegionCount: 0,
        keyValueRegionCount: 0,
        fallbackRegionCount: 0,
        groupedRegionCount: 0,
        gridGroupCount: 0,
        mixedGroupCount: 0,
        hasStructuredContent: false
      },
      hasStructuredContent: false
    })

    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.pageSize)).toBe(true)
    expect(Object.isFrozen(model.regions)).toBe(true)
    expect(Object.isFrozen(model.groups)).toBe(true)
    expect(Object.isFrozen(model.summary)).toBe(true)
    expect(isStructuredLayoutModel(model)).toBe(true)
  })

  it('creates frozen canonical entities with nested graph integrity', () => {
    const row = createStructuredLayoutRow({
      id: 'r-row-0',
      rowIndex: 0,
      boundingBox: { x: 40, y: 100, width: 200, height: 24 },
      cellIds: ['r-cell-0']
    })

    const column = createStructuredLayoutColumn({
      id: 'r-col-0',
      columnIndex: 0,
      x: 40,
      width: 200,
      cellIds: ['r-cell-0']
    })

    const cell = createStructuredLayoutCell({
      id: 'r-cell-0',
      regionId: 'r-region-0',
      rowIndex: 0,
      columnIndex: 0,
      rowSpan: 1,
      colSpan: 1,
      spanType: 'none',
      role: 'cell',
      text: 'Name',
      boundingBox: { x: 40, y: 100, width: 200, height: 24 },
      sourceReferences: {
        blockIds: ['b1'],
        lineIds: [],
        sourceLineIndices: [0],
        sourceItemIndices: [0],
        sourceRegionId: 'r-region-0',
        sourceRegionType: STRUCTURED_REGION_KIND_TABLE
      },
      spanCandidate: false,
      estimatedRowSpan: 1,
      estimatedColSpan: 1,
      confidence: 0.9
    })

    const span = createStructuredLayoutSpan({
      id: 'r-span-0',
      regionId: 'r-region-0',
      rowIndex: 0,
      columnIndex: 0,
      rowSpan: 1,
      colSpan: 2,
      spanType: 'candidate',
      cellIds: ['r-cell-0'],
      boundingBox: { x: 40, y: 100, width: 200, height: 24 },
      confidence: 0.8,
      sourceReferences: {
        blockIds: ['b1'],
        lineIds: [],
        sourceLineIndices: [0],
        sourceItemIndices: [0],
        sourceRegionId: 'r-region-0',
        sourceRegionType: STRUCTURED_REGION_KIND_TABLE
      },
    })

    const grid = createStructuredLayoutGrid({
      dimensions: { rowCount: 1, columnCount: 1 },
      rows: [row],
      columns: [column],
      occupancy: [[{
        rowIndex: 0,
        columnIndex: 0,
        state: 'occupied',
        cellId: 'r-cell-0',
        ownerCellId: 'r-cell-0',
        rowSpan: 1,
        colSpan: 1,
        boundingBox: { x: 40, y: 100, width: 200, height: 24 }
      }]]
    })

    const region = createStructuredLayoutRegion({
      id: 'r-region-0',
      kind: STRUCTURED_REGION_KIND_TABLE,
      subtype: 'table',
      confidence: 0.9,
      sourceRegionType: 'table',
      boundingBox: { x: 40, y: 100, width: 200, height: 24 },
      rows: [row],
      columns: [column],
      cells: [cell],
      spans: [span],
      grid,
      relationships: {
        rowIds: [row.id],
        columnIds: [column.id],
        cellIds: [cell.id],
        spanIds: [span.id],
        rowToCellIds: [[cell.id]],
        columnToCellIds: [[cell.id]],
        spanToCellIds: [[cell.id]],
        sourceBlockIds: ['b1'],
        sourceLineIndices: [0],
        sourceItemIndices: [0],
        groupId: null,
        groupRegionIds: []
      },
      structureSignals: {
        sourceType: 'table',
        classificationSource: 'table',
        confidence: 0.9,
        table: {
          columnCount: 1,
          rowCount: 1,
          cellCount: 1,
          hasSpanCandidates: false,
          hasMergedCells: false,
          hasMultiLevelHeaders: false
        }
      },
      sourceReferences: {
        blockIds: ['b1'],
        lineIds: [],
        sourceLineIndices: [0],
        sourceItemIndices: [0],
        sourceRegionId: 'r-region-0',
        sourceRegionType: STRUCTURED_REGION_KIND_TABLE,
        groupId: null,
        groupRegionIds: []
      },
      blockIds: ['b1'],
      childRegionIds: [],
      lineCount: 1,
      groupId: null,
      groupLayout: null,
      classificationSource: 'table'
    })

    const group = createStructuredLayoutGroup({
      id: 'dashboard-1',
      groupId: 'dashboard-1',
      kind: STRUCTURED_GROUP_KIND_GRID,
      layout: 'row',
      confidence: 0.7,
      boundingBox: { x: 40, y: 100, width: 200, height: 24 },
      regionIds: ['r-region-0'],
      regionKinds: [STRUCTURED_REGION_KIND_TABLE]
    })

    const model = createStructuredLayoutModel({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions: [region],
      groups: [group]
    })

    expect(model.regions[0].rows).toEqual([row])
    expect(model.regions[0].columns).toEqual([column])
    expect(model.regions[0].cells).toEqual([cell])
    expect(model.regions[0].spans).toEqual([span])
    expect(model.regions[0].grid).toEqual(grid)
    expect(model.regions[0].relationships.rowIds).toEqual([row.id])
    expect(model.regions[0].sourceReferences.blockIds).toEqual(['b1'])
    expect(model.regions[0].compatibility).toBeUndefined()
    expect(model.regions[0].details).toBeUndefined()
    expect(isStructuredLayoutRegion(model.regions[0])).toBe(true)
    expect(isStructuredLayoutGroup(model.groups[0])).toBe(true)

    expect(Object.isFrozen(model.regions[0].rows)).toBe(true)
    expect(Object.isFrozen(model.regions[0].columns)).toBe(true)
    expect(Object.isFrozen(model.regions[0].cells)).toBe(true)
    expect(Object.isFrozen(model.regions[0].spans)).toBe(true)
    expect(Object.isFrozen(model.regions[0].grid)).toBe(true)
    expect(Object.isFrozen(model.regions[0].grid.occupancy)).toBe(true)
    expect(Object.isFrozen(model.regions[0].grid.occupancy[0])).toBe(true)
    expect(Object.isFrozen(model.regions[0].grid.occupancy[0][0])).toBe(true)
    expect(Object.isFrozen(model.regions[0].structureSignals)).toBe(true)
    expect(Object.isFrozen(model.regions[0].sourceReferences)).toBe(true)
  })

  it('accepts canonical entities without compatibility payloads', () => {
    const row = createStructuredLayoutRow({
      id: 'c-row-0',
      rowIndex: 0,
      cellIds: ['c-cell-0'],
      sourceReferences: {
        blockIds: ['b1'],
        lineIds: [],
        sourceLineIndices: [0],
        sourceItemIndices: [0],
        sourceRegionId: 'c-region-0',
        sourceRegionType: STRUCTURED_REGION_KIND_TABLE
      }
    })

    const column = createStructuredLayoutColumn({
      id: 'c-col-0',
      columnIndex: 0,
      x: 40,
      width: 120,
      cellIds: ['c-cell-0'],
      sourceReferences: {
        blockIds: ['b1'],
        lineIds: [],
        sourceLineIndices: [0],
        sourceItemIndices: [0],
        sourceRegionId: 'c-region-0',
        sourceRegionType: STRUCTURED_REGION_KIND_TABLE
      }
    })

    const cell = createStructuredLayoutCell({
      id: 'c-cell-0',
      regionId: 'c-region-0',
      rowIndex: 0,
      columnIndex: 0,
      rowSpan: 1,
      colSpan: 1,
      spanType: 'none',
      role: 'cell',
      text: 'Canonical',
      boundingBox: { x: 40, y: 100, width: 120, height: 20 },
      sourceReferences: {
        blockIds: ['b1'],
        lineIds: [],
        sourceLineIndices: [0],
        sourceItemIndices: [0],
        sourceRegionId: 'c-region-0',
        sourceRegionType: STRUCTURED_REGION_KIND_TABLE
      }
    })

    const region = createStructuredLayoutRegion({
      id: 'c-region-0',
      kind: STRUCTURED_REGION_KIND_TABLE,
      subtype: 'table',
      confidence: 0.9,
      sourceRegionType: STRUCTURED_REGION_KIND_TABLE,
      rows: [row],
      columns: [column],
      cells: [cell],
      spans: [],
      grid: createStructuredLayoutGrid({
        dimensions: { rowCount: 1, columnCount: 1 },
        rows: [row],
        columns: [column],
        occupancy: [[{
          rowIndex: 0,
          columnIndex: 0,
          state: 'occupied',
          cellId: 'c-cell-0',
          ownerCellId: 'c-cell-0',
          rowSpan: 1,
          colSpan: 1,
          boundingBox: { x: 40, y: 100, width: 120, height: 20 }
        }]]
      }),
      relationships: {
        rowIds: ['c-row-0'],
        columnIds: ['c-col-0'],
        cellIds: ['c-cell-0'],
        spanIds: [],
        rowToCellIds: [['c-cell-0']],
        columnToCellIds: [['c-cell-0']],
        spanToCellIds: [],
        sourceBlockIds: ['b1'],
        sourceLineIndices: [0],
        sourceItemIndices: [0],
        groupId: null,
        groupRegionIds: []
      },
      structureSignals: {
        sourceType: 'table',
        classificationSource: 'table',
        confidence: 0.9,
        signals: {
          rowCount: 1,
          columnCount: 1,
          cellCount: 1,
          spanCount: 0
        }
      },
      sourceReferences: {
        blockIds: ['b1'],
        lineIds: [],
        sourceLineIndices: [0],
        sourceItemIndices: [0],
        sourceRegionId: 'c-region-0',
        sourceRegionType: STRUCTURED_REGION_KIND_TABLE,
        groupId: null,
        groupRegionIds: []
      },
      blockIds: ['b1'],
      childRegionIds: [],
      lineCount: 1,
      groupId: null,
      groupLayout: null,
      classificationSource: 'table'
    })

    const group = createStructuredLayoutGroup({
      id: 'c-group-0',
      groupId: 'c-group-0',
      kind: STRUCTURED_GROUP_KIND_GRID,
      layout: 'row',
      confidence: 0.6,
      boundingBox: { x: 40, y: 100, width: 120, height: 20 },
      regionIds: ['c-region-0'],
      regionKinds: [STRUCTURED_REGION_KIND_TABLE]
    })

    const model = createStructuredLayoutModel({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions: [region],
      groups: [group]
    })

    expect(isStructuredLayoutRegion(model.regions[0])).toBe(true)
    expect(isStructuredLayoutGroup(model.groups[0])).toBe(true)
    expect(model.regions[0].compatibility).toBeUndefined()
    expect(model.regions[0].details).toBeUndefined()
    expect(model.groups[0].compatibility).toBeUndefined()

    const legacyFreeRegion = {
      ...model.regions[0],
      sourceReferences: {
        ...model.regions[0].sourceReferences
      }
    }
    delete legacyFreeRegion.sourceReferences.lineIds

    expect(isStructuredLayoutRegion(legacyFreeRegion)).toBe(true)
  })

  it('rejects invalid models', () => {
    expect(isStructuredLayoutModel(null)).toBe(false)
    expect(isStructuredLayoutModel({})).toBe(false)
    expect(isStructuredLayoutModel({
      version: 2,
      pageNumber: 1,
      pageSize: { width: 1, height: 1 },
      regions: [],
      groups: [],
      summary: {},
      hasStructuredContent: false
    })).toBe(false)
  })
})
