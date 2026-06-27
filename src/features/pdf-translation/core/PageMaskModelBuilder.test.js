import { describe, it, expect } from 'vitest'
import { buildPageMaskModel } from './PageMaskModelBuilder.js'

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
