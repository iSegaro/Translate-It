import { describe, expect, it } from 'vitest'
import {
  buildPdfLogicalBlocksFromLines
} from './PdfLayoutAnalyzer.js'
import { detectLayoutRegions, assignRegionIdsToLines } from './LayoutRegionDetector.js'

function makeLine(y, { fontSize = 12, text = 'line', direction = 'ltr', items = [], width = 200, x = 40 } = {}) {
  return {
    text,
    boundingBox: { x, y, width, height: fontSize },
    fontSize,
    direction,
    items,
    roleMetadata: { direction, fontSize, itemCount: items.length || 1 }
  }
}

describe('Phase L4a — Region Boundary Guard', () => {
  describe('assignRegionIdsToLines', () => {
    it('assigns regionId to lines within region bounds', () => {
      const lines = [
        makeLine(100, { text: 'Line 1' }),
        makeLine(120, { text: 'Line 2' }),
        makeLine(400, { text: 'Line 3' })
      ]
      const regions = [
        { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 200, height: 40 } },
        { id: 'p1-r1', boundingBox: { x: 40, y: 390, width: 200, height: 30 } }
      ]

      const result = assignRegionIdsToLines(lines, regions)

      expect(result[0].regionId).toBe('p1-r0')
      expect(result[1].regionId).toBe('p1-r0')
      expect(result[2].regionId).toBe('p1-r1')
    })

    it('assigns null to lines outside all regions', () => {
      const lines = [makeLine(250, { text: 'Gap line' })]
      const regions = [
        { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 200, height: 40 } }
      ]

      const result = assignRegionIdsToLines(lines, regions)

      expect(result[0].regionId).toBeNull()
    })

    it('returns lines with null regionId when no regions', () => {
      const lines = [makeLine(100)]

      const result = assignRegionIdsToLines(lines, [])

      expect(result[0].regionId).toBeNull()
    })

    it('returns empty array for empty lines', () => {
      const result = assignRegionIdsToLines([], [{ id: 'p1-r0', boundingBox: { x: 0, y: 0, width: 100, height: 100 } }])
      expect(result).toEqual([])
    })
  })

  describe('same region merge behaves exactly as before', () => {
    it('merges consecutive lines in same region into one block', () => {
      const lines = [
        makeLine(100, { text: 'First line of paragraph' }),
        makeLine(120, { text: 'Second line of paragraph' }),
        makeLine(140, { text: 'Third line of paragraph' })
      ]
      const regions = detectLayoutRegions(lines, 1)

      const blocks = buildPdfLogicalBlocksFromLines(lines, { regions })

      expect(blocks).toHaveLength(1)
      expect(blocks[0].text).toBe('First line of paragraph Second line of paragraph Third line of paragraph')
      expect(blocks[0].roleMetadata.regionId).toBe(regions[0].id)
    })
  })

  describe('different region prevents paragraph merge', () => {
    it('splits paragraph when lines are in different regions', () => {
      const lines = [
        makeLine(100, { text: 'Region 1 line' }),
        makeLine(400, { text: 'Region 2 line' })
      ]
      const regions = detectLayoutRegions(lines, 1)

      expect(regions).toHaveLength(2)

      const blocks = buildPdfLogicalBlocksFromLines(lines, { regions })

      expect(blocks).toHaveLength(2)
      expect(blocks[0].text).toBe('Region 1 line')
      expect(blocks[1].text).toBe('Region 2 line')
      expect(blocks[0].roleMetadata.regionId).toBe(regions[0].id)
      expect(blocks[1].roleMetadata.regionId).toBe(regions[1].id)
    })

    it('does not merge across region boundary even with small gap', () => {
      const lines = [
        makeLine(100, { text: 'End of region 1' }),
        makeLine(120, { text: 'Start of region 2' })
      ]

      const regions = [
        { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 200, height: 25 } },
        { id: 'p1-r1', boundingBox: { x: 40, y: 120, width: 200, height: 25 } }
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { regions })

      expect(blocks).toHaveLength(2)
      expect(blocks[0].roleMetadata.regionId).toBe('p1-r0')
      expect(blocks[1].roleMetadata.regionId).toBe('p1-r1')
    })
  })

  describe('missing region falls back to old behavior', () => {
    it('merges lines when no regions provided', () => {
      const lines = [
        makeLine(100, { text: 'Line 1' }),
        makeLine(120, { text: 'Line 2' })
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, {})

      expect(blocks).toHaveLength(1)
      expect(blocks[0].text).toBe('Line 1 Line 2')
      expect(blocks[0].roleMetadata.regionId).toBeNull()
    })

    it('merges lines when regions array is empty', () => {
      const lines = [
        makeLine(100, { text: 'Line 1' }),
        makeLine(120, { text: 'Line 2' })
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, { regions: [] })

      expect(blocks).toHaveLength(1)
      expect(blocks[0].text).toBe('Line 1 Line 2')
    })

    it('merges lines when line has null regionId', () => {
      const lines = [
        makeLine(100, { text: 'Line 1', regionId: null }),
        makeLine(120, { text: 'Line 2', regionId: null })
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, {})

      expect(blocks).toHaveLength(1)
      expect(blocks[0].text).toBe('Line 1 Line 2')
    })
  })

  describe('headings/lists/tables still behave as before', () => {
    it('heading lines still start new blocks', () => {
      const lines = [
        makeLine(100, { text: 'Section Title', fontSize: 24 }),
        makeLine(130, { text: 'Body text after heading' })
      ]
      const regions = detectLayoutRegions(lines, 1)

      const blocks = buildPdfLogicalBlocksFromLines(lines, { regions })

      expect(blocks).toHaveLength(2)
      expect(blocks[0].role).toBe('heading')
      expect(blocks[1].role).toBe('paragraph')
    })

    it('list items still start new blocks', () => {
      const lines = [
        makeLine(100, { text: '• First item' }),
        makeLine(120, { text: '• Second item' })
      ]
      const regions = detectLayoutRegions(lines, 1)

      const blocks = buildPdfLogicalBlocksFromLines(lines, { regions })

      expect(blocks).toHaveLength(2)
      expect(blocks[0].role).toBe('list-item')
      expect(blocks[1].role).toBe('list-item')
    })

    it('table cells still merge within table', () => {
      const lines = [
        makeLine(100, {
          text: 'Name Value',
          items: [
            { x: 40, right: 100, index: 0, text: 'Name', fontSize: 12 },
            { x: 150, right: 210, index: 1, text: 'Value', fontSize: 12 }
          ],
          width: 170
        }),
        makeLine(120, {
          text: 'Age 25',
          items: [
            { x: 40, right: 100, index: 0, text: 'Age', fontSize: 12 },
            { x: 150, right: 210, index: 1, text: '25', fontSize: 12 }
          ],
          width: 170
        })
      ]
      const regions = detectLayoutRegions(lines, 1)

      const blocks = buildPdfLogicalBlocksFromLines(lines, { regions })

      expect(blocks).toHaveLength(1)
      expect(blocks[0].role).toBe('table-region')
      expect(blocks[0].roleMetadata.isStructured).toBe(true)
    })
  })

  describe('regionId propagation', () => {
    it('propagates regionId to block metadata', () => {
      const lines = [
        makeLine(100, { text: 'Paragraph text' }),
        makeLine(120, { text: 'Continuation' })
      ]
      const regions = detectLayoutRegions(lines, 1)

      const blocks = buildPdfLogicalBlocksFromLines(lines, { regions })

      expect(blocks[0].regionId).toBe(regions[0].id)
      expect(blocks[0].roleMetadata.regionId).toBe(regions[0].id)
    })

    it('propagates regionId to multi-line block', () => {
      const lines = [
        makeLine(100, { text: 'Line 1' }),
        makeLine(120, { text: 'Line 2' }),
        makeLine(140, { text: 'Line 3' })
      ]
      const regions = detectLayoutRegions(lines, 1)

      const blocks = buildPdfLogicalBlocksFromLines(lines, { regions })

      expect(blocks).toHaveLength(1)
      expect(blocks[0].regionId).toBe(regions[0].id)
      expect(blocks[0].lines).toHaveLength(3)
    })
  })

  describe('column boundary still prevents merge', () => {
    it('does not merge lines in different columns', () => {
      const lines = [
        makeLine(100, { text: 'Left column 1', x: 40 }),
        makeLine(120, { text: 'Left column 2', x: 40 }),
        makeLine(100, { text: 'Right column 1', x: 300 }),
        makeLine(120, { text: 'Right column 2', x: 300 })
      ]

      const blocks = buildPdfLogicalBlocksFromLines(lines, {
        pageSize: { width: 500, height: 700 }
      })

      expect(blocks).toHaveLength(2)
      expect(blocks[0].text).toContain('Left column')
      expect(blocks[1].text).toContain('Right column')
    })
  })
})
