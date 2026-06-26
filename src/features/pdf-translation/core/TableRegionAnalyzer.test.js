import { describe, expect, it } from 'vitest'
import { analyzeTableRegions } from './TableRegionAnalyzer.js'

function makeRegion(type, { id = 'p1-r0', blockIds = [], boundingBox = { x: 40, y: 100, width: 300, height: 100 }, metadata = {} } = {}) {
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
      ...metadata
    }
  }
}

function makeLine(y, { regionId = null, items = [], fontSize = 12, direction = 'ltr', x = 40, width = 200 } = {}) {
  return {
    text: items.map((i) => i.text).join(' '),
    boundingBox: { x, y, width, height: fontSize },
    fontSize,
    direction,
    items,
    regionId
  }
}

function makeItem(text, x, width = 60) {
  return {
    text,
    x,
    right: x + width,
    width,
    height: 12,
    fontSize: 12
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

  describe('column detection', () => {
    it('detects 2-column table', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40), makeItem('Value', 180)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Age', 40), makeItem('25', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.columnCount).toBe(2)
      expect(result[0].metadata.table.columns).toHaveLength(2)
      expect(result[0].metadata.table.columns[0].x).toBe(40)
      expect(result[0].metadata.table.columns[1].x).toBe(180)
    })

    it('detects 3-column table', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40), makeItem('Age', 160), makeItem('City', 280)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40), makeItem('30', 160), makeItem('NYC', 280)]
        }),
        makeLine(140, {
          regionId: 'p1-r0',
          items: [makeItem('Bob', 40), makeItem('25', 160), makeItem('LA', 280)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.columnCount).toBe(3)
      expect(result[0].metadata.table.columns).toHaveLength(3)
    })

    it('detects columns from irregular rows with missing cells', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40), makeItem('Age', 160), makeItem('City', 280)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40), makeItem('NYC', 280)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.columnCount).toBe(3)
      expect(result[0].metadata.table.columns).toHaveLength(3)
    })

    it('detects columns from merged header', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Personal Info', 40, 120)]
        }),
        makeLine(130, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40), makeItem('Age', 180)]
        }),
        makeLine(150, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40), makeItem('30', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.columnCount).toBe(2)
      expect(result[0].metadata.table.columns).toHaveLength(2)
    })

    it('falls back to empty columns when all items same x', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Line 1', 40), makeItem('text', 40)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Line 2', 40), makeItem('text', 40)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.columnCount).toBe(0)
      expect(result[0].metadata.table.columns).toEqual([])
    })

    it('falls back to empty columns for single-line table', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 200, height: 30 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40), makeItem('Value', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.columnCount).toBe(0)
      expect(result[0].metadata.table.columns).toEqual([])
    })

    it('RTL table detects visual columns left-to-right', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          direction: 'rtl',
          items: [makeItem('שם', 40), makeItem('ערך', 180)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          direction: 'rtl',
          items: [makeItem('Alice', 40), makeItem('30', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.columnCount).toBe(2)
      expect(result[0].metadata.table.columns[0].x).toBe(40)
      expect(result[0].metadata.table.columns[1].x).toBe(180)
    })

    it('numeric column align becomes right', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40), makeItem('123', 180)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Age', 40), makeItem('456', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.columns[1].align).toBe('right')
    })

    it('non-numeric column align becomes left', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40), makeItem('Alice', 180)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Age', 40), makeItem('Bob', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.columns[1].align).toBe('left')
    })

    it('non-table regions are unchanged', () => {
      const region = makeRegion('paragraph')
      const lines = [
        makeLine(100, {
          items: [makeItem('Text', 40), makeItem('here', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table).toBeUndefined()
    })
  })
})
