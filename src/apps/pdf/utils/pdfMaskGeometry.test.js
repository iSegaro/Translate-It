import { describe, it, expect } from 'vitest'
import { resolveCellOverlayGeometry } from './pdfMaskGeometry.js'

describe('resolveCellOverlayGeometry', () => {
  const blockBbox = { x: 40, y: 100, width: 200, height: 60 }

  it('returns item geometry when no mask', () => {
    const item = { x: 50, y: 110, width: 60, height: 14 }
    const result = resolveCellOverlayGeometry({ item, blockBbox, mask: null })

    expect(result.x).toBe(10)
    expect(result.y).toBe(10)
    expect(result.width).toBe(60)
    expect(result.height).toBe(14)
    expect(result.padding).toBeNull()
  })

  it('returns item geometry when mask type is not cell', () => {
    const item = { x: 50, y: 110, width: 60, height: 14 }
    const mask = { type: 'block', boundingBox: { x: 40, y: 100, width: 200, height: 60 } }
    const result = resolveCellOverlayGeometry({ item, blockBbox, mask })

    expect(result.x).toBe(10)
    expect(result.y).toBe(10)
    expect(result.width).toBe(60)
    expect(result.height).toBe(14)
    expect(result.padding).toBeNull()
  })

  it('returns mask geometry when mask type is cell', () => {
    const item = { x: 50, y: 110, width: 60, height: 14 }
    const mask = {
      type: 'cell',
      boundingBox: { x: 60, y: 120, width: 80, height: 16 },
      padding: { top: 1, right: 2, bottom: 1, left: 2 }
    }
    const result = resolveCellOverlayGeometry({ item, blockBbox, mask })

    expect(result.x).toBe(20)
    expect(result.y).toBe(20)
    expect(result.width).toBe(80)
    expect(result.height).toBe(16)
    expect(result.padding).toEqual({ top: 1, right: 2, bottom: 1, left: 2 })
  })

  it('prefers canonical structured cell geometry over source item geometry', () => {
    const item = { x: 50, y: 110, width: 60, height: 14 }
    const structuredCell = {
      boundingBox: { x: 70, y: 130, width: 90, height: 18 }
    }
    const result = resolveCellOverlayGeometry({ item, blockBbox, structuredCell, mask: null })

    expect(result.x).toBe(30)
    expect(result.y).toBe(30)
    expect(result.width).toBe(90)
    expect(result.height).toBe(18)
    expect(result.padding).toBeNull()
  })

  it('returns null padding when mask has no padding', () => {
    const item = { x: 50, y: 110, width: 60, height: 14 }
    const mask = {
      type: 'cell',
      boundingBox: { x: 60, y: 120, width: 80, height: 16 }
    }
    const result = resolveCellOverlayGeometry({ item, blockBbox, mask })

    expect(result.padding).toBeNull()
  })
})
