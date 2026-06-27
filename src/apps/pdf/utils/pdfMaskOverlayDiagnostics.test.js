import { describe, it, expect } from 'vitest'
import { buildCellMaskOverlayDiagnostics } from './pdfMaskOverlayDiagnostics.js'

function makeBlock(boundingBox = { x: 40, y: 100, width: 200, height: 60 }) {
  return {
    id: 'blk-1',
    boundingBox,
    lines: [
      {
        items: [
          { x: 50, y: 110, width: 60, height: 14 },
          { x: 180, y: 110, width: 60, height: 14 }
        ]
      }
    ]
  }
}

function makeTranslatedCells(cellIds = ['c0', 'c1']) {
  return [
    { lineIndex: 0, cells: ['A', 'B'], cellIds }
  ]
}

describe('buildCellMaskOverlayDiagnostics', () => {
  it('returns empty array when no maskMap', () => {
    const result = buildCellMaskOverlayDiagnostics({
      block: makeBlock(),
      translatedCells: makeTranslatedCells(),
      maskMap: null
    })

    expect(result).toEqual([])
  })

  it('returns empty array when no translatedCells', () => {
    const result = buildCellMaskOverlayDiagnostics({
      block: makeBlock(),
      translatedCells: null,
      maskMap: new Map()
    })

    expect(result).toEqual([])
  })

  it('returns empty array when no block', () => {
    const result = buildCellMaskOverlayDiagnostics({
      block: null,
      translatedCells: makeTranslatedCells(),
      maskMap: new Map()
    })

    expect(result).toEqual([])
  })

  it('hasMask=false when no matching cellId in maskMap', () => {
    const maskMap = new Map()
    const result = buildCellMaskOverlayDiagnostics({
      block: makeBlock(),
      translatedCells: makeTranslatedCells(['c0', 'c1']),
      maskMap
    })

    expect(result).toHaveLength(2)
    expect(result[0].hasMask).toBe(false)
    expect(result[1].hasMask).toBe(false)
  })

  it('hasMask=true when matching cellId exists', () => {
    const maskMap = new Map([
      ['c0', { type: 'cell', boundingBox: { x: 50, y: 110, width: 70, height: 16 }, padding: { top: 1, right: 2, bottom: 1, left: 2 } }]
    ])

    const result = buildCellMaskOverlayDiagnostics({
      block: makeBlock(),
      translatedCells: makeTranslatedCells(['c0', 'c1']),
      maskMap
    })

    expect(result[0].hasMask).toBe(true)
    expect(result[1].hasMask).toBe(false)
  })

  it('non-cell mask is ignored', () => {
    const maskMap = new Map([
      ['c0', { type: 'block', boundingBox: { x: 40, y: 100, width: 200, height: 60 } }]
    ])

    const result = buildCellMaskOverlayDiagnostics({
      block: makeBlock(),
      translatedCells: makeTranslatedCells(['c0', 'c1']),
      maskMap
    })

    expect(result[0].hasMask).toBe(false)
  })

  it('delta values computed correctly', () => {
    const maskMap = new Map([
      ['c0', { type: 'cell', boundingBox: { x: 55, y: 112, width: 65, height: 18 } }]
    ])

    const result = buildCellMaskOverlayDiagnostics({
      block: makeBlock(),
      translatedCells: makeTranslatedCells(['c0']),
      maskMap
    })

    const diag = result[0]
    expect(diag.deltaX).toBe(5)
    expect(diag.deltaY).toBe(2)
    expect(diag.deltaWidth).toBe(5)
    expect(diag.deltaHeight).toBe(4)
  })

  it('safe when translatedCells has no cellIds', () => {
    const maskMap = new Map([
      ['c0', { type: 'cell', boundingBox: { x: 50, y: 110, width: 60, height: 14 } }]
    ])

    const translatedCells = [{ lineIndex: 0, cells: ['A'] }]

    const result = buildCellMaskOverlayDiagnostics({
      block: makeBlock(),
      translatedCells,
      maskMap
    })

    expect(result).toHaveLength(1)
    expect(result[0].hasMask).toBe(false)
    expect(result[0].cellId).toBeNull()
  })

  it('diagnostic output is frozen', () => {
    const result = buildCellMaskOverlayDiagnostics({
      block: makeBlock(),
      translatedCells: makeTranslatedCells(),
      maskMap: new Map()
    })

    expect(Object.isFrozen(result[0])).toBe(true)
    expect(Object.isFrozen(result[0].source)).toBe(true)
    expect(Object.isFrozen(result[0].mask)).toBe(true)
  })
})
