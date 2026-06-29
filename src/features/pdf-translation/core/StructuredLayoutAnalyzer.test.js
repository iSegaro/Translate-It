import { describe, expect, it } from 'vitest'
import { analyzeStructuredLayout } from './StructuredLayoutAnalyzer.js'

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
  it('bridges table metadata into structured regions without changing table output', () => {
    const table = {
      columnCount: 2,
      rowCount: 2,
      hasSpanCandidates: true,
      hasMergedCells: false,
      hasMultiLevelHeaders: false,
      columns: [{ x: 40, width: 60 }],
      rows: [{ y: 100, height: 20 }],
      cells: [
        { rowIndex: 0, columnIndex: 0, text: 'Name' },
        { rowIndex: 0, columnIndex: 1, text: 'Age' }
      ],
      grid: { rows: [], columns: [], occupancy: [] }
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
    expect(model.regions[0].classificationSource).toBe('table')
    expect(model.regions[0].details.table.columnCount).toBe(2)
    expect(model.regions[0].details.table.cellCount).toBe(2)
    expect(model.regions[0].details.semantic).toBeNull()
  })

  it('classifies KPI regions from semantic metadata', () => {
    const region = makeRegion({
      metadata: {
        semantic: {
          type: 'kpi-candidate',
          confidence: 0.82,
          metrics: [{ value: '$12.5B' }]
        }
      }
    })

    const model = analyzeStructuredLayout({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions: [region]
    })

    expect(model.summary.kpiRegionCount).toBe(1)
    expect(model.regions[0].kind).toBe('kpi')
    expect(model.regions[0].confidence).toBe(0.82)
    expect(model.regions[0].classificationSource).toBe('semantic-kpi')
    expect(model.regions[0].details.semantic.type).toBe('kpi-candidate')
    expect(model.regions[0].details.semantic.metricCount).toBe(1)
  })

  it('classifies key-value regions from semantic metadata', () => {
    const region = makeRegion({
      metadata: {
        semantic: {
          type: 'key-value-candidate',
          confidence: 0.74,
          pairs: [{ label: 'Revenue', value: '$12.5B' }]
        }
      }
    })

    const model = analyzeStructuredLayout({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions: [region]
    })

    expect(model.summary.keyValueRegionCount).toBe(1)
    expect(model.regions[0].kind).toBe('key-value')
    expect(model.regions[0].confidence).toBe(0.74)
    expect(model.regions[0].classificationSource).toBe('semantic-key-value')
    expect(model.regions[0].details.semantic.type).toBe('key-value-candidate')
    expect(model.regions[0].details.semantic.pairCount).toBe(1)
  })

  it('groups dashboard-like regions into grid structures', () => {
    const regions = [
      makeRegion({
        id: 'p1-r0',
        boundingBox: { x: 40, y: 100, width: 160, height: 80 },
        metadata: {
          semantic: {
            type: 'kpi-candidate',
            confidence: 0.68,
            metrics: [{ value: '128' }],
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
            pairs: [{ label: 'Label', value: 'Value' }],
            dashboardGroup: {
              groupId: 'dashboard-1',
              layout: 'row',
              confidence: 0.72,
              regionIds: ['p1-r0', 'p1-r1'],
              role: 'member'
            }
          }
        }
      })
    ]

    const model = analyzeStructuredLayout({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions
    })

    expect(model.summary.gridGroupCount).toBe(1)
    expect(model.summary.groupedRegionCount).toBe(2)
    expect(model.groups).toHaveLength(1)
    expect(model.groups[0].groupId).toBe('dashboard-1')
    expect(model.groups[0].kind).toBe('grid')
    expect(model.groups[0].layout).toBe('row')
    expect(model.groups[0].regionIds).toEqual(['p1-r0', 'p1-r1'])
    expect(model.groups[0].regionKinds).toEqual(['kpi', 'key-value'])
    expect(model.regions[0].groupId).toBe('dashboard-1')
    expect(model.regions[1].groupId).toBe('dashboard-1')
  })

  it('keeps fallback regions classified as unknown', () => {
    const region = makeRegion()

    const model = analyzeStructuredLayout({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions: [region]
    })

    expect(model.summary.fallbackRegionCount).toBe(1)
    expect(model.summary.hasStructuredContent).toBe(false)
    expect(model.regions[0].kind).toBe('unknown')
    expect(model.regions[0].classificationSource).toBe('fallback')
  })
})
