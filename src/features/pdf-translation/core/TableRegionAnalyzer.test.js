import { describe, expect, it } from 'vitest'
import { analyzeTableRegions } from './TableRegionAnalyzer.js'

function makeRegion(type, { id = 'p1-r0', blockIds = [], metadata = {} } = {}) {
  return {
    id,
    type,
    boundingBox: { x: 40, y: 100, width: 200, height: 60 },
    childRegionIds: [],
    blockIds,
    metadata: {
      lineCount: 2,
      fontSize: 12,
      gapThreshold: 36,
      ...metadata
    }
  }
}

describe('TableRegionAnalyzer', () => {
  describe('adds table metadata only to table regions', () => {
    it('adds table metadata to table region', () => {
      const regions = [makeRegion('table')]

      const result = analyzeTableRegions(regions, [], [])

      expect(result[0].metadata.table).toBeDefined()
      expect(result[0].metadata.table.columnCount).toBe(0)
      expect(result[0].metadata.table.rowCount).toBe(0)
      expect(result[0].metadata.table.hasMergedCells).toBe(false)
      expect(result[0].metadata.table.hasMultiLevelHeaders).toBe(false)
      expect(result[0].metadata.table.columns).toEqual([])
      expect(result[0].metadata.table.rows).toEqual([])
      expect(result[0].metadata.table.cells).toEqual([])
    })
  })

  describe('does not add table metadata to non-table regions', () => {
    it('preserves paragraph region unchanged', () => {
      const regions = [makeRegion('paragraph')]

      const result = analyzeTableRegions(regions, [], [])

      expect(result[0].metadata.table).toBeUndefined()
      expect(result[0].type).toBe('paragraph')
    })

    it('preserves heading region unchanged', () => {
      const regions = [makeRegion('heading')]

      const result = analyzeTableRegions(regions, [], [])

      expect(result[0].metadata.table).toBeUndefined()
      expect(result[0].type).toBe('heading')
    })

    it('preserves list region unchanged', () => {
      const regions = [makeRegion('list')]

      const result = analyzeTableRegions(regions, [], [])

      expect(result[0].metadata.table).toBeUndefined()
      expect(result[0].type).toBe('list')
    })

    it('preserves unknown region unchanged', () => {
      const regions = [makeRegion('unknown')]

      const result = analyzeTableRegions(regions, [], [])

      expect(result[0].metadata.table).toBeUndefined()
      expect(result[0].type).toBe('unknown')
    })
  })

  describe('preserves existing metadata', () => {
    it('keeps original metadata fields', () => {
      const regions = [makeRegion('table', {
        metadata: {
          lineCount: 5,
          fontSize: 14,
          gapThreshold: 42,
          dominantBlockRole: 'table-cell',
          hasStructuredBlocks: true
        }
      })]

      const result = analyzeTableRegions(regions, [], [])

      expect(result[0].metadata.lineCount).toBe(5)
      expect(result[0].metadata.fontSize).toBe(14)
      expect(result[0].metadata.gapThreshold).toBe(42)
      expect(result[0].metadata.dominantBlockRole).toBe('table-cell')
      expect(result[0].metadata.hasStructuredBlocks).toBe(true)
      expect(result[0].metadata.table).toBeDefined()
    })
  })

  describe('does not mutate input', () => {
    it('original regions remain unchanged', () => {
      const regions = [makeRegion('table')]
      const originalMetadata = { ...regions[0].metadata }

      analyzeTableRegions(regions, [], [])

      expect(regions[0].metadata).toEqual(originalMetadata)
      expect(regions[0].metadata.table).toBeUndefined()
    })
  })

  describe('returns frozen regions and frozen table arrays', () => {
    it('freezes regions array', () => {
      const regions = [makeRegion('table')]

      const result = analyzeTableRegions(regions, [], [])

      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result[0])).toBe(true)
      expect(Object.isFrozen(result[0].metadata)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.table)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.table.columns)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.table.rows)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.table.cells)).toBe(true)
    })

    it('freezes non-table regions', () => {
      const regions = [makeRegion('paragraph')]

      const result = analyzeTableRegions(regions, [], [])

      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result[0])).toBe(true)
    })
  })

  describe('empty input returns frozen empty array', () => {
    it('returns empty frozen array for empty regions', () => {
      const result = analyzeTableRegions([], [], [])

      expect(result).toEqual([])
      expect(Object.isFrozen(result)).toBe(true)
    })

    it('returns empty frozen array for no arguments', () => {
      const result = analyzeTableRegions()

      expect(result).toEqual([])
      expect(Object.isFrozen(result)).toBe(true)
    })
  })

  describe('mixed region types', () => {
    it('enriches only table regions in mixed array', () => {
      const regions = [
        makeRegion('paragraph', { id: 'p1-r0' }),
        makeRegion('table', { id: 'p1-r1' }),
        makeRegion('heading', { id: 'p1-r2' }),
        makeRegion('table', { id: 'p1-r3' })
      ]

      const result = analyzeTableRegions(regions, [], [])

      expect(result).toHaveLength(4)
      expect(result[0].metadata.table).toBeUndefined()
      expect(result[1].metadata.table).toBeDefined()
      expect(result[2].metadata.table).toBeUndefined()
      expect(result[3].metadata.table).toBeDefined()
    })
  })

  describe('table metadata structure', () => {
    it('has correct field types', () => {
      const regions = [makeRegion('table')]

      const result = analyzeTableRegions(regions, [], [])

      const table = result[0].metadata.table
      expect(typeof table.columnCount).toBe('number')
      expect(typeof table.rowCount).toBe('number')
      expect(typeof table.hasMergedCells).toBe('boolean')
      expect(typeof table.hasMultiLevelHeaders).toBe('boolean')
      expect(Array.isArray(table.columns)).toBe(true)
      expect(Array.isArray(table.rows)).toBe(true)
      expect(Array.isArray(table.cells)).toBe(true)
    })
  })
})
