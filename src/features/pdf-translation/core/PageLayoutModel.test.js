import { describe, expect, it } from 'vitest'
import { buildPageLayoutModel, isPageLayoutModel, createEmptyPageLayoutModel, REGION_TYPE_UNKNOWN } from './PageLayoutModel.js'

describe('PageLayoutModel', () => {
  describe('buildPageLayoutModel', () => {
    it('builds a model from lines and blocks', () => {
      const lines = [
        { text: 'Hello', boundingBox: { x: 40, y: 100, width: 100, height: 14 }, fontSize: 12, items: [] },
        { text: 'World', boundingBox: { x: 40, y: 120, width: 100, height: 14 }, fontSize: 12, items: [] }
      ]
      const blocks = [
        { id: 'block-1', role: 'paragraph', text: 'Hello World', pageNumber: 1, readingOrderIndex: 0, columnIndex: 0, boundingBox: { x: 40, y: 100, width: 100, height: 34 } }
      ]

      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: { width: 500, height: 700 }, lines, blocks })

      expect(model.pageNumber).toBe(1)
      expect(model.pageSize).toEqual({ width: 500, height: 700 })
      expect(model.lines).toHaveLength(2)
      expect(model.blocks).toHaveLength(1)
      expect(model.regions).toEqual([])
      expect(model.readingOrder).toEqual(['block-1'])
      expect(model.metadata).toEqual({
        lineCount: 2,
        blockCount: 1,
        regionCount: 0,
        hasStructuredBlocks: false,
        structuredBlockCount: 0
      })
    })

    it('sorts reading order by pageNumber then readingOrderIndex then columnIndex', () => {
      const blocks = [
        { id: 'b-right', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0, columnIndex: 1 },
        { id: 'b-left', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0, columnIndex: 0 },
        { id: 'b-second', role: 'paragraph', pageNumber: 1, readingOrderIndex: 1, columnIndex: 0 }
      ]

      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines: [], blocks })

      expect(model.readingOrder).toEqual(['b-left', 'b-right', 'b-second'])
    })

    it('returns frozen (immutable) model', () => {
      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines: [], blocks: [] })

      expect(Object.isFrozen(model)).toBe(true)
      expect(Object.isFrozen(model.lines)).toBe(true)
      expect(Object.isFrozen(model.blocks)).toBe(true)
      expect(Object.isFrozen(model.regions)).toBe(true)
      expect(Object.isFrozen(model.readingOrder)).toBe(true)
    })

    it('does not mutate input arrays', () => {
      const lines = [{ text: 'A' }]
      const blocks = [{ id: 'b1' }]

      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines, blocks })

      lines.push({ text: 'B' })
      blocks.push({ id: 'b2' })

      expect(model.lines).toHaveLength(1)
      expect(model.blocks).toHaveLength(1)
    })

    it('normalizes pageSize with defaults', () => {
      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines: [], blocks: [] })

      expect(model.pageSize).toBeNull()
    })

    it('normalizes pageSize values to numbers', () => {
      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: { width: '500', height: '700' }, lines: [], blocks: [] })

      expect(model.pageSize).toEqual({ width: 500, height: 700 })
    })

    it('handles empty lines and blocks', () => {
      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: { width: 500, height: 700 }, lines: [], blocks: [] })

      expect(model.lines).toEqual([])
      expect(model.blocks).toEqual([])
      expect(model.readingOrder).toEqual([])
    })

    it('preserves block data exactly', () => {
      const block = {
        id: 'block-1',
        role: 'heading',
        text: 'Title',
        pageNumber: 1,
        readingOrderIndex: 0,
        columnIndex: 0,
        boundingBox: { x: 40, y: 50, width: 200, height: 20 },
        lines: [],
        roleMetadata: { fontSize: 16 }
      }

      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines: [], blocks: [block] })

      expect(model.blocks[0]).toEqual(block)
    })

    it('preserves line data exactly', () => {
      const line = {
        text: 'Hello world',
        boundingBox: { x: 40, y: 100, width: 150, height: 14 },
        fontSize: 12,
        direction: 'ltr',
        items: [{ text: 'Hello', x: 40, y: 100, width: 50, height: 14 }]
      }

      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines: [line], blocks: [] })

      expect(model.lines[0]).toEqual(line)
    })

    it('computes structuredBlockCount from roleMetadata.isStructured', () => {
      const blocks = [
        { id: 'b1', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0, columnIndex: 0, roleMetadata: {} },
        { id: 'b2', role: 'table-region', pageNumber: 1, readingOrderIndex: 1, columnIndex: 0, roleMetadata: { isStructured: true } },
        { id: 'b3', role: 'table-region', pageNumber: 1, readingOrderIndex: 2, columnIndex: 0, roleMetadata: { isStructured: true } }
      ]

      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines: [], blocks })

      expect(model.metadata.structuredBlockCount).toBe(2)
      expect(model.metadata.hasStructuredBlocks).toBe(true)
      expect(model.metadata.blockCount).toBe(3)
    })

    it('hasStructuredBlocks is false when no blocks are structured', () => {
      const blocks = [
        { id: 'b1', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0, columnIndex: 0, roleMetadata: {} },
        { id: 'b2', role: 'heading', pageNumber: 1, readingOrderIndex: 1, columnIndex: 0, roleMetadata: {} }
      ]

      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines: [], blocks })

      expect(model.metadata.hasStructuredBlocks).toBe(false)
      expect(model.metadata.structuredBlockCount).toBe(0)
    })

    it('metadata is frozen', () => {
      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines: [], blocks: [] })

      expect(Object.isFrozen(model.metadata)).toBe(true)
    })

    it('metadata counts match input lengths for empty model', () => {
      const model = createEmptyPageLayoutModel(1)

      expect(model.metadata.lineCount).toBe(0)
      expect(model.metadata.blockCount).toBe(0)
      expect(model.metadata.regionCount).toBe(0)
      expect(model.metadata.hasStructuredBlocks).toBe(false)
      expect(model.metadata.structuredBlockCount).toBe(0)
    })
  })

  describe('isPageLayoutModel', () => {
    it('returns true for valid model', () => {
      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines: [], blocks: [] })
      expect(isPageLayoutModel(model)).toBe(true)
    })

    it('returns true for empty model', () => {
      expect(isPageLayoutModel(createEmptyPageLayoutModel())).toBe(true)
    })

    it('returns false for null', () => {
      expect(isPageLayoutModel(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isPageLayoutModel(undefined)).toBe(false)
    })

    it('returns false for plain object missing required fields', () => {
      expect(isPageLayoutModel({})).toBe(false)
    })

    it('returns false for object with wrong types', () => {
      expect(isPageLayoutModel({ pageNumber: '1', lines: [], blocks: [], regions: [], readingOrder: [], metadata: {} })).toBe(false)
    })

    it('returns false for object missing metadata', () => {
      expect(isPageLayoutModel({ pageNumber: 1, lines: [], blocks: [], regions: [], readingOrder: [] })).toBe(false)
    })
  })

  describe('createEmptyPageLayoutModel', () => {
    it('creates empty model with given pageNumber', () => {
      const model = createEmptyPageLayoutModel(5)

      expect(model.pageNumber).toBe(5)
      expect(model.lines).toEqual([])
      expect(model.blocks).toEqual([])
      expect(model.regions).toEqual([])
      expect(model.readingOrder).toEqual([])
    })

    it('creates empty model with default pageNumber', () => {
      const model = createEmptyPageLayoutModel()

      expect(model.pageNumber).toBe(0)
    })

    it('creates empty model with pageSize', () => {
      const model = createEmptyPageLayoutModel(1, { width: 500, height: 700 })

      expect(model.pageSize).toEqual({ width: 500, height: 700 })
    })
  })

  describe('REGION_TYPE_UNKNOWN', () => {
    it('is "unknown"', () => {
      expect(REGION_TYPE_UNKNOWN).toBe('unknown')
    })
  })
})
