import { describe, expect, it } from 'vitest'
import { buildPageLayoutModel, isPageLayoutModel, createEmptyPageLayoutModel, REGION_TYPE_UNKNOWN } from './PageLayoutModel.js'
import { createEmptyStructuredLayoutModel } from './StructuredLayoutModel.js'

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
      expect(model.regions).toHaveLength(1)
      expect(model.regions[0].type).toBe('paragraph')
      expect(model.regions[0].id).toBe('p1-r0')
      expect(model.regions[0].blockIds).toEqual(['block-1'])
      expect(model.readingOrder).toEqual(['block-1'])
      expect(model.metadata.lineCount).toBe(2)
      expect(model.metadata.blockCount).toBe(1)
      expect(model.metadata.regionCount).toBe(1)
      expect(model.metadata.hasStructuredBlocks).toBe(false)
      expect(model.metadata.structuredBlockCount).toBe(0)
      expect(model.metadata.structured.pageNumber).toBe(1)
      expect(model.metadata.structured.pageSize).toEqual({ width: 500, height: 700 })
      expect(model.metadata.structured.summary).toMatchObject({
        regionCount: 1,
        structuredRegionCount: 0,
        fallbackRegionCount: 1,
        hasStructuredContent: false
      })
      expect(model.metadata.structured.regions).toHaveLength(1)
      expect(model.metadata.structured.regions[0].kind).toBe('unknown')
    })

    it('exposes canonical structured metadata while preserving metadata.table', () => {
      const lines = [
        { text: 'Name', boundingBox: { x: 40, y: 100, width: 80, height: 20 }, fontSize: 12, items: [] },
        { text: 'Personal Info', boundingBox: { x: 160, y: 100, width: 140, height: 20 }, fontSize: 12, items: [] }
      ]
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

      const region = {
        id: 'p1-r0',
        type: 'table',
        boundingBox: { x: 40, y: 100, width: 240, height: 44 },
        childRegionIds: [],
        blockIds: ['block-1'],
        metadata: {
          lineCount: 2,
          table
        }
      }

      const model = buildPageLayoutModel({
        pageNumber: 1,
        pageSize: { width: 500, height: 700 },
        lines,
        blocks: [
          { id: 'block-1', role: 'table-region', pageNumber: 1, readingOrderIndex: 0, columnIndex: 0, roleMetadata: { isStructured: true } }
        ],
        regions: [region]
      })

      const structuredRegion = model.metadata.structured.regions[0]
      const tableMetadata = model.regions[0].metadata.table

      expect(structuredRegion.kind).toBe('table')
      expect(structuredRegion.rows).toHaveLength(tableMetadata.rows.length)
      expect(structuredRegion.columns).toHaveLength(tableMetadata.columns.length)
      expect(structuredRegion.cells).toHaveLength(tableMetadata.cells.length)
      expect(structuredRegion.grid.dimensions).toEqual({
        rowCount: tableMetadata.rows.length,
        columnCount: tableMetadata.columns.length
      })
      expect(structuredRegion.compatibility.table).toBe(tableMetadata)
      expect(model.regions[0].metadata.table).toBe(tableMetadata)
      if (tableMetadata.grid?.occupancy?.length > 0 && tableMetadata.grid.occupancy[0]?.[1]) {
        expect(structuredRegion.grid.occupancy[0][1].colSpan).toBe(tableMetadata.grid.occupancy[0][1].colSpan)
      }
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

    it('regions contain frozen region objects', () => {
      const lines = [
        { text: 'A', boundingBox: { x: 40, y: 100, width: 100, height: 14 }, fontSize: 12, items: [] }
      ]

      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines, blocks: [] })

      expect(model.regions).toHaveLength(1)
      expect(Object.isFrozen(model.regions[0])).toBe(true)
      expect(Object.isFrozen(model.regions[0].blockIds)).toBe(true)
      expect(Object.isFrozen(model.regions[0].childRegionIds)).toBe(true)
      expect(Object.isFrozen(model.regions[0].metadata)).toBe(true)
    })

    it('does not mutate input arrays', () => {
      const lines = [{ text: 'A', boundingBox: { x: 40, y: 100, width: 100, height: 14 }, fontSize: 12, items: [] }]
      const blocks = [{ id: 'b1', pageNumber: 1, readingOrderIndex: 0, columnIndex: 0, boundingBox: { x: 40, y: 100, width: 100, height: 14 } }]

      const model = buildPageLayoutModel({ pageNumber: 1, pageSize: null, lines, blocks })

      lines.push({ text: 'B', boundingBox: { x: 40, y: 200, width: 100, height: 14 }, fontSize: 12, items: [] })
      blocks.push({ id: 'b2', pageNumber: 1, readingOrderIndex: 1, columnIndex: 0, boundingBox: { x: 40, y: 200, width: 100, height: 14 } })

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
      expect(model.regions).toEqual([])
      expect(model.readingOrder).toEqual([])
      expect(model.metadata.regionCount).toBe(0)
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
      expect(model.metadata.structured).toEqual(createEmptyStructuredLayoutModel(1))
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

    it('returns false for object with invalid structured metadata', () => {
      expect(isPageLayoutModel({
        pageNumber: 1,
        lines: [],
        blocks: [],
        regions: [],
        readingOrder: [],
        metadata: {
          lineCount: 0,
          blockCount: 0,
          regionCount: 0,
          hasStructuredBlocks: false,
          structuredBlockCount: 0,
          structured: {}
        }
      })).toBe(false)
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
      expect(model.metadata.regionCount).toBe(0)
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
