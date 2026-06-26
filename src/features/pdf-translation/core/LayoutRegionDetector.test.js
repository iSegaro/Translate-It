import { describe, expect, it } from 'vitest'
import { detectLayoutRegions } from './LayoutRegionDetector.js'

function makeLine(y, height = 14, fontSize = 12, x = 40, width = 200) {
  return {
    text: `line at y=${y}`,
    boundingBox: { x, y, width, height },
    fontSize,
    items: []
  }
}

function makeBlock(id, x, y, width, height) {
  return {
    id,
    role: 'paragraph',
    text: `block ${id}`,
    pageNumber: 1,
    readingOrderIndex: 0,
    columnIndex: 0,
    boundingBox: { x, y, width, height }
  }
}

describe('LayoutRegionDetector', () => {
  it('returns empty array for empty lines', () => {
    const regions = detectLayoutRegions([], 1, [])
    expect(regions).toEqual([])
  })

  it('groups close lines into a single region', () => {
    const lines = [
      makeLine(100),
      makeLine(120),
      makeLine(140)
    ]

    const regions = detectLayoutRegions(lines, 1, [])

    expect(regions).toHaveLength(1)
    expect(regions[0].type).toBe('unknown')
    expect(regions[0].metadata.lineCount).toBe(3)
    expect(regions[0].boundingBox.y).toBe(100)
    expect(regions[0].boundingBox.height).toBe(54)
  })

  it('splits at large vertical gaps', () => {
    const lines = [
      makeLine(100),
      makeLine(120),
      makeLine(400),
      makeLine(420)
    ]

    const regions = detectLayoutRegions(lines, 1, [])

    expect(regions).toHaveLength(2)
    expect(regions[0].metadata.lineCount).toBe(2)
    expect(regions[1].metadata.lineCount).toBe(2)
    expect(regions[1].boundingBox.y).toBe(400)
  })

  it('gap threshold is medianFontSize × 3', () => {
    const lines = [
      makeLine(100, 14, 10),
      makeLine(120, 14, 10),
      makeLine(149, 14, 10)
    ]

    const regions = detectLayoutRegions(lines, 1, [])

    expect(regions).toHaveLength(1)

    const lines2 = [
      makeLine(100, 14, 10),
      makeLine(120, 14, 10),
      makeLine(165, 14, 10)
    ]

    const regions2 = detectLayoutRegions(lines2, 1, [])
    expect(regions2).toHaveLength(2)
  })

  it('assigns deterministic region IDs', () => {
    const lines = [makeLine(100), makeLine(400)]

    const regions = detectLayoutRegions(lines, 3, [])

    expect(regions[0].id).toBe('p3-r0')
    expect(regions[1].id).toBe('p3-r1')
  })

  it('assigns block IDs to regions by center containment', () => {
    const lines = [
      makeLine(100, 14, 12, 40, 200),
      makeLine(120, 14, 12, 40, 200)
    ]
    const blocks = [
      makeBlock('b1', 40, 100, 200, 34),
      makeBlock('b2', 40, 400, 200, 34)
    ]

    const regions = detectLayoutRegions(lines, 1, blocks)

    expect(regions).toHaveLength(1)
    expect(regions[0].blockIds).toEqual(['b1'])
  })

  it('preserves reading order of blocks within regions', () => {
    const lines = [
      makeLine(100, 14, 12, 40, 200),
      makeLine(120, 14, 12, 40, 200)
    ]
    const blocks = [
      makeBlock('b1', 40, 100, 200, 34),
      makeBlock('b2', 40, 105, 200, 34)
    ]

    const regions = detectLayoutRegions(lines, 1, blocks)

    expect(regions[0].blockIds).toEqual(['b1', 'b2'])
  })

  it('handles single line', () => {
    const lines = [makeLine(100)]

    const regions = detectLayoutRegions(lines, 1, [])

    expect(regions).toHaveLength(1)
    expect(regions[0].id).toBe('p1-r0')
    expect(regions[0].boundingBox).toEqual({ x: 40, y: 100, width: 200, height: 14 })
  })

  it('returns frozen regions array', () => {
    const lines = [makeLine(100), makeLine(400)]

    const regions = detectLayoutRegions(lines, 1, [])

    expect(Object.isFrozen(regions)).toBe(true)
    expect(Object.isFrozen(regions[0])).toBe(true)
    expect(Object.isFrozen(regions[0].blockIds)).toBe(true)
    expect(Object.isFrozen(regions[0].childRegionIds)).toBe(true)
    expect(Object.isFrozen(regions[0].metadata)).toBe(true)
  })

  it('includes metadata with lineCount and fontSize', () => {
    const lines = [makeLine(100, 14, 12), makeLine(120, 14, 12)]

    const regions = detectLayoutRegions(lines, 1, [])

    expect(regions[0].metadata.lineCount).toBe(2)
    expect(regions[0].metadata.fontSize).toBe(12)
    expect(regions[0].metadata.gapThreshold).toBe(36)
  })

  it('uses default fontSize 12 when lines have no fontSize', () => {
    const lines = [
      { text: 'a', boundingBox: { x: 40, y: 100, width: 100, height: 14 }, items: [] }
    ]

    const regions = detectLayoutRegions(lines, 1, [])

    expect(regions[0].metadata.fontSize).toBe(12)
  })

  it('merges bounding boxes correctly across multiple lines', () => {
    const lines = [
      { text: 'a', boundingBox: { x: 40, y: 100, width: 200, height: 14 }, fontSize: 12, items: [] },
      { text: 'b', boundingBox: { x: 80, y: 120, width: 300, height: 14 }, fontSize: 12, items: [] }
    ]

    const regions = detectLayoutRegions(lines, 1, [])

    expect(regions[0].boundingBox).toEqual({ x: 40, y: 100, width: 340, height: 34 })
  })

  it('blocks with no boundingBox are skipped', () => {
    const lines = [makeLine(100, 14, 12, 40, 200)]
    const blocks = [{ id: 'b1', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0, columnIndex: 0 }]

    const regions = detectLayoutRegions(lines, 1, blocks)

    expect(regions[0].blockIds).toEqual([])
  })
})
