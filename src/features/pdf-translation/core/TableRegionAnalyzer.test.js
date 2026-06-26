import { describe, expect, it } from 'vitest'
import { analyzeTableRegions, enrichBlocksWithTableMetadata } from './TableRegionAnalyzer.js'

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

  describe('row detection', () => {
    it('detects 2-row table', () => {
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
          items: [makeItem('Alice', 40), makeItem('30', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.rowCount).toBe(2)
      expect(result[0].metadata.table.rows).toHaveLength(2)
      expect(result[0].metadata.table.rows[0].y).toBe(100)
      expect(result[0].metadata.table.rows[1].y).toBe(120)
    })

    it('detects 3-row table', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40), makeItem('Age', 160)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40), makeItem('30', 160)]
        }),
        makeLine(140, {
          regionId: 'p1-r0',
          items: [makeItem('Bob', 40), makeItem('25', 160)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.rowCount).toBe(3)
      expect(result[0].metadata.table.rows).toHaveLength(3)
    })

    it('handles irregular row heights', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          fontSize: 14,
          items: [makeItem('Header', 40)]
        }),
        makeLine(130, {
          regionId: 'p1-r0',
          fontSize: 12,
          items: [makeItem('Data', 40)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.rowCount).toBe(2)
      expect(result[0].metadata.table.rows[0].height).toBe(14)
      expect(result[0].metadata.table.rows[1].height).toBe(12)
    })

    it('close but non-overlapping lines remain separate rows', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 50 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40)]
        }),
        makeLine(115, {
          regionId: 'p1-r0',
          items: [makeItem('B', 40)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.rowCount).toBe(2)
      expect(result[0].metadata.table.rows[0].lineIndices).toEqual([0])
      expect(result[0].metadata.table.rows[1].lineIndices).toEqual([1])
    })

    it('falls back to empty rows for single-line table', () => {
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

      expect(result[0].metadata.table.rowCount).toBe(0)
      expect(result[0].metadata.table.rows).toEqual([])
    })

    it('falls back to empty rows when all lines same y', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 200, height: 30 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40), makeItem('B', 180)]
        }),
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40), makeItem('D', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.rowCount).toBe(0)
      expect(result[0].metadata.table.rows).toEqual([])
    })

    it('falls back to empty rows for empty region', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })

      const result = analyzeTableRegions([region], [], [])

      expect(result[0].metadata.table.rowCount).toBe(0)
      expect(result[0].metadata.table.rows).toEqual([])
    })

    it('rows and columns both present', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40), makeItem('Age', 180)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40), makeItem('30', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.columnCount).toBe(2)
      expect(result[0].metadata.table.rowCount).toBe(2)
      expect(result[0].metadata.table.columns).toHaveLength(2)
      expect(result[0].metadata.table.rows).toHaveLength(2)
    })

    it('non-table regions are unchanged for rows', () => {
      const region = makeRegion('paragraph')
      const lines = [
        makeLine(100, {
          items: [makeItem('Text', 40)]
        }),
        makeLine(120, {
          items: [makeItem('More', 40)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table).toBeUndefined()
    })

    it('row objects are frozen', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40), makeItem('B', 180)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40), makeItem('D', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(Object.isFrozen(result[0].metadata.table.rows)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.table.rows[0])).toBe(true)
      expect(Object.isFrozen(result[0].metadata.table.rows[0].lineIndices)).toBe(true)
    })

    it('rows have correct structure', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('B', 40)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      const row = result[0].metadata.table.rows[0]
      expect(typeof row.index).toBe('number')
      expect(typeof row.y).toBe('number')
      expect(typeof row.height).toBe('number')
      expect(Array.isArray(row.lineIndices)).toBe(true)
      expect(typeof row.lineCount).toBe('number')
    })

    it('row.index is visual order, row.lineIndices is original input index', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 80 }
      })
      const lines = [
        makeLine(999, { items: [makeItem('skip', 40)] }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Second', 40)]
        }),
        makeLine(999, { items: [makeItem('skip', 40)] }),
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('First', 40)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.rowCount).toBe(2)
      expect(result[0].metadata.table.rows[0].index).toBe(0)
      expect(result[0].metadata.table.rows[0].lineIndices).toEqual([3])
      expect(result[0].metadata.table.rows[1].index).toBe(1)
      expect(result[0].metadata.table.rows[1].lineIndices).toEqual([1])
    })
  })

  describe('cell mapping', () => {
    it('maps 2x2 table correctly', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40), makeItem('Age', 180)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40), makeItem('30', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.cells).toHaveLength(4)
      expect(result[0].metadata.table.cells[0].rowIndex).toBe(0)
      expect(result[0].metadata.table.cells[0].columnIndex).toBe(0)
      expect(result[0].metadata.table.cells[0].text).toBe('Name')
      expect(result[0].metadata.table.cells[1].rowIndex).toBe(0)
      expect(result[0].metadata.table.cells[1].columnIndex).toBe(1)
      expect(result[0].metadata.table.cells[1].text).toBe('Age')
      expect(result[0].metadata.table.cells[2].rowIndex).toBe(1)
      expect(result[0].metadata.table.cells[2].columnIndex).toBe(0)
      expect(result[0].metadata.table.cells[2].text).toBe('Alice')
      expect(result[0].metadata.table.cells[3].rowIndex).toBe(1)
      expect(result[0].metadata.table.cells[3].columnIndex).toBe(1)
      expect(result[0].metadata.table.cells[3].text).toBe('30')
    })

    it('maps 3-column table correctly', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 80 }
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

      expect(result[0].metadata.table.cells).toHaveLength(9)
    })

    it('omits missing cells in irregular rows', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40), makeItem('Age', 180)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.cells).toHaveLength(3)
    })

    it('maps incomplete row without creating extra columns', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40, 60), makeItem('Age', 180, 60)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40, 60), makeItem('30', 180, 60)]
        }),
        makeLine(140, {
          regionId: 'p1-r0',
          items: [makeItem('Bob', 40, 60), makeItem('25', 180, 60)]
        }),
        makeLine(160, {
          regionId: 'p1-r0',
          items: [makeItem('Charlie', 40, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.columnCount).toBe(2)
      expect(result[0].metadata.table.cells).toHaveLength(7)
      expect(result[0].metadata.table.cells.filter((c) => c.rowIndex === 3)).toHaveLength(1)
      expect(result[0].metadata.table.cells.filter((c) => c.rowIndex === 3)[0].columnIndex).toBe(0)
    })

    it('sets spanCandidate true for wide items', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('X', 40, 40), makeItem('Y', 200, 40), makeItem('Z', 360, 40)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Wide', 40, 150), makeItem('B', 200, 40), makeItem('D', 360, 40)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      const wideCell = result[0].metadata.table.cells.find((c) => c.text === 'Wide')
      expect(wideCell).toBeDefined()
      expect(wideCell.spanCandidate).toBe(true)
    })

    it('sets spanCandidate false for normal items', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40, 60), makeItem('Age', 180, 60)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40, 60), makeItem('30', 180, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.cells.every((c) => c.spanCandidate === false)).toBe(true)
    })

    it('RTL table maps by x-position', () => {
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

      expect(result[0].metadata.table.cells).toHaveLength(4)
      expect(result[0].metadata.table.cells[0].columnIndex).toBe(0)
      expect(result[0].metadata.table.cells[1].columnIndex).toBe(1)
    })

    it('falls back to empty cells for empty columns', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('B', 40)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.cells).toEqual([])
    })

    it('falls back to empty cells for empty rows', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 200, height: 30 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40), makeItem('B', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.cells).toEqual([])
    })

    it('non-table regions have no cells', () => {
      const region = makeRegion('paragraph')
      const lines = [
        makeLine(100, {
          items: [makeItem('Text', 40)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table).toBeUndefined()
    })

    it('cell objects are frozen', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40), makeItem('B', 180)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40), makeItem('D', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(Object.isFrozen(result[0].metadata.table.cells)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.table.cells[0])).toBe(true)
      expect(Object.isFrozen(result[0].metadata.table.cells[0].boundingBox)).toBe(true)
    })

    it('cell has correct structure', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40), makeItem('B', 180)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40), makeItem('D', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      const cell = result[0].metadata.table.cells[0]
      expect(typeof cell.rowIndex).toBe('number')
      expect(typeof cell.columnIndex).toBe('number')
      expect(typeof cell.text).toBe('string')
      expect(typeof cell.boundingBox).toBe('object')
      expect(typeof cell.sourceLineIndex).toBe('number')
      expect(typeof cell.sourceItemIndex).toBe('number')
      expect(typeof cell.spanCandidate).toBe('boolean')
      expect(typeof cell.colSpanCandidate).toBe('boolean')
      expect(typeof cell.estimatedColSpan).toBe('number')
    })
  })

  describe('colSpan candidate detection', () => {
    it('normal cells have colSpanCandidate false and estimatedColSpan 1', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40, 60), makeItem('Age', 180, 60)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40, 60), makeItem('30', 180, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.cells.every((c) => c.colSpanCandidate === false)).toBe(true)
      expect(result[0].metadata.table.cells.every((c) => c.estimatedColSpan === 1)).toBe(true)
    })

    it('wide header crossing next column with missing neighbor sets colSpanCandidate true', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Personal Info', 40, 180)]
        }),
        makeLine(130, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40, 60), makeItem('Age', 200, 60)]
        }),
        makeLine(150, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40, 60), makeItem('30', 200, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      const headerCell = result[0].metadata.table.cells.find((c) => c.text === 'Personal Info')
      expect(headerCell).toBeDefined()
      expect(headerCell.colSpanCandidate).toBe(true)
      expect(headerCell.estimatedColSpan).toBe(2)
      expect(result[0].metadata.table.hasSpanCandidates).toBe(true)
    })

    it('wide cell with neighbor present sets colSpanCandidate false', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Wide', 40, 180), makeItem('Neighbor', 200, 60)]
        }),
        makeLine(130, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40, 60), makeItem('B', 200, 60)]
        }),
        makeLine(150, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40, 60), makeItem('D', 200, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      const wideCell = result[0].metadata.table.cells.find((c) => c.text === 'Wide')
      expect(wideCell).toBeDefined()
      expect(wideCell.colSpanCandidate).toBe(false)
      expect(result[0].metadata.table.hasSpanCandidates).toBe(false)
    })

    it('wide cell not crossing next column sets colSpanCandidate false', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Wide', 40, 120), makeItem('B', 200, 60)]
        }),
        makeLine(130, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40, 60), makeItem('B', 200, 60)]
        }),
        makeLine(150, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40, 60), makeItem('D', 200, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      const wideCell = result[0].metadata.table.cells.find((c) => c.text === 'Wide')
      expect(wideCell).toBeDefined()
      expect(wideCell.colSpanCandidate).toBe(false)
    })

    it('missing neighbor but normal width sets colSpanCandidate false', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40, 60), makeItem('B', 200, 60)]
        }),
        makeLine(130, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40, 60)]
        }),
        makeLine(150, {
          regionId: 'p1-r0',
          items: [makeItem('E', 40, 60), makeItem('F', 200, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      const cellC = result[0].metadata.table.cells.find((c) => c.text === 'C')
      expect(cellC).toBeDefined()
      expect(cellC.colSpanCandidate).toBe(false)
    })

    it('RTL table uses same x-based visual column logic', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          direction: 'rtl',
          items: [makeItem('כותרת רחבה', 40, 180)]
        }),
        makeLine(130, {
          regionId: 'p1-r0',
          direction: 'rtl',
          items: [makeItem('שם', 40, 60), makeItem('גיל', 200, 60)]
        }),
        makeLine(150, {
          regionId: 'p1-r0',
          direction: 'rtl',
          items: [makeItem('Alice', 40, 60), makeItem('30', 200, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      const headerCell = result[0].metadata.table.cells.find((c) => c.text === 'כותרת רחבה')
      expect(headerCell).toBeDefined()
      expect(headerCell.colSpanCandidate).toBe(true)
      expect(headerCell.estimatedColSpan).toBe(2)
    })

    it('table.hasSpanCandidates true only when candidate exists', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40, 60), makeItem('B', 180, 60)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40, 60), makeItem('D', 180, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.hasSpanCandidates).toBe(false)
    })

    it('table.hasMergedCells remains false', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Header', 40, 180)]
        }),
        makeLine(130, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40, 60), makeItem('B', 200, 60)]
        }),
        makeLine(150, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40, 60), makeItem('D', 200, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.hasMergedCells).toBe(false)
    })

    it('colSpanCandidate and estimatedColSpan are frozen', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Header', 40, 180)]
        }),
        makeLine(130, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40, 60), makeItem('B', 200, 60)]
        }),
        makeLine(150, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40, 60), makeItem('D', 200, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(Object.isFrozen(result[0].metadata.table.cells)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.table.cells[0])).toBe(true)
    })

    it('cell has cellId field', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40), makeItem('B', 180)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40), makeItem('D', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])

      expect(result[0].metadata.table.cells[0].cellId).toBe('p1-r0-r0-c0-i0')
      expect(result[0].metadata.table.cells[1].cellId).toBe('p1-r0-r0-c1-i1')
      expect(result[0].metadata.table.cells[2].cellId).toBe('p1-r0-r1-c0-i0')
      expect(result[0].metadata.table.cells[3].cellId).toBe('p1-r0-r1-c1-i1')
    })
  })

  describe('fixture: simple 2x2 table', () => {
    it('produces stable metadata', () => {
      const region = makeRegion('table', {
        id: 'p1-r0',
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40, 60), makeItem('Age', 180, 60)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40, 60), makeItem('30', 180, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])
      const table = result[0].metadata.table

      expect(table.columnCount).toBe(2)
      expect(table.rowCount).toBe(2)
      expect(table.cells).toHaveLength(4)
      expect(table.hasSpanCandidates).toBe(false)
      expect(table.hasMergedCells).toBe(false)

      const cellIds = table.cells.map((c) => c.cellId)
      expect(cellIds).toEqual([
        'p1-r0-r0-c0-i0',
        'p1-r0-r0-c1-i1',
        'p1-r0-r1-c0-i0',
        'p1-r0-r1-c1-i1'
      ])
    })
  })

  describe('fixture: 3-column table', () => {
    it('produces stable metadata', () => {
      const region = makeRegion('table', {
        id: 'p1-r0',
        boundingBox: { x: 40, y: 100, width: 400, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40, 60), makeItem('Age', 160, 60), makeItem('City', 280, 60)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40, 60), makeItem('30', 160, 60), makeItem('NYC', 280, 60)]
        }),
        makeLine(140, {
          regionId: 'p1-r0',
          items: [makeItem('Bob', 40, 60), makeItem('25', 160, 60), makeItem('LA', 280, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])
      const table = result[0].metadata.table

      expect(table.columnCount).toBe(3)
      expect(table.rowCount).toBe(3)
      expect(table.cells).toHaveLength(9)
      expect(table.hasSpanCandidates).toBe(false)
      expect(table.hasMergedCells).toBe(false)
    })
  })

  describe('fixture: irregular row with missing cells', () => {
    it('produces stable metadata', () => {
      const region = makeRegion('table', {
        id: 'p1-r0',
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40, 60), makeItem('Age', 180, 60)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])
      const table = result[0].metadata.table

      expect(table.columnCount).toBe(2)
      expect(table.rowCount).toBe(2)
      expect(table.cells).toHaveLength(3)
      expect(table.hasSpanCandidates).toBe(false)
      expect(table.hasMergedCells).toBe(false)
    })
  })

  describe('fixture: merged-header candidate', () => {
    it('produces stable metadata', () => {
      const region = makeRegion('table', {
        id: 'p1-r0',
        boundingBox: { x: 40, y: 100, width: 400, height: 80 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Personal Info', 40, 180)]
        }),
        makeLine(130, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40, 60), makeItem('Age', 200, 60)]
        }),
        makeLine(150, {
          regionId: 'p1-r0',
          items: [makeItem('Alice', 40, 60), makeItem('30', 200, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])
      const table = result[0].metadata.table

      expect(table.columnCount).toBe(2)
      expect(table.rowCount).toBe(3)
      expect(table.cells).toHaveLength(5)
      expect(table.hasSpanCandidates).toBe(true)
      expect(table.hasMergedCells).toBe(false)

      const headerCell = table.cells.find((c) => c.text === 'Personal Info')
      expect(headerCell.colSpanCandidate).toBe(true)
      expect(headerCell.estimatedColSpan).toBe(2)
    })
  })

  describe('fixture: RTL table', () => {
    it('produces stable metadata', () => {
      const region = makeRegion('table', {
        id: 'p1-r0',
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          direction: 'rtl',
          items: [makeItem('שם', 40, 60), makeItem('ערך', 180, 60)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          direction: 'rtl',
          items: [makeItem('Alice', 40, 60), makeItem('30', 180, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])
      const table = result[0].metadata.table

      expect(table.columnCount).toBe(2)
      expect(table.rowCount).toBe(2)
      expect(table.cells).toHaveLength(4)
      expect(table.hasSpanCandidates).toBe(false)
      expect(table.hasMergedCells).toBe(false)
    })
  })

  describe('fixture: numeric column alignment', () => {
    it('produces stable metadata', () => {
      const region = makeRegion('table', {
        id: 'p1-r0',
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('Name', 40, 60), makeItem('123', 180, 60)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('Age', 40, 60), makeItem('456', 180, 60)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])
      const table = result[0].metadata.table

      expect(table.columnCount).toBe(2)
      expect(table.rowCount).toBe(2)
      expect(table.cells).toHaveLength(4)
      expect(table.columns[1].align).toBe('right')
      expect(table.hasMergedCells).toBe(false)
    })
  })

  describe('fixture: single-line fallback', () => {
    it('produces stable metadata', () => {
      const region = makeRegion('table', {
        id: 'p1-r0',
        boundingBox: { x: 40, y: 100, width: 200, height: 30 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40), makeItem('B', 180)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])
      const table = result[0].metadata.table

      expect(table.columnCount).toBe(0)
      expect(table.rowCount).toBe(0)
      expect(table.cells).toHaveLength(0)
      expect(table.hasSpanCandidates).toBe(false)
      expect(table.hasMergedCells).toBe(false)
    })
  })

  describe('fixture: same-x fallback', () => {
    it('produces stable metadata', () => {
      const region = makeRegion('table', {
        id: 'p1-r0',
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, {
          regionId: 'p1-r0',
          items: [makeItem('A', 40), makeItem('B', 40)]
        }),
        makeLine(120, {
          regionId: 'p1-r0',
          items: [makeItem('C', 40), makeItem('D', 40)]
        })
      ]

      const result = analyzeTableRegions([region], lines, [])
      const table = result[0].metadata.table

      expect(table.columnCount).toBe(0)
      expect(table.rowCount).toBe(2)
      expect(table.cells).toHaveLength(0)
      expect(table.hasSpanCandidates).toBe(false)
      expect(table.hasMergedCells).toBe(false)
    })
  })

  describe('enrichBlocksWithTableMetadata', () => {
    it('enriches block items when pageLayout lines match', () => {
      const pageLines = [
        { text: 'Name Age', boundingBox: { x: 40, y: 100, width: 200, height: 14 }, fontSize: 12, items: [] },
        { text: 'Alice 30', boundingBox: { x: 40, y: 120, width: 200, height: 14 }, fontSize: 12, items: [] }
      ]
      const pageLayout = {
        lines: pageLines,
        regions: [{
          id: 'p1-r0',
          type: 'table',
          boundingBox: { x: 40, y: 100, width: 200, height: 60 },
          metadata: {
            table: {
              cells: [
                { sourceLineIndex: 0, sourceItemIndex: 0, cellId: 'p1-r0-r0-c0-i0', rowIndex: 0, columnIndex: 0, colSpanCandidate: false, estimatedColSpan: 1 },
                { sourceLineIndex: 0, sourceItemIndex: 1, cellId: 'p1-r0-r0-c1-i1', rowIndex: 0, columnIndex: 1, colSpanCandidate: false, estimatedColSpan: 1 }
              ]
            }
          }
        }]
      }

      const blocks = [{
        id: 'blk-1',
        lines: [
          {
            text: 'Name Age',
            boundingBox: { x: 40, y: 100, width: 200, height: 14 },
            items: [
              { text: 'Name', x: 40, y: 100, width: 60, height: 14 },
              { text: 'Age', x: 120, y: 100, width: 60, height: 14 }
            ]
          }
        ]
      }]

      const result = enrichBlocksWithTableMetadata(blocks, pageLayout)

      expect(result[0].lines[0].items[0].cellId).toBe('p1-r0-r0-c0-i0')
      expect(result[0].lines[0].items[0].rowIndex).toBe(0)
      expect(result[0].lines[0].items[0].columnIndex).toBe(0)
      expect(result[0].lines[0].items[1].cellId).toBe('p1-r0-r0-c1-i1')
      expect(result[0].lines[0].items[1].columnIndex).toBe(1)
    })

    it('handles block line order different from pageLayout line order', () => {
      const pageLines = [
        { text: 'Alice 30', boundingBox: { x: 40, y: 120, width: 200, height: 14 }, fontSize: 12, items: [] },
        { text: 'Name Age', boundingBox: { x: 40, y: 100, width: 200, height: 14 }, fontSize: 12, items: [] }
      ]
      const pageLayout = {
        lines: pageLines,
        regions: [{
          id: 'p1-r0',
          type: 'table',
          boundingBox: { x: 40, y: 100, width: 200, height: 60 },
          metadata: {
            table: {
              cells: [
                { sourceLineIndex: 1, sourceItemIndex: 0, cellId: 'p1-r0-r0-c0-i0', rowIndex: 0, columnIndex: 0, colSpanCandidate: false, estimatedColSpan: 1 }
              ]
            }
          }
        }]
      }

      const blocks = [{
        id: 'blk-1',
        lines: [
          {
            text: 'Name Age',
            boundingBox: { x: 40, y: 100, width: 200, height: 14 },
            items: [
              { text: 'Name', x: 40, y: 100, width: 60, height: 14 }
            ]
          }
        ]
      }]

      const result = enrichBlocksWithTableMetadata(blocks, pageLayout)

      expect(result[0].lines[0].items[0].cellId).toBe('p1-r0-r0-c0-i0')
    })

    it('unresolved block line does not throw and is not enriched', () => {
      const pageLines = [
        { text: 'Other line', boundingBox: { x: 40, y: 200, width: 200, height: 14 }, fontSize: 12, items: [] }
      ]
      const pageLayout = {
        lines: pageLines,
        regions: [{
          id: 'p1-r0',
          type: 'table',
          boundingBox: { x: 40, y: 100, width: 200, height: 60 },
          metadata: {
            table: {
              cells: [
                { sourceLineIndex: 0, sourceItemIndex: 0, cellId: 'p1-r0-r0-c0-i0', rowIndex: 0, columnIndex: 0, colSpanCandidate: false, estimatedColSpan: 1 }
              ]
            }
          }
        }]
      }

      const blocks = [{
        id: 'blk-1',
        lines: [
          {
            text: 'Unmatched line',
            boundingBox: { x: 40, y: 100, width: 200, height: 14 },
            items: [
              { text: 'Text', x: 40, y: 100, width: 60, height: 14 }
            ]
          }
        ]
      }]

      const result = enrichBlocksWithTableMetadata(blocks, pageLayout)

      expect(result[0].lines[0].items[0].cellId).toBeUndefined()
    })

    it('returns original blocks when pageLayout is null', () => {
      const blocks = [{ id: 'blk-1', lines: [] }]
      const result = enrichBlocksWithTableMetadata(blocks, null)
      expect(result).toBe(blocks)
    })

    it('returns original blocks when no table regions exist', () => {
      const pageLayout = {
        lines: [],
        regions: [{
          id: 'p1-r0',
          type: 'paragraph',
          metadata: {}
        }]
      }
      const blocks = [{ id: 'blk-1', lines: [] }]
      const result = enrichBlocksWithTableMetadata(blocks, pageLayout)
      expect(result).toBe(blocks)
    })
  })
})
