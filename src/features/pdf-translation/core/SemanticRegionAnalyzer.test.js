import { describe, expect, it } from 'vitest'
import { analyzeSemanticRegions, selectFinancialEntries } from './SemanticRegionAnalyzer.js'

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

  describe('dashboard group detection', () => {
    it('horizontal KPI row gets dashboardGroup', () => {
      const regions = [
        makeRegion('paragraph', { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 100, height: 50 } }),
        makeRegion('paragraph', { id: 'p1-r1', boundingBox: { x: 160, y: 100, width: 100, height: 50 } }),
        makeRegion('paragraph', { id: 'p1-r2', boundingBox: { x: 280, y: 100, width: 100, height: 50 } })
      ]
      const lines = [
        makeLine(110, { text: '12,300', fontSize: 24, x: 40, width: 100 }),
        makeLine(125, { text: 'Revenue', fontSize: 12, x: 40, width: 100 }),
        makeLine(110, { text: '18.4', fontSize: 24, x: 160, width: 100 }),
        makeLine(125, { text: 'Growth', fontSize: 12, x: 160, width: 100 }),
        makeLine(110, { text: '4,500', fontSize: 24, x: 280, width: 100 }),
        makeLine(125, { text: 'Profit', fontSize: 12, x: 280, width: 100 })
      ]

      const result = analyzeSemanticRegions(regions, lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.dashboardGroup).toBeDefined()
      expect(result[0].metadata.semantic.dashboardGroup.layout).toBe('row')
      expect(result[0].metadata.semantic.dashboardGroup.regionIds).toHaveLength(3)
      expect(result[0].metadata.semantic.dashboardGroup.role).toBe('member')
    })

    it('2x2 KPI regions get dashboardGroups as separate rows (grid detection deferred)', () => {
      const regions = [
        makeRegion('paragraph', { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 100, height: 50 } }),
        makeRegion('paragraph', { id: 'p1-r1', boundingBox: { x: 160, y: 100, width: 100, height: 50 } }),
        makeRegion('paragraph', { id: 'p1-r2', boundingBox: { x: 40, y: 170, width: 100, height: 50 } }),
        makeRegion('paragraph', { id: 'p1-r3', boundingBox: { x: 160, y: 170, width: 100, height: 50 } })
      ]
      const lines = [
        makeLine(110, { text: '12,300', fontSize: 24, x: 40, width: 100 }),
        makeLine(125, { text: 'Revenue', fontSize: 12, x: 40, width: 100 }),
        makeLine(110, { text: '18.4', fontSize: 24, x: 160, width: 100 }),
        makeLine(125, { text: 'Growth', fontSize: 12, x: 160, width: 100 }),
        makeLine(180, { text: '4,500', fontSize: 24, x: 40, width: 100 }),
        makeLine(195, { text: 'Profit', fontSize: 12, x: 40, width: 100 }),
        makeLine(180, { text: '55', fontSize: 24, x: 160, width: 100 }),
        makeLine(195, { text: 'Rate', fontSize: 12, x: 160, width: 100 })
      ]

      const result = analyzeSemanticRegions(regions, lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.dashboardGroup).toBeDefined()
      expect(result[0].metadata.semantic.dashboardGroup.layout).toBe('row')
      expect(result[0].metadata.semantic.dashboardGroup.regionIds.length).toBeGreaterThanOrEqual(2)
    })

    it('single KPI does not get dashboardGroup', () => {
      const regions = [
        makeRegion('paragraph', { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 100, height: 50 } })
      ]
      const lines = [
        makeLine(100, { text: '12,300', fontSize: 24 }),
        makeLine(120, { text: 'Revenue', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions(regions, lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.dashboardGroup).toBeUndefined()
    })

    it('unrelated far KPIs are not grouped', () => {
      const regions = [
        makeRegion('paragraph', { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 100, height: 50 } }),
        makeRegion('paragraph', { id: 'p1-r1', boundingBox: { x: 40, y: 500, width: 100, height: 50 } })
      ]
      const lines = [
        makeLine(100, { text: '12,300', fontSize: 24 }),
        makeLine(120, { text: 'Revenue', fontSize: 12 }),
        makeLine(500, { text: '8,100', fontSize: 24 }),
        makeLine(520, { text: 'Cost', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions(regions, lines, [])

      expect(result[0].metadata.semantic).toBeDefined()
      expect(result[0].metadata.semantic.dashboardGroup).toBeUndefined()
      expect(result[1].metadata.semantic).toBeDefined()
      expect(result[1].metadata.semantic.dashboardGroup).toBeUndefined()
    })

    it('paragraph regions are ignored', () => {
      const regions = [
        makeRegion('paragraph', { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 400, height: 80 } }),
        makeRegion('paragraph', { id: 'p1-r1', boundingBox: { x: 40, y: 200, width: 400, height: 80 } })
      ]
      const lines = [
        makeLine(100, { text: 'This is a normal paragraph with long text.', fontSize: 12 }),
        makeLine(120, { text: 'Another line of regular text.', fontSize: 12 }),
        makeLine(200, { text: 'More text follows here.', fontSize: 12 }),
        makeLine(220, { text: 'And more text.', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions(regions, lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
      expect(result[1].metadata.semantic).toBeUndefined()
    })

    it('existing semantic.type is preserved', () => {
      const regions = [
        makeRegion('paragraph', { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 100, height: 50 } }),
        makeRegion('paragraph', { id: 'p1-r1', boundingBox: { x: 160, y: 100, width: 100, height: 50 } })
      ]
      const lines = [
        makeLine(110, { text: '12,300', fontSize: 24, x: 40, width: 100 }),
        makeLine(125, { text: 'Revenue', fontSize: 12, x: 40, width: 100 }),
        makeLine(110, { text: '18.4', fontSize: 24, x: 160, width: 100 }),
        makeLine(125, { text: 'Growth', fontSize: 12, x: 160, width: 100 })
      ]

      const result = analyzeSemanticRegions(regions, lines, [])

      expect(result[0].metadata.semantic.type).toBe('kpi-candidate')
      expect(result[1].metadata.semantic.type).toBe('kpi-candidate')
    })

    it('regionIds include all group members', () => {
      const regions = [
        makeRegion('paragraph', { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 100, height: 50 } }),
        makeRegion('paragraph', { id: 'p1-r1', boundingBox: { x: 160, y: 100, width: 100, height: 50 } }),
        makeRegion('paragraph', { id: 'p1-r2', boundingBox: { x: 280, y: 100, width: 100, height: 50 } })
      ]
      const lines = [
        makeLine(110, { text: '12,300', fontSize: 24, x: 40, width: 100 }),
        makeLine(125, { text: 'Revenue', fontSize: 12, x: 40, width: 100 }),
        makeLine(110, { text: '18.4', fontSize: 24, x: 160, width: 100 }),
        makeLine(125, { text: 'Growth', fontSize: 12, x: 160, width: 100 }),
        makeLine(110, { text: '4,500', fontSize: 24, x: 280, width: 100 }),
        makeLine(125, { text: 'Profit', fontSize: 12, x: 280, width: 100 })
      ]

      const result = analyzeSemanticRegions(regions, lines, [])

      const regionIds = result[0].metadata.semantic.dashboardGroup.regionIds
      expect(regionIds).toContain('p1-r0')
      expect(regionIds).toContain('p1-r1')
      expect(regionIds).toContain('p1-r2')
    })

    it('dashboardGroup objects are frozen', () => {
      const regions = [
        makeRegion('paragraph', { id: 'p1-r0', boundingBox: { x: 40, y: 100, width: 100, height: 50 } }),
        makeRegion('paragraph', { id: 'p1-r1', boundingBox: { x: 160, y: 100, width: 100, height: 50 } })
      ]
      const lines = [
        makeLine(110, { text: '12,300', fontSize: 24, x: 40, width: 100 }),
        makeLine(125, { text: 'Revenue', fontSize: 12, x: 40, width: 100 }),
        makeLine(110, { text: '18.4', fontSize: 24, x: 160, width: 100 }),
        makeLine(125, { text: 'Growth', fontSize: 12, x: 160, width: 100 })
      ]

      const result = analyzeSemanticRegions(regions, lines, [])

      expect(Object.isFrozen(result[0].metadata.semantic.dashboardGroup)).toBe(true)
      expect(Object.isFrozen(result[0].metadata.semantic.dashboardGroup.regionIds)).toBe(true)
      expect(Object.isFrozen(result[1].metadata.semantic.dashboardGroup)).toBe(true)
    })
  })

  describe('financial signal detection', () => {
    it('KPI metric with currency magnitude', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metric = result[0].metadata.semantic.metrics[0]
      expect(metric.financial).toBeDefined()
      expect(metric.financial.magnitude).toBe('B')
      expect(metric.financial.polarity).toBe('neutral')
    })

    it('KPI metric with million magnitude', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Profit', fontSize: 12 }),
        makeLine(120, { text: '€3.2M', fontSize: 20 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.metrics[0].financial.magnitude).toBe('M')
    })

    it('parenthesized negative value', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Net Loss', fontSize: 12 }),
        makeLine(120, { text: '($1.2B)', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metric = result[0].metadata.semantic.metrics[0]
      expect(metric.financial).toBeDefined()
      expect(metric.financial.polarity).toBe('negative')
      expect(metric.financial.magnitude).toBe('B')
    })

    it('explicit negative value', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Decline', fontSize: 12 }),
        makeLine(120, { text: '-3.4%', fontSize: 20 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.metrics[0].financial.polarity).toBe('negative')
    })

    it('positive delta', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Growth', fontSize: 12 }),
        makeLine(120, { text: '+18.4%', fontSize: 20 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial.polarity).toBe('positive')
      expect(financial.delta).toBe('+18.4%')
    })

    it('YoY period extraction', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Growth', fontSize: 12 }),
        makeLine(120, { text: '+18.4% YoY', fontSize: 20 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial.delta).toBe('+18.4%')
      expect(financial.period).toBe('YoY')
    })

    it('QoQ period extraction', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Change', fontSize: 12 }),
        makeLine(120, { text: '-2.1% QoQ', fontSize: 20 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial.delta).toBe('-2.1%')
      expect(financial.period).toBe('QoQ')
    })

    it('MoM period extraction', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Trend', fontSize: 12 }),
        makeLine(120, { text: '+5% MoM', fontSize: 20 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.metrics[0].financial.period).toBe('MoM')
    })

    it('vs LY period extraction', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Performance', fontSize: 12 }),
        makeLine(120, { text: '+12% vs LY', fontSize: 20 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial.delta).toBe('+12%')
      expect(financial.period).toBe('vs LY')
    })

    it('English financial label sets hasEnglishFinancialVocabularySignal: true', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.metrics[0].financial.hasEnglishFinancialVocabularySignal).toBe(true)
    })

    it('non-English label with currency and magnitude still gets financial metadata', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Umsatz', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial).toBeDefined()
      expect(financial.hasEnglishFinancialVocabularySignal).toBe(false)
      expect(financial.magnitude).toBe('B')
    })

    it('non-English label without financial numeric signal does not get financial metadata', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Anzahl', fontSize: 12 }),
        makeLine(120, { text: '1,234', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.metrics[0].financial).toBeNull()
    })

    it('non-financial vocabulary has no vocabulary signal', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Count', fontSize: 12 }),
        makeLine(120, { text: '1,234', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial).toBeNull()
    })

    it('non-financial key-value has no financial metadata', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Name: Alice', fontSize: 12 }),
        makeLine(120, { text: 'Age: 30', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.type).toBe('key-value-candidate')
      expect(result[0].metadata.semantic.pairs[0].financial).toBeNull()
      expect(result[0].metadata.semantic.pairs[1].financial).toBeNull()
    })

    it('financial key-value pair has financial metadata', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: 4.2B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.type).toBe('key-value-candidate')
      expect(result[0].metadata.semantic.pairs[0].financial).toBeDefined()
      expect(result[0].metadata.semantic.pairs[0].financial.magnitude).toBe('B')
      expect(result[0].metadata.semantic.pairs[0].financial.hasEnglishFinancialVocabularySignal).toBe(true)
    })

    it('table/heading/list regions still skipped', () => {
      const table = makeRegion('table', { boundingBox: { x: 40, y: 100, width: 200, height: 60 } })
      const heading = makeRegion('heading', { boundingBox: { x: 40, y: 200, width: 200, height: 30 } })
      const list = makeRegion('list', { boundingBox: { x: 40, y: 300, width: 200, height: 60 } })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([table, heading, list], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
      expect(result[1].metadata.semantic).toBeUndefined()
      expect(result[2].metadata.semantic).toBeUndefined()
    })

    it('financial metadata objects are frozen', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(Object.isFrozen(financial)).toBe(true)
    })

    it('KPI with no financial signals has null financial', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Count', fontSize: 12 }),
        makeLine(120, { text: '1,234', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.metrics[0].financial).toBeNull()
    })
  })

  describe('three-line metric delta parsing', () => {
    it('label/value/delta produces one metric with deltaLineIndex', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.3B', fontSize: 24 }),
        makeLine(140, { text: '+18.4% YoY', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metrics = result[0].metadata.semantic.metrics
      expect(metrics).toHaveLength(1)
      expect(metrics[0].label).toBe('Revenue')
      expect(metrics[0].value).toBe('$12.3B')
      expect(metrics[0].delta).toBe('+18.4% YoY')
      expect(metrics[0].deltaLineIndex).toBe(2)
      expect(metrics[0].valueLineIndex).toBe(1)
      expect(metrics[0].labelLineIndex).toBe(0)
    })

    it('label/delta/value produces one metric with deltaLineIndex', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '+18.4% YoY', fontSize: 14 }),
        makeLine(140, { text: '$12.3B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metrics = result[0].metadata.semantic.metrics
      expect(metrics).toHaveLength(1)
      expect(metrics[0].label).toBe('Revenue')
      expect(metrics[0].value).toBe('$12.3B')
      expect(metrics[0].delta).toBe('+18.4% YoY')
      expect(metrics[0].deltaLineIndex).toBe(1)
    })

    it('value/label/delta produces one metric if safe', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: '$12.3B', fontSize: 24 }),
        makeLine(120, { text: 'Revenue', fontSize: 12 }),
        makeLine(140, { text: '+18.4% YoY', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metrics = result[0].metadata.semantic.metrics
      expect(metrics).toHaveLength(1)
      expect(metrics[0].value).toBe('$12.3B')
      expect(metrics[0].label).toBe('Revenue')
      expect(metrics[0].delta).toBe('+18.4% YoY')
      expect(metrics[0].deltaLineIndex).toBe(2)
    })

    it('delta line no longer becomes standalone metric when value exists', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.3B', fontSize: 24 }),
        makeLine(140, { text: '+18.4% YoY', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.metrics).toHaveLength(1)
    })

    it('standalone percentage without period/sign remains value metric', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Growth', fontSize: 12 }),
        makeLine(120, { text: '18.4%', fontSize: 20 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metrics = result[0].metadata.semantic.metrics
      expect(metrics).toHaveLength(1)
      expect(metrics[0].value).toBe('18.4%')
      expect(metrics[0].delta).toBeNull()
    })

    it('delta at region start without label is skipped', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: '+18.4% YoY', fontSize: 14 }),
        makeLine(120, { text: '$12.3B', fontSize: 24 }),
        makeLine(140, { text: '+5% QoQ', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metrics = result[0].metadata.semantic.metrics
      expect(metrics).toHaveLength(1)
      expect(metrics[0].value).toBe('$12.3B')
      expect(metrics[0].delta).toBe('+5% QoQ')
      expect(metrics[0].deltaLineIndex).toBe(2)
    })

    it('two stacked metrics each get own delta', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 120 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(115, { text: '$12.3B', fontSize: 24 }),
        makeLine(130, { text: '+18.4% YoY', fontSize: 14 }),
        makeLine(155, { text: '$8.1B', fontSize: 24 }),
        makeLine(170, { text: '-2% QoQ', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metrics = result[0].metadata.semantic.metrics
      expect(metrics).toHaveLength(2)
      expect(metrics[0].value).toBe('$12.3B')
      expect(metrics[0].delta).toBe('+18.4% YoY')
      expect(metrics[0].deltaLineIndex).toBe(2)
      expect(metrics[1].value).toBe('$8.1B')
      expect(metrics[1].delta).toBe('-2% QoQ')
      expect(metrics[1].deltaLineIndex).toBe(4)
    })

    it('deltaLineIndex uses original source line index', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(50, { text: 'Before', fontSize: 12 }),
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.3B', fontSize: 24 }),
        makeLine(140, { text: '+18.4% YoY', fontSize: 14 }),
        makeLine(200, { text: 'After', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metric = result[0].metadata.semantic.metrics[0]
      expect(metric.valueLineIndex).toBe(2)
      expect(metric.labelLineIndex).toBe(1)
      expect(metric.deltaLineIndex).toBe(3)
    })

    it('financial.magnitude from value is preserved when delta attaches', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.3B', fontSize: 24 }),
        makeLine(140, { text: '+18.4% YoY', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial.magnitude).toBe('B')
      expect(financial.hasEnglishFinancialVocabularySignal).toBe(true)
      expect(financial.period).toBe('YoY')
      expect(financial.delta).toBe('+18.4%')
      expect(financial.polarity).toBe('positive')
    })

    it('metric and financial metadata remain frozen after delta attach', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.3B', fontSize: 24 }),
        makeLine(140, { text: '+18.4% YoY', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metric = result[0].metadata.semantic.metrics[0]
      expect(Object.isFrozen(metric)).toBe(true)
      expect(Object.isFrozen(metric.financial)).toBe(true)
    })

    it('delta without period marker but with +/- near value still attaches', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.3B', fontSize: 24 }),
        makeLine(140, { text: '+18.4%', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metrics = result[0].metadata.semantic.metrics
      expect(metrics).toHaveLength(1)
      expect(metrics[0].delta).toBe('+18.4%')
      expect(metrics[0].financial.polarity).toBe('positive')
    })

    it('multiple delta lines near one metric attaches closest only', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 110 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(115, { text: '$12.3B', fontSize: 24 }),
        makeLine(130, { text: '+18.4% YoY', fontSize: 14 }),
        makeLine(145, { text: '+5% QoQ', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const metrics = result[0].metadata.semantic.metrics
      expect(metrics).toHaveLength(1)
      expect(metrics[0].delta).toBe('+18.4% YoY')
      expect(metrics[0].deltaLineIndex).toBe(2)
    })
  })

  describe('financial subtype classification', () => {
    it('metric-with-delta subtype on metric with period', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.3B', fontSize: 24 }),
        makeLine(140, { text: '+18.4% YoY', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial.subtype).toBe('metric-with-delta')
      expect(financial.subtypes).toContain('metric-with-delta')
    })

    it('summary-row subtype on financial key-value pair', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: 4.2B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.type).toBe('key-value-candidate')
      expect(result[0].metadata.semantic.pairs[0].financial.subtype).toBe('summary-row')
      expect(result[0].metadata.semantic.pairs[0].financial.subtypes).toContain('summary-row')
    })

    it('total-row subtype on total assets label', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Total Assets: 20.0B', fontSize: 12 }),
        makeLine(120, { text: 'Revenue: 12.3B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const totalPair = result[0].metadata.semantic.pairs.find((p) => p.label === 'Total Assets')
      expect(totalPair.financial.subtype).toBe('total-row')
      expect(totalPair.financial.subtypes).toContain('total-row')
      expect(totalPair.financial.subtypes).toContain('summary-row')
    })

    it('total-row subtype on net income label', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Net Income: $3.3B', fontSize: 12 }),
        makeLine(120, { text: 'Revenue: 12.3B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const pair = result[0].metadata.semantic.pairs.find((p) => p.label === 'Net Income')
      expect(pair.financial.subtype).toBe('total-row')
    })

    it('negative-value subtype on parenthesized value', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Write-down', fontSize: 12 }),
        makeLine(120, { text: '($1.2B)', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial.subtypes).toContain('negative-value')
    })

    it('multiple subtypes: total-row + summary-row', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Total Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: 4.2B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const pair = result[0].metadata.semantic.pairs.find((p) => p.label === 'Total Revenue')
      expect(pair.financial.subtype).toBe('total-row')
      expect(pair.financial.subtypes).toContain('total-row')
      expect(pair.financial.subtypes).toContain('summary-row')
    })

    it('multiple subtypes: total-row + negative-value', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Total Loss: ($5.2B)', fontSize: 12 }),
        makeLine(120, { text: 'Revenue: 12.3B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const pair = result[0].metadata.semantic.pairs.find((p) => p.label === 'Total Loss')
      expect(pair.financial.subtype).toBe('total-row')
      expect(pair.financial.subtypes).toContain('total-row')
      expect(pair.financial.subtypes).toContain('negative-value')
      expect(pair.financial.subtypes).toContain('summary-row')
    })

    it('priority: total-row beats negative-value as primary', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Total Loss: ($5.2B)', fontSize: 12 }),
        makeLine(120, { text: 'Revenue: 12.3B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const pair = result[0].metadata.semantic.pairs.find((p) => p.label === 'Total Loss')
      expect(pair.financial.subtype).toBe('total-row')
    })

    it('non-financial pair keeps financial null', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Name: Alice', fontSize: 12 }),
        makeLine(120, { text: 'Age: 30', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.pairs[0].financial).toBeNull()
      expect(result[0].metadata.semantic.pairs[1].financial).toBeNull()
    })

    it('delta without period but explicit sign gets metric-with-delta', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.3B', fontSize: 24 }),
        makeLine(140, { text: '+18.4%', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial.subtype).toBe('metric-with-delta')
    })

    it('negative delta with hyphen gets metric-with-delta and negative polarity', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.3B', fontSize: 24 }),
        makeLine(140, { text: '-18.4%', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial.subtype).toBe('metric-with-delta')
      expect(financial.subtypes).toContain('metric-with-delta')
      expect(financial.polarity).toBe('negative')
    })

    it('financial object and subtypes array are frozen', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 90 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.3B', fontSize: 24 }),
        makeLine(140, { text: '+18.4% YoY', fontSize: 14 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(Object.isFrozen(financial)).toBe(true)
      expect(Object.isFrozen(financial.subtypes)).toBe(true)
    })

    it('metric without financial signals has subtype null', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Count', fontSize: 12 }),
        makeLine(120, { text: '1,234', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.metrics[0].financial).toBeNull()
    })

    it('summary-row subtype on metric with currency', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 200, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue', fontSize: 12 }),
        makeLine(120, { text: '$12.5B', fontSize: 24 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const financial = result[0].metadata.semantic.metrics[0].financial
      expect(financial.subtype).toBe('summary-row')
      expect(financial.subtypes).toContain('summary-row')
    })
  })

  describe('financial statement fragment detection', () => {
    it('balance-sheet fragment gets financialStatement', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'Current Assets: $8.2B', fontSize: 12 }),
        makeLine(120, { text: 'Cash: $2.1B', fontSize: 12 }),
        makeLine(140, { text: 'Accounts Receivable: $3.4B', fontSize: 12 }),
        makeLine(160, { text: 'Total Current Assets: $13.7B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const fs = result[0].metadata.semantic.financialStatement
      expect(fs).toBeDefined()
      expect(fs.type).toBe('statement-fragment')
      expect(fs.rowCount).toBe(4)
      expect(fs.totalRowCount).toBe(1)
    })

    it('income-statement fragment gets financialStatement', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 120 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Cost of Revenue: ($4.1B)', fontSize: 12 }),
        makeLine(140, { text: 'Gross Profit: $8.2B', fontSize: 12 }),
        makeLine(160, { text: 'Operating Expense: ($5.1B)', fontSize: 12 }),
        makeLine(180, { text: 'Operating Income: $3.1B', fontSize: 12 }),
        makeLine(200, { text: 'Net Income: $2.4B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const fs = result[0].metadata.semantic.financialStatement
      expect(fs).toBeDefined()
      expect(fs.type).toBe('statement-fragment')
      expect(fs.rowCount).toBe(6)
      expect(fs.totalRowCount).toBe(4)
      expect(fs.negativeRowCount).toBe(2)
    })

    it('totalRowCount counts total-row subtypes', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'Assets: $8.2B', fontSize: 12 }),
        makeLine(120, { text: 'Liabilities: $4.1B', fontSize: 12 }),
        makeLine(140, { text: 'Total Equity: $4.1B', fontSize: 12 }),
        makeLine(160, { text: 'Total Liabilities and Equity: $8.2B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const fs = result[0].metadata.semantic.financialStatement
      expect(fs).toBeDefined()
      expect(fs.totalRowCount).toBe(2)
    })

    it('negativeRowCount counts negative polarity entries', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Expenses: ($5.1B)', fontSize: 12 }),
        makeLine(140, { text: 'Losses: ($2.1B)', fontSize: 12 }),
        makeLine(160, { text: 'Net: $5.1B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const fs = result[0].metadata.semantic.financialStatement
      expect(fs).toBeDefined()
      expect(fs.negativeRowCount).toBe(2)
    })

    it('hasConsistentCurrency and primaryCurrency', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: $8.2B', fontSize: 12 }),
        makeLine(140, { text: 'Liabilities: $4.1B', fontSize: 12 }),
        makeLine(160, { text: 'Equity: $4.1B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const fs = result[0].metadata.semantic.financialStatement
      expect(fs).toBeDefined()
      expect(fs.hasConsistentCurrency).toBe(true)
      expect(fs.primaryCurrency).toBe('$')
    })

    it('insufficient rows does not attach', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: 4.2B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.financialStatement).toBeUndefined()
    })

    it('insufficient signals does not attach', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'Alpha: $1.0B', fontSize: 12 }),
        makeLine(120, { text: 'Beta: $2.0B', fontSize: 12 }),
        makeLine(140, { text: 'Gamma: $3.0B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const fs = result[0].metadata.semantic.financialStatement
      expect(fs).toBeUndefined()
    })

    it('non-financial key-value has no financialStatement', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 300, height: 60 }
      })
      const lines = [
        makeLine(100, { text: 'Name: Alice', fontSize: 12 }),
        makeLine(120, { text: 'Age: 30', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic.financialStatement).toBeUndefined()
    })

    it('table region skipped', () => {
      const region = makeRegion('table', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: $8.2B', fontSize: 12 }),
        makeLine(140, { text: 'Liabilities: $4.1B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      expect(result[0].metadata.semantic).toBeUndefined()
    })

    it('sourceLineIndices correctness', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: $8.2B', fontSize: 12 }),
        makeLine(140, { text: 'Liabilities: $4.1B', fontSize: 12 }),
        makeLine(160, { text: 'Total: $12.3B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const fs = result[0].metadata.semantic.financialStatement
      expect(fs).toBeDefined()
      expect(fs.sourceLineIndices).toEqual([0, 1, 2, 3])
    })

    it('confidence equals signalCount / 5', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Expenses: ($5.1B)', fontSize: 12 }),
        makeLine(140, { text: 'Total Costs: $4.1B', fontSize: 12 }),
        makeLine(160, { text: 'Net: $7.2B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const fs = result[0].metadata.semantic.financialStatement
      expect(fs).toBeDefined()
      expect(fs.confidence).toBeGreaterThan(0)
      expect(fs.confidence).toBeLessThanOrEqual(1)
    })

    it('pair subtypes remain preserved', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: $8.2B', fontSize: 12 }),
        makeLine(140, { text: 'Total Equity: $4.1B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const totalPair = result[0].metadata.semantic.pairs.find((p) => p.label === 'Total Equity')
      expect(totalPair.financial.subtype).toBe('total-row')
      expect(result[0].metadata.semantic.financialStatement).toBeDefined()
    })

    it('financialStatement objects are frozen', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Assets: $8.2B', fontSize: 12 }),
        makeLine(140, { text: 'Liabilities: $4.1B', fontSize: 12 }),
        makeLine(160, { text: 'Total Equity: $4.1B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const fs = result[0].metadata.semantic.financialStatement
      expect(Object.isFrozen(fs)).toBe(true)
      expect(Object.isFrozen(fs.sourceLineIndices)).toBe(true)
      expect(Object.isFrozen(fs.signals)).toBe(true)
    })

    it('financialVocabularyDensity signal', () => {
      const region = makeRegion('paragraph', {
        boundingBox: { x: 40, y: 100, width: 400, height: 100 }
      })
      const lines = [
        makeLine(100, { text: 'Revenue: $12.3B', fontSize: 12 }),
        makeLine(120, { text: 'Income: $8.2B', fontSize: 12 }),
        makeLine(140, { text: 'Profit: $4.1B', fontSize: 12 })
      ]

      const result = analyzeSemanticRegions([region], lines, [])

      const fs = result[0].metadata.semantic.financialStatement
      expect(fs).toBeDefined()
      expect(fs.signals.financialVocabularyDensity).toBe(true)
    })
  })

  describe('selectFinancialEntries', () => {
    it('only pairs returns pairs', () => {
      const semantic = {
        type: 'key-value-candidate',
        pairs: [
          { label: 'A', value: '$1B', financial: { polarity: 'neutral' } },
          { label: 'B', value: '$2B', financial: { polarity: 'neutral' } },
          { label: 'C', value: '$3B', financial: { polarity: 'neutral' } }
        ]
      }
      expect(selectFinancialEntries(semantic)).toBe(semantic.pairs)
    })

    it('only metrics returns metrics', () => {
      const semantic = {
        type: 'kpi-candidate',
        metrics: [
          { label: 'A', value: '$1B', financial: { polarity: 'neutral' } },
          { label: 'B', value: '$2B', financial: { polarity: 'neutral' } },
          { label: 'C', value: '$3B', financial: { polarity: 'neutral' } }
        ]
      }
      expect(selectFinancialEntries(semantic)).toBe(semantic.metrics)
    })

    it('both collections: pairs wins with more financial entries', () => {
      const semantic = {
        type: 'kpi-candidate',
        pairs: [
          { label: 'A', value: '$1B', financial: { polarity: 'neutral' } },
          { label: 'B', value: '$2B', financial: { polarity: 'neutral' } },
          { label: 'C', value: '$3B', financial: { polarity: 'neutral' } }
        ],
        metrics: [
          { label: 'D', value: '$4B', financial: { polarity: 'neutral' } },
          { label: 'E', value: 'plain', financial: null }
        ]
      }
      expect(selectFinancialEntries(semantic)).toBe(semantic.pairs)
    })

    it('both collections: metrics wins with more financial entries', () => {
      const semantic = {
        type: 'kpi-candidate',
        pairs: [
          { label: 'A', value: '$1B', financial: { polarity: 'neutral' } }
        ],
        metrics: [
          { label: 'D', value: '$4B', financial: { polarity: 'neutral' } },
          { label: 'E', value: '$5B', financial: { polarity: 'neutral' } },
          { label: 'F', value: '$6B', financial: { polarity: 'neutral' } }
        ]
      }
      expect(selectFinancialEntries(semantic)).toBe(semantic.metrics)
    })

    it('tie prefers pairs', () => {
      const semantic = {
        type: 'kpi-candidate',
        pairs: [
          { label: 'A', value: '$1B', financial: { polarity: 'neutral' } },
          { label: 'B', value: '$2B', financial: { polarity: 'neutral' } }
        ],
        metrics: [
          { label: 'D', value: '$4B', financial: { polarity: 'neutral' } },
          { label: 'E', value: '$5B', financial: { polarity: 'neutral' } }
        ]
      }
      expect(selectFinancialEntries(semantic)).toBe(semantic.pairs)
    })

    it('neither exists returns null', () => {
      const semantic = { type: 'kpi-candidate' }
      expect(selectFinancialEntries(semantic)).toBeNull()
    })
  })
})
