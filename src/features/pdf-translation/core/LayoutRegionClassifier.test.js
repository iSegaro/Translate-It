import { describe, expect, it } from 'vitest'
import {
  classifyLayoutRegions,
  REGION_TYPE_PARAGRAPH,
  REGION_TYPE_HEADING,
  REGION_TYPE_LIST,
  REGION_TYPE_TABLE,
  REGION_TYPE_UNKNOWN
} from './LayoutRegionClassifier.js'

function makeLine(y, { fontSize = 12, text = 'line', direction = 'ltr', items = [], width = 200, x = 40 } = {}) {
  return {
    text,
    boundingBox: { x, y, width, height: fontSize },
    fontSize,
    direction,
    items
  }
}

function makeBlock(id, role, { isStructured = false, lineCount = 1, x = 40, y = 100, width = 200, height = 30 } = {}) {
  return {
    id,
    role,
    text: `block ${id}`,
    pageNumber: 1,
    readingOrderIndex: 0,
    columnIndex: 0,
    boundingBox: { x, y, width, height },
    roleMetadata: {
      isStructured,
      lineCount,
      fontSize: 12
    }
  }
}

function makeRegion(id, { blockIds = [], boundingBox = { x: 40, y: 100, width: 200, height: 60 } } = {}) {
  return {
    id,
    type: 'unknown',
    boundingBox,
    childRegionIds: [],
    blockIds,
    metadata: {
      lineCount: 2,
      fontSize: 12,
      gapThreshold: 36
    }
  }
}

