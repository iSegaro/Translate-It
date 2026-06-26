import { describe, expect, it } from 'vitest'
import { analyzeSemanticRegions } from './SemanticRegionAnalyzer.js'

function makeRegion(type, { id = 'p1-r0', boundingBox = { x: 40, y: 100, width: 200, height: 60 }, metadata = {} } = {}) {
  return {
    id,
    type,
    boundingBox,
    childRegionIds: [],
    blockIds: [],
    metadata: {
      lineCount: 2,
      fontSize: 12,
      gapThreshold: 36,
      ...metadata
    }
  }
}

function makeLine(y, { text = 'line', fontSize = 12, x = 40, width = 200 } = {}) {
  return {
    text,
    boundingBox: { x, y, width, height: fontSize },
    fontSize,
    items: []
  }
}

describe('SemanticRegionAnalyzer', () => {
  describe('KPI candidate detection', () => {
    it('detects numeric + label vertical KPI candidate', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.type).toBe('kpi-candidate')
      expect(result[0].metadata.semantic.confidence).toBeGreaterThan(0.55)
      expect(result[0].metadata.semantic.metrics).toHaveLength(1)
      expect(result[0].metadata.semantic.metrics[0].value).toBe('$12.5B')
      expect(result[0].metadata.semantic.metrics[0].label).toBe('Revenue')
      expect(result[0].metadata.semantic.metrics[0].unit).toBe('currency')
    })

    it('detects currency value + label', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Profit', fontSize: 12 }),
        makeLine(120, { text: '€3.2M', fontSize: 20 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.metrics[0].unit).toBe('currency')
    })

    it('detects percentage value + label', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Growth', fontSize: 12 }),
        makeLine(120, { text: '18.4%', fontSize: 20 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.metrics[0].unit).toBe('percentage')
    })

    it('normal paragraph is not semantic', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'This is a long paragraph with normal text content.', fontSize: 12 }),
        makeLine(120, { text: 'Another line of regular text.', fontSize: 12 }),
        makeLine(140, { text: 'More text follows here.', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
    })

    it('heading region is skipped', () => {
      const region = makeRegion('heading', {
        boundingBox: { x: 40, y: 100, width: 200, height: 30 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
    })

    it('list region is skipped', () => {
      const region = makeRegion('list', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: '• Item 1', fontSize: 12 }),
        makeLine(120, { text: '• Item 2', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
    })

    it('table region is skipped', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
    })

    it('long numeric paragraph is skipped', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 150 }
      })
      const lines = [
        makeLine(100, { text: '1234567890', fontSize: 12 }),
        makeLine(120, { text: '2345678901', fontSize: 12 }),
        makeLine(140, { text: '3456789012', fontSize: 12 }),
        makeLine(160, { text: '4567890123', fontSize: 12 }),
        makeLine(180, { text: '5678901234', fontSize: 12 }),
        makeLine(200, { text: '6789012345', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
    })

    it('unknown region can become KPI candidate', () => {
      const region = makeRegion('unknown', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Users', fontSize: 12 }),
        makeLine(120, { text: '1,234', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.type).toBe('kpi-candidate')
    })

    it('confidence threshold behavior', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 40 }
      })
      const lines = [
        makeLine(100, { text: 'A', fontSize: 12 }),
        makeLine(120, { text: 'B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
    })
  })

  describe('immutability', () => {
    it('returns frozen regions array', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(Object.isFrozen(result)).toBe(true)
      expect(Object.isFrozen(result[0])).toBe(true)
      expect(Object.isFrozen(result[0].metadata)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.semantic)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.semantic.signals)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.semantic.metrics)).toBe(true)
    })

    it('does not mutate input regions', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      analyzeSemanticRegions([region], lines, [])

      expect(region.metadata.semantic).toBeUndefined()
    })

    it('returns empty frozen array for empty input', () => {
      const result = analyzeSemanticRegions([], [], [])

      expect(result).toEqual([])
      expect(Object.isFrozen(result)).toBe(true)
    })
  })

  describe('metadata structure', () => {
    it('has correct field types', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const semantic = result[0].metadata.semantic
      expect(typeof semantic.type).toBe('string')
      expect(typeof semantic.confidence).toBe('number')
      expect(typeof semantic.signals).toBe('object')
      expect(Array.isArray(semantic.metrics)).toBe(true)
    })

    it('preserves original metadata', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 },
        metadata: { lineCount: 5, fontSize: 14, customField: 'value' }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.lineCount).toBe(5)
      expect(result[0].metadata.fontSize).toBe(14)
      expect(result[0].metadata.customField).toBe('value')
      expect(result[0].metadata.semantic).toBeDefined()
    })
  })

  describe('mixed region types', () => {
    it('only enriches eligible regions', () => {
      const regions = [
        makeRegion('paragraph', { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 200, height: 60 } }),
        makeRegion('heading', { id: 'p1-r1', boundingBox: { x: 40, y: 200, width: 200, height: 30 } }),
        makeRegion('table', { id: 'p1-r2', boundingBox: { x: 40, y: 300, width: 200, height: 60 } })
      ]
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions(regions, lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[1].metadata.semantic).toBeUndefined()
      expect(result[2].metadata.semantic).toBeUndefined()
    })
  })

  describe('metric object freezing', () => {
    it('each metric object is frozen', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(Object.isFrozen(result[0].metadata.semantic.metrics[0])).toBe(true)
    })
  })

  describe('source line indices', () => {
    it('metric indices point to original lines array positions', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(50, { text: 'Unrelated line before', fontSize: 12 }),
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 }),
        makeLine(200, { text: 'Unrelated line after', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.metrics[0].valueLineIndex).toBe(2)
      expect(result[0].metadata.semantic.metrics[0].labelLineIndex).toBe(1)
    })

    it('KPI region lines at non-zero indices map correctly', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 200, width: 200, height: 60 }
      })
      const lines = [
        makeLine(50, { text: 'First', fontSize: 12 }),
        makeLine(100, { text: 'Second', fontSize: 12 }),
        makeLine(200, { text: 'Users', fontSize: 12 }),
        makeLine(220, { text: '5,000', fontSize: 24 }),
        makeLine(300, { text: 'Last', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.metrics[0].valueLineIndex).toBe(3)
      expect(result[0].metadata.semantic.metrics[0].labelLineIndex).toBe(2)
    })
  })

  describe('key-value candidate detection', () => {
    it('detects colon pair', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: 4.2B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.type).toBe('key-value-candidate')
      expect(result[0].metadata.semantic.pairs).toHaveLength(2)
      expect(result[0].metadata.semantic.pairs[0].label).toBe('Revenue')
      expect(result[0].metadata.semantic.pairs[0].value).toBe('$12.3B')
      expect(result[0].metadata.semantic.pairs[0].separator).toBe('colon')
    })

    it('detects dotted leader pair', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue .......... $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets .......... 4.2B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.type).toBe('key-value-candidate')
      expect(result[0].metadata.semantic.pairs).toHaveLength(2)
      expect(result[0].metadata.semantic.pairs[0].separator).toBe('dot-leader')
    })

    it('detects repeated pairs', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 80 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: 4.2B', fontSize: 12 }),
        makeLine(140, { text: 'Employees: 1,542', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.type).toBe('key-value-candidate')
      expect(result[0].metadata.semantic.pairs).toHaveLength(3)
      expect(result[0].metadata.semantic.confidence).toBeGreaterThan(0.55)
    })

    it('single weak pair is ignored', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 40 }
      })
      const lines = [
        makeLine(100, { text: 'A: B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
    })

    it('explicit colon pairs are accepted with 2+ pairs', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: 4.2B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.type).toBe('key-value-candidate')
      expect(result[0].metadata.semantic.pairs).toHaveLength(2)
    })

    it('single colon pair alone does not reach confidence threshold', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
    })

    it('normal paragraph false positive', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'This is a normal paragraph with text.', fontSize: 12 }),
        makeLine(120, { text: 'Another line of regular text.', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
    })

    it('table/heading/list skipped', () => {
      const tableRegion = makeRegion('table', { boundingBox: { x: 40, y: 100, width: 300, height: 60 } })
      const headingRegion = makeRegion('heading', { boundingBox: { x: 40, y: 200, width: 300, height: 30 } })
      const listRegion = makeRegion('list', { boundingBox: { x: 40, y: 300, width: 300, height: 60 } })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: 4.2B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([tableRegion, headingRegion, listRegion], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
      expect(result[1].metadata.semantic).toBeUndefined()
      expect(result[2].metadata.semantic).toBeUndefined()
    })

    it('KPI vertical single metric remains kpi-candidate', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.type).toBe('kpi-candidate')
    })

    it('multi-pair key-value beats KPI', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 80 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: 4.2B', fontSize: 12 }),
        makeLine(140, { text: 'Employees: 1,542', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.type).toBe('key-value-candidate')
    })

    it('source line indices are original indices', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(50, { text: 'Unrelated', fontSize: 12 }),
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: 4.2B', fontSize: 12 }),
        makeLine(200, { text: 'End', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.pairs[0].labelLineIndex).toBe(1)
      expect(result[0].metadata.semantic.pairs[0].valueLineIndex).toBe(1)
      expect(result[0].metadata.semantic.pairs[1].labelLineIndex).toBe(2)
      expect(result[0].metadata.semantic.pairs[1].valueLineIndex).toBe(2)
    })

    it('key-value objects are frozen', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: 4.2B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(Object.isFrozen(result[0].metadata.semantic)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.semantic.signals)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.semantic.pairs)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.semantic.pairs[0])).toBe(true)
      expect(Object.isFrozen(result[0].metadata.semantic.pairs[0].labelBbox)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.semantic.pairs[0].valueBbox)).toBe(true)
    })
  })
})
