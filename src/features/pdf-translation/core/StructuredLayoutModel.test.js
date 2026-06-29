import { describe, expect, it } from 'vitest'
import {
  createEmptyStructuredLayoutModel,
  createStructuredLayoutGroup,
  createStructuredLayoutModel,
  createStructuredLayoutRegion,
  isStructuredLayoutModel,
  STRUCTURED_GROUP_KIND_GRID,
  STRUCTURED_REGION_KIND_KEY_VALUE,
  STRUCTURED_REGION_KIND_KPI,
  STRUCTURED_REGION_KIND_TABLE,
  STRUCTURED_REGION_KIND_UNKNOWN
} from './StructuredLayoutModel.js'

describe('StructuredLayoutModel', () => {
  it('creates an immutable empty model', () => {
    const model = createEmptyStructuredLayoutModel(3, { width: 500, height: 700 })

    expect(model).toEqual({
      version: 1,
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

  it('freezes region and group entries', () => {
    const region = createStructuredLayoutRegion({
      regionId: 'p1-r0',
      kind: STRUCTURED_REGION_KIND_TABLE,
      confidence: 0.9,
      sourceRegionType: 'table',
      boundingBox: { x: 40, y: 100, width: 120, height: 40 },
      blockIds: ['b1'],
      childRegionIds: ['p1-r1'],
      lineCount: 2,
      classificationSource: 'table',
      details: {
        table: {
          columnCount: 2,
          rowCount: 2,
          cellCount: 4,
          hasSpanCandidates: true,
          hasMergedCells: false,
          hasMultiLevelHeaders: false
        },
        semantic: null
      }
    })

    const group = createStructuredLayoutGroup({
      groupId: 'dashboard-1',
      kind: STRUCTURED_GROUP_KIND_GRID,
      layout: 'row',
      confidence: 0.7,
      boundingBox: { x: 40, y: 100, width: 240, height: 80 },
      regionIds: ['p1-r0', 'p1-r1'],
      regionKinds: [STRUCTURED_REGION_KIND_KPI, STRUCTURED_REGION_KIND_KEY_VALUE]
    })

    const model = createStructuredLayoutModel({
      pageNumber: 1,
      pageSize: { width: 600, height: 800 },
      regions: [region, createStructuredLayoutRegion({ kind: STRUCTURED_REGION_KIND_UNKNOWN })],
      groups: [group]
    })

    expect(Object.isFrozen(model.regions[0])).toBe(true)
    expect(Object.isFrozen(model.groups[0])).toBe(true)
    expect(Object.isFrozen(model.regions[0].details)).toBe(true)
    expect(Object.isFrozen(model.regions[0].details.table)).toBe(true)
    expect(isStructuredLayoutModel(model)).toBe(true)
  })

  it('rejects invalid models', () => {
    expect(isStructuredLayoutModel(null)).toBe(false)
    expect(isStructuredLayoutModel({})).toBe(false)
    expect(isStructuredLayoutModel({
      version: 1,
      pageNumber: 1,
      pageSize: { width: 1, height: 1 },
      regions: [],
      groups: [],
      summary: {},
      hasStructuredContent: false
    })).toBe(false)
  })
})