describe('LayoutRegionClassifier', () => {
  describe('paragraph classification', () => {
    it('classifies region with paragraph blocks as paragraph', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1'] })
      const lines = [
        makeLine(100, { text: 'Hello world this is a paragraph' }),
        makeLine(120, { text: 'Continuation of the paragraph' })
      ]
      const blocks = [makeBlock('b1', 'paragraph')]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].type).toBe(REGION_TYPE_PARAGRAPH)
    })

    it('classifies empty blockIds region as paragraph', () => {
      const region = makeRegion('p1-r0', { blockIds: [] })
      const lines = [
        makeLine(100, { text: 'Some text content here' }),
        makeLine(120, { text: 'More text content here' })
      ]

      const result = classifyLayoutRegions([region], lines, [])

      expect(result[0].type).toBe(REGION_TYPE_PARAGRAPH)
    })
  })

  describe('heading classification from block role', () => {
    it('classifies region with dominant heading blocks as heading', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1'] })
      const lines = [makeLine(100, { text: 'Chapter Title', fontSize: 24 })]
      const blocks = [makeBlock('b1', 'heading')]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].type).toBe(REGION_TYPE_HEADING)
    })

    it('classifies region with 50%+ heading blocks as heading', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1', 'b2', 'b3'] })
      const lines = [
        makeLine(100, { text: 'Section Title', fontSize: 18 }),
        makeLine(130, { text: 'Subsection', fontSize: 16 }),
        makeLine(160, { text: 'Body text', fontSize: 12 })
      ]
      const blocks = [
        makeBlock('b1', 'heading'),
        makeBlock('b2', 'heading'),
        makeBlock('b3', 'paragraph')
      ]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].type).toBe(REGION_TYPE_HEADING)
    })
  })

  describe('heading fallback from font ratio', () => {
    it('classifies short large-font region as heading via fallback', () => {
      const region = makeRegion('p1-r0', { blockIds: [] })
      const lines = [
        makeLine(100, { text: 'Big Title', fontSize: 24, width: 100 }),
        makeLine(400, { text: 'Body text line 1', fontSize: 12 }),
        makeLine(420, { text: 'Body text line 2', fontSize: 12 }),
        makeLine(440, { text: 'Body text line 3', fontSize: 12 })
      ]

      const result = classifyLayoutRegions([region], lines, [])

      expect(result[0].type).toBe(REGION_TYPE_HEADING)
    })

    it('does not classify long text as heading even with large font', () => {
      const region = makeRegion('p1-r0', { blockIds: [] })
      const lines = [
        makeLine(100, { text: 'This is a very long text that should not be classified as heading because it exceeds the maximum length', fontSize: 24 }),
        makeLine(400, { text: 'Body text', fontSize: 12 })
      ]

      const result = classifyLayoutRegions([region], lines, [])

      expect(result[0].type).not.toBe(REGION_TYPE_HEADING)
    })
  })

  describe('list classification from block role', () => {
    it('classifies region with dominant list-item blocks as list', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1', 'b2', 'b3'] })
      const lines = [
        makeLine(100, { text: '• Item one' }),
        makeLine(120, { text: '• Item two' }),
        makeLine(140, { text: '• Item three' })
      ]
      const blocks = [
        makeBlock('b1', 'list-item'),
        makeBlock('b2', 'list-item'),
        makeBlock('b3', 'list-item')
      ]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].type).toBe(REGION_TYPE_LIST)
    })
  })

  describe('list fallback from markers', () => {
    it('classifies region with majority bullet markers as list', () => {
      const region = makeRegion('p1-r0', { blockIds: [] })
      const lines = [
        makeLine(100, { text: '• First item' }),
        makeLine(120, { text: '• Second item' }),
        makeLine(140, { text: '• Third item' })
      ]

      const result = classifyLayoutRegions([region], lines, [])

      expect(result[0].type).toBe(REGION_TYPE_LIST)
    })

    it('classifies region with numeric markers as list', () => {
      const region = makeRegion('p1-r0', { blockIds: [] })
      const lines = [
        makeLine(100, { text: '1. First' }),
        makeLine(120, { text: '2. Second' }),
        makeLine(140, { text: '3. Third' })
      ]

      const result = classifyLayoutRegions([region], lines, [])

      expect(result[0].type).toBe(REGION_TYPE_LIST)
    })
  })

  describe('table classification from structured block', () => {
    it('classifies region with structured blocks as table', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1', 'b2'] })
      const lines = [
        makeLine(100, { items: [{ x: 40, right: 100 }, { x: 150, right: 210 }] }),
        makeLine(120, { items: [{ x: 40, right: 100 }, { x: 150, right: 210 }] })
      ]
      const blocks = [
        makeBlock('b1', 'table-region', { isStructured: true }),
        makeBlock('b2', 'table-region', { isStructured: true })
      ]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].type).toBe(REGION_TYPE_TABLE)
    })

    it('classifies region with table-cell blocks as table', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1'] })
      const lines = [makeLine(100)]
      const blocks = [makeBlock('b1', 'table-cell')]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].type).toBe(REGION_TYPE_TABLE)
    })
  })

  describe('table fallback from multi-item lines', () => {
    it('classifies region with aligned multi-item lines as table', () => {
      const region = makeRegion('p1-r0', { blockIds: [] })
      const lines = [
        makeLine(100, { items: [{ x: 40, right: 100, index: 0 }, { x: 150, right: 210, index: 1 }], width: 170 }),
        makeLine(120, { items: [{ x: 40, right: 100, index: 0 }, { x: 150, right: 210, index: 1 }], width: 170 }),
        makeLine(140, { items: [{ x: 40, right: 100, index: 0 }, { x: 150, right: 210, index: 1 }], width: 170 })
      ]

      const result = classifyLayoutRegions([region], lines, [])

      expect(result[0].type).toBe(REGION_TYPE_TABLE)
    })
  })

  describe('ambiguous region remains unknown where appropriate', () => {
    it('classifies region with mixed heading and list blocks as list (majority)', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1', 'b2', 'b3'] })
      const lines = [
        makeLine(100, { text: 'Title' }),
        makeLine(120, { text: '• Item one' }),
        makeLine(140, { text: '• Item two' })
      ]
      const blocks = [
        makeBlock('b1', 'heading'),
        makeBlock('b2', 'list-item'),
        makeBlock('b3', 'list-item')
      ]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].type).toBe(REGION_TYPE_LIST)
    })

    it('empty region with no lines and no blocks remains unknown', () => {
      const region = makeRegion('p1-r0', {
        blockIds: [],
        boundingBox: { x: 40, y: 500, width: 200, height: 50 }
      })

      const result = classifyLayoutRegions([region], [], [])

      expect(result[0].type).toBe(REGION_TYPE_UNKNOWN)
    })

    it('conflicting heading and table signals remain unknown', () => {
      const region = makeRegion('p1-r0', {
        blockIds: ['b1', 'b2'],
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Big Title', fontSize: 24, width: 60 }),
        makeLine(120, { items: [{ x: 40, right: 100, index: 0 }, { x: 150, right: 210, index: 1 }], width: 170 }),
        makeLine(140, { items: [{ x: 40, right: 100, index: 0 }, { x: 150, right: 210, index: 1 }], width: 170 })
      ]
      const blocks = [
        makeBlock('b1', 'heading'),
        makeBlock('b2', 'table-cell')
      ]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].type).toBe(REGION_TYPE_UNKNOWN)
    })

    it('conflicting list and table signals remain unknown', () => {
      const region = makeRegion('p1-r0', { blockIds: [] })
      const lines = [
        makeLine(100, { text: '• Item with table-like gaps', items: [{ x: 40, right: 100, index: 0 }, { x: 150, right: 210, index: 1 }], width: 170 }),
        makeLine(120, { text: '• Another item', items: [{ x: 40, right: 100, index: 0 }, { x: 150, right: 210, index: 1 }], width: 170 })
      ]

      const result = classifyLayoutRegions([region], lines, [])

      expect(result[0].type).toBe(REGION_TYPE_UNKNOWN)
    })

    it('ordinary text still becomes paragraph', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1'] })
      const lines = [
        makeLine(100, { text: 'This is normal paragraph text' }),
        makeLine(120, { text: 'Continuation of the paragraph' })
      ]
      const blocks = [makeBlock('b1', 'paragraph')]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].type).toBe(REGION_TYPE_PARAGRAPH)
    })
  })

  describe('RTL metadata', () => {
    it('includes rtlRatio in metadata', () => {
      const region = makeRegion('p1-r0', { blockIds: [] })
      const lines = [
        makeLine(100, { text: 'مرحبا', direction: 'rtl' }),
        makeLine(120, { text: 'عالم', direction: 'rtl' })
      ]

      const result = classifyLayoutRegions([region], lines, [])

      expect(result[0].metadata.rtlRatio).toBe(1)
    })

    it('computes correct rtlRatio for mixed directions', () => {
      const region = makeRegion('p1-r0', { blockIds: [] })
      const lines = [
        makeLine(100, { text: 'Hello', direction: 'ltr' }),
        makeLine(120, { text: 'مرحبا', direction: 'rtl' })
      ]

      const result = classifyLayoutRegions([region], lines, [])

      expect(result[0].metadata.rtlRatio).toBe(0.5)
    })
  })

  describe('possibleKpiSignal metadata', () => {
    it('sets possibleKpiSignal true for short large-font region', () => {
      const region = makeRegion('p1-r0', {
        blockIds: ['b1'],
        boundingBox: { x: 40, y: 100, width: 200, height: 50 }
      })
      const lines = [
        makeLine(100, { text: '$1.2M', fontSize: 24, width: 60 }),
        makeLine(130, { text: 'Revenue', fontSize: 12, width: 60 }),
        makeLine(400, { text: 'Body text line 1', fontSize: 12 }),
        makeLine(420, { text: 'Body text line 2', fontSize: 12 }),
        makeLine(440, { text: 'Body text line 3', fontSize: 12 })
      ]
      const blocks = [makeBlock('b1', 'paragraph')]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].metadata.possibleKpiSignal).toBe(true)
    })

    it('does not set possibleKpiSignal for long text', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1'] })
      const lines = [
        makeLine(100, { text: 'This is a long paragraph that should not trigger KPI signal', fontSize: 12 })
      ]
      const blocks = [makeBlock('b1', 'paragraph')]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].metadata.possibleKpiSignal).toBe(false)
    })

    it('possibleKpiSignal does not change type to kpi-card', () => {
      const region = makeRegion('p1-r0', {
        blockIds: ['b1'],
        boundingBox: { x: 40, y: 100, width: 200, height: 50 }
      })
      const lines = [
        makeLine(100, { text: '$1.2M', fontSize: 24, width: 60 }),
        makeLine(130, { text: 'Revenue', fontSize: 12, width: 60 }),
        makeLine(400, { text: 'Body text line 1', fontSize: 12 }),
        makeLine(420, { text: 'Body text line 2', fontSize: 12 }),
        makeLine(440, { text: 'Body text line 3', fontSize: 12 })
      ]
      const blocks = [makeBlock('b1', 'paragraph')]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].type).not.toBe('kpi-card')
      expect(result[0].metadata.possibleKpiSignal).toBe(true)
    })
  })

  describe('deterministic output', () => {
    it('produces same classification for same input', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1'] })
      const lines = [makeLine(100, { text: 'Test' })]
      const blocks = [makeBlock('b1', 'heading')]

      const result1 = classifyLayoutRegions([region], lines, blocks)
      const result2 = classifyLayoutRegions([region], lines, blocks)

      expect(result1[0].type).toBe(result2[0].type)
      expect(result1[0].metadata.dominantBlockRole).toBe(result2[0].metadata.dominantBlockRole)
    })
  })

  describe('immutability', () => {
    it('returns frozen regions array', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1'] })
      const lines = [makeLine(100)]
      const blocks = [makeBlock('b1', 'paragraph')]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result[0])).toBe(true)
      expect(Object.isFrozen(result[0].metadata)).toBe(true)
      expect(Object.isFrozen(result[0].blockIds)).toBe(true)
      expect(Object.isFrozen(result[0].childRegionIds)).toBe(true)
    })

    it('returns empty frozen array for empty input', () => {
      const result = classifyLayoutRegions([], [], [])

      expect(result).toEqual([])
      expect(Object.isFrozen(result)).toBe(true)
    })
  })

  describe('no input mutation', () => {
    it('does not mutate input regions', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1'] })
      const originalType = region.type
      const lines = [makeLine(100)]
      const blocks = [makeBlock('b1', 'heading')]

      classifyLayoutRegions([region], lines, blocks)

      expect(region.type).toBe(originalType)
    })

    it('does not mutate input metadata', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1'] })
      const originalMetadata = { ...region.metadata }
      const lines = [makeLine(100)]
      const blocks = [makeBlock('b1', 'heading')]

      classifyLayoutRegions([region], lines, blocks)

      expect(region.metadata).toEqual(originalMetadata)
    })
  })

  describe('metadata fields', () => {
    it('includes all required diagnostic metadata fields', () => {
      const region = makeRegion('p1-r0', { blockIds: ['b1'] })
      const lines = [makeLine(100)]
      const blocks = [makeBlock('b1', 'paragraph')]

      const result = classifyLayoutRegions([region], lines, blocks)

      expect(result[0].metadata).toHaveProperty('dominantBlockRole')
      expect(result[0].metadata).toHaveProperty('dominantBlockRoleRatio')
      expect(result[0].metadata).toHaveProperty('hasStructuredBlocks')
      expect(result[0].metadata).toHaveProperty('averageFontSize')
      expect(result[0].metadata).toHaveProperty('fontRatioVsPageMedian')
      expect(result[0].metadata).toHaveProperty('detectedLineCount')
      expect(result[0].metadata).toHaveProperty('blockCount')
      expect(result[0].metadata).toHaveProperty('rtlRatio')
      expect(result[0].metadata).toHaveProperty('tableSignal')
      expect(result[0].metadata).toHaveProperty('listSignal')
      expect(result[0].metadata).toHaveProperty('possibleKpiSignal')
    })

    it('preserves original metadata fields', () => {
      const region = makeRegion('p1-r0', { blockIds: [] })
      const lines = [makeLine(100)]

      const result = classifyLayoutRegions([region], lines, [])

      expect(result[0].metadata.lineCount).toBe(2)
      expect(result[0].metadata.fontSize).toBe(12)
      expect(result[0].metadata.gapThreshold).toBe(36)
    })
  })
})
