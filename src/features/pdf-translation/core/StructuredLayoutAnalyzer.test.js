import { describe, expect, it } from 'vitest'
import { analyzeStructuredLayout } from './StructuredLayoutAnalyzer.js'

function makeLine({
  text,
  x,
  y,
  width,
  height,
  items
} = {}) {
  return {
    text,
    boundingBox: { x, y, width, height },
    fontSize: 12,
    items: items || [{
      index: 0,
      text,
      x,
      y,
      width,
      height
    }]
  }
}

function makeRegion({
  id = 'p1-r0',
  type = 'paragraph',
  boundingBox = { x: 40, y: 100, width: 200, height: 80 },
  metadata = {},
  blockIds = ['b1'],
  childRegionIds = []
} = {}) {
  return {
    id,
    type,
    boundingBox,
    childRegionIds,
    blockIds,
    metadata: {
      lineCount: 2,
      fontSize: 12,
      gapThreshold: 36,
      ...metadata
    }
  }
}

describe('StructuredLayoutAnalyzer', () => {
  it('preserves canonical table rows, columns, cells, occupancy, spans, and compatibility', () => {
    const table = {
      columnCount: 2,
      rowCount: 2,
      hasSpanCandidates: true,
      hasMergedCells: false,
      hasMultiLevelHeaders: false,
      columns: [
        { x: 40, width: 80, align: 'left', itemCount: 2, averageWidth: 72 },
        { x: 160, width: 80, align: 'right', itemCount: 2, averageWidth: 70 }
      ],
      rows: [
        { index: 0, y: 100, height: 20, lineIndices: [0], lineCount: 1 },
        { index: 1, y: 124, height: 20, lineIndices: [1], lineCount: 1 }
      ],
      cells: [
        {
          cellId: 'p1-r0-c0-i0',
          rowIndex: 0,
          columnIndex: 0,
          text: 'Name',
          boundingBox: { x: 40, y: 100, width: 80, height: 20 },
          sourceLineIndex: 0,
          sourceItemIndex: 0,
          spanCandidate: false,
          estimatedColSpan: 1
        },
        {
          cellId: 'p1-r0-c1-i1',
          rowIndex: 0,
          columnIndex: 1,
          text: 'Personal Info',
          boundingBox: { x: 160, y: 100, width: 140, height: 20 },
          sourceLineIndex: 0,
          sourceItemIndex: 1,
          spanCandidate: true,
          estimatedColSpan: 2
        },
        {
          cellId: 'p1-r1-c0-i0',
          rowIndex: 1,
          columnIndex: 0,
          text: 'Alice',
          boundingBox: { x: 40, y: 124, width: 80, height: 20 },
          sourceLineIndex: 1,
          sourceItemIndex: 0,
          spanCandidate: false,
          estimatedColSpan: 1
        },
        {
          cellId: 'p1-r1-c1-i1',
          rowIndex: 1,
          columnIndex: 1,
          text: '30',
          boundingBox: { x: 160, y: 124, width: 80, height: 20 },
          sourceLineIndex: 1,
          sourceItemIndex: 1,
          spanCandidate: false,
          estimatedColSpan: 1
        }
      ],
      grid: {
        rows: [
          [
            { cellId: 'p1-r0-c0-i0', rowIndex: 0, columnIndex: 0, colSpan: 1, rowSpan: 1, spanType: 'none' },
            { cellId: 'p1-r0-c1-i1', rowIndex: 0, columnIndex: 1, colSpan: 2, rowSpan: 1, spanType: 'colspan-candidate' }
          ],
          [
            { cellId: 'p1-r1-c0-i0', rowIndex: 1, columnIndex: 0, colSpan: 1, rowSpan: 1, spanType: 'none' },
            { cellId: 'p1-r1-c1-i1', rowIndex: 1, columnIndex: 1, colSpan: 1, rowSpan: 1, spanType: 'none' }
          ]
        ],
        columns: [
          { columnIndex: 0, x: 40, width: 80 },
          { columnIndex: 1, x: 160, width: 80 }
        ],
        occupancy: [
          [
            { rowIndex: 0, columnIndex: 0, state: 'occupied', cellId: 'p1-r0-c0-i0', ownerCellId: 'p1-r0-c0-i0', rowSpan: 1, colSpan: 1, boundingBox: { x: 40, y: 100, width: 80, height: 20 } },
            { rowIndex: 0, columnIndex: 1, state: 'occupied', cellId: 'p1-r0-c1-i1', ownerCellId: 'p1-r0-c1-i1', rowSpan: 1, colSpan: 2, boundingBox: { x: 160, y: 100, width: 140, height: 20 } }
          ],
          [
            { rowIndex: 1, columnIndex: 0, state: 'occupied', cellId: 'p1-r1-c0-i0', ownerCellId: 'p1-r1-c0-i0', rowSpan: 1, colSpan: 1, boundingBox: { x: 40, y: 124, width: 80, height: 20 } },
            { rowIndex: 1, columnIndex: 1, state: 'occupied', cellId: 'p1-r1-c1-i1', ownerCellId: 'p1-r1-c1-i1', rowSpan: 1, colSpan: 1, boundingBox: { x: 160, y: 124, width: 80, height: 20 } }
          ]
        ]
      }
    }

    const region = makeRegion({
      type: 'table',
      metadata: { table }
    })

    const model = analyzeStructuredLayout({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions: [region]
    })

    expect(model.summary.tableRegionCount).toBe(1)
    expect(model.summary.structuredRegionCount).toBe(1)
    expect(model.regions).toHaveLength(1)
    expect(model.regions[0].kind).toBe('table')
    expect(model.regions[0].subtype).toBe('table')
    expect(model.regions[0].rows).toHaveLength(2)
    expect(model.regions[0].columns).toHaveLength(2)
    expect(model.regions[0].cells).toHaveLength(4)
    expect(model.regions[0].spans).toHaveLength(1)
    expect(model.regions[0].rows[0].cellIds).toEqual(['p1-r0-c0-i0', 'p1-r0-c1-i1'])
    expect(model.regions[0].columns[0].cellIds).toEqual(['p1-r0-c0-i0', 'p1-r1-c0-i0'])
    expect(model.regions[0].grid.dimensions).toEqual({ rowCount: 2, columnCount: 2 })
    expect(model.regions[0].grid.occupancy[0][1].colSpan).toBe(2)
    expect(model.regions[0].compatibility.table).toBe(table)
    expect(model.regions[0].sourceReferences.blockIds).toEqual(['b1'])
    expect(model.regions[0].relationships.rowIds).toEqual(['p1-r0-row-0', 'p1-r0-row-1'])
    expect(Object.isFrozen(model.regions[0].rows)).toBe(true)
    expect(Object.isFrozen(model.regions[0].columns)).toBe(true)
    expect(Object.isFrozen(model.regions[0].cells)).toBe(true)
    expect(Object.isFrozen(model.regions[0].spans)).toBe(true)
    expect(Object.isFrozen(model.regions[0].grid)).toBe(true)
    expect(Object.isFrozen(model.regions[0].grid.occupancy)).toBe(true)
    expect(Object.isFrozen(model.regions[0].grid.occupancy[0])).toBe(true)
    expect(Object.isFrozen(model.regions[0].grid.occupancy[0][0])).toBe(true)

    const repeated = analyzeStructuredLayout({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions: [makeRegion({ type: 'table', metadata: { table } })]
    })

    expect(repeated.regions[0].rows.map((row) => row.id)).toEqual(model.regions[0].rows.map((row) => row.id))
    expect(repeated.regions[0].columns.map((column) => column.id)).toEqual(model.regions[0].columns.map((column) => column.id))
    expect(repeated.regions[0].cells.map((cell) => cell.id)).toEqual(model.regions[0].cells.map((cell) => cell.id))
  })

  it('creates conservative KPI canonical cells from semantic metrics', () => {
    const lines = [
      makeLine({
        text: 'Revenue',
        x: 40,
        y: 100,
        width: 60,
        height: 12,
        items: [{ index: 0, text: 'Revenue', x: 40, y: 100, width: 60, height: 12 }]
      }),
      makeLine({
        text: '12.5B',
        x: 120,
        y: 100,
        width: 40,
        height: 12,
        items: [{ index: 0, text: '12.5B', x: 120, y: 100, width: 40, height: 12 }]
      }),
      makeLine({
        text: '+5%',
        x: 170,
        y: 100,
        width: 30,
        height: 12,
        items: [{ index: 0, text: '+5%', x: 170, y: 100, width: 30, height: 12 }]
      })
    ]

    const region = makeRegion({
      metadata: {
        semantic: {
          type: 'kpi-candidate',
          confidence: 0.82,
          metrics: [{
            label: 'Revenue',
            value: '12.5B',
            delta: '+5%',
            labelLineIndex: 0,
            valueLineIndex: 1,
            deltaLineIndex: 2
          }]
        }
      }
    })

    const model = analyzeStructuredLayout({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions: [region],
      lines
    })

    expect(model.summary.kpiRegionCount).toBe(1)
    expect(model.regions[0].kind).toBe('kpi')
    expect(model.regions[0].subtype).toBe('kpi-card')
    expect(model.regions[0].rows).toHaveLength(1)
    expect(model.regions[0].columns).toHaveLength(3)
    expect(model.regions[0].cells).toHaveLength(3)
    expect(model.regions[0].rows[0].cellIds).toEqual([
      'p1-r0-r0-c0-label',
      'p1-r0-r0-c1-value',
      'p1-r0-r0-c2-delta'
    ])
    expect(model.regions[0].cells.map((cell) => cell.role)).toEqual(['label', 'value', 'delta'])
    expect(model.regions[0].grid.dimensions).toEqual({ rowCount: 1, columnCount: 3 })
    expect(model.regions[0].structureSignals.kpi.metricCount).toBe(1)
    expect(model.regions[0].sourceReferences.sourceLineIndices).toEqual([0, 1, 2])
  })

  it('creates conservative key-value canonical cells from semantic pairs', () => {
    const lines = [
      makeLine({
        text: 'Revenue: 12.5B',
        x: 40,
        y: 100,
        width: 160,
        height: 12,
        items: [
          { index: 0, text: 'Revenue', x: 40, y: 100, width: 70, height: 12 },
          { index: 1, text: '12.5B', x: 120, y: 100, width: 40, height: 12 }
        ]
      })
    ]

    const region = makeRegion({
      metadata: {
        semantic: {
          type: 'key-value-candidate',
          confidence: 0.74,
          pairs: [{
            label: 'Revenue',
            value: '12.5B',
            separator: 'colon',
            labelLineIndex: 0,
            valueLineIndex: 0,
            labelBbox: { x: 40, y: 100, width: 70, height: 12 },
            valueBbox: { x: 120, y: 100, width: 40, height: 12 }
          }]
        }
      }
    })

    const model = analyzeStructuredLayout({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions: [region],
      lines
    })

    expect(model.summary.keyValueRegionCount).toBe(1)
    expect(model.regions[0].kind).toBe('key-value')
    expect(model.regions[0].subtype).toBe('key-value-grid')
    expect(model.regions[0].rows).toHaveLength(1)
    expect(model.regions[0].columns).toHaveLength(2)
    expect(model.regions[0].cells).toHaveLength(2)
    expect(model.regions[0].cells.map((cell) => cell.role)).toEqual(['label', 'value'])
    expect(model.regions[0].grid.dimensions).toEqual({ rowCount: 1, columnCount: 2 })
    expect(model.regions[0].sourceReferences.sourceLineIndices).toEqual([0])
  })

  it('preserves dashboard grouping and keeps unknown regions empty', () => {
    const groupedRegions = [
      makeRegion({
        id: 'p1-r0',
        boundingBox: { x: 40, y: 100, width: 160, height: 80 },
        metadata: {
          semantic: {
            type: 'kpi-candidate',
            confidence: 0.68,
            metrics: [{ label: 'Orders', value: '128', labelLineIndex: 0, valueLineIndex: 1 }],
            dashboardGroup: {
              groupId: 'dashboard-1',
              layout: 'row',
              confidence: 0.72,
              regionIds: ['p1-r0', 'p1-r1'],
              role: 'member'
            }
          }
        }
      }),
      makeRegion({
        id: 'p1-r1',
        boundingBox: { x: 220, y: 100, width: 160, height: 80 },
        metadata: {
          semantic: {
            type: 'key-value-candidate',
            confidence: 0.61,
            pairs: [{ label: 'Label', value: 'Value', labelLineIndex: 1, valueLineIndex: 2 }],
            dashboardGroup: {
              groupId: 'dashboard-1',
              layout: 'row',
              confidence: 0.72,
              regionIds: ['p1-r0', 'p1-r1'],
              role: 'member'
            }
          }
        }
      }),
      makeRegion({
        id: 'p1-r2',
        metadata: {}
      })
    ]

    const model = analyzeStructuredLayout({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions: groupedRegions,
      lines: [
        makeLine({ text: 'Orders', x: 40, y: 100, width: 60, height: 12 }),
        makeLine({ text: '128', x: 120, y: 100, width: 30, height: 12 }),
        makeLine({ text: 'Label', x: 220, y: 100, width: 60, height: 12 }),
        makeLine({ text: 'Value', x: 290, y: 100, width: 60, height: 12 })
      ]
    })

    expect(model.summary.gridGroupCount).toBe(1)
    expect(model.summary.groupedRegionCount).toBe(2)
    expect(model.groups).toHaveLength(1)
    expect(model.groups[0].groupId).toBe('dashboard-1')
    expect(model.groups[0].kind).toBe('grid')
    expect(model.groups[0].layout).toBe('row')
    expect(model.groups[0].regionIds).toEqual(['p1-r0', 'p1-r1'])
    expect(model.groups[0].regionKinds).toEqual(['kpi', 'key-value'])
    expect(model.groups[0].relationships.memberRegionIds).toEqual(['p1-r0', 'p1-r1'])
    expect(model.regions[0].groupId).toBe('dashboard-1')
    expect(model.regions[1].groupId).toBe('dashboard-1')

    const emptyRegion = model.regions[2]
    expect(emptyRegion.kind).toBe('unknown')
    expect(emptyRegion.rows).toEqual([])
    expect(emptyRegion.columns).toEqual([])
    expect(emptyRegion.cells).toEqual([])
    expect(emptyRegion.spans).toEqual([])
    expect(emptyRegion.grid.dimensions).toEqual({ rowCount: 0, columnCount: 0 })
  })
})
