import { describe, expect, it } from 'vitest'
import { resolvePdfCellOverlayWidth } from './PdfCellSpanLayout.js'

describe('resolvePdfCellOverlayWidth', () => {
  const baseItem = { x: 40, width: 60, right: 100 }
  const baseLine = { boundingBox: { x: 40, y: 100, width: 300, height: 14 } }

  it('returns fallback width when no metadata', () => {
    const result = resolvePdfCellOverlayWidth({
      item: baseItem,
      line: baseLine,
      translatedCellMetadata: null,
      cellIndex: 0,
      fallbackWidth: 80
    })

    expect(result).toBe(80)
  })

  it('returns fallback width when colSpanCandidate is false', () => {
    const result = resolvePdfCellOverlayWidth({
      item: baseItem,
      line: baseLine,
      translatedCellMetadata: {
        colSpanCandidates: [false],
        estimatedColSpans: [1]
      },
      cellIndex: 0,
      fallbackWidth: 80
    })

    expect(result).toBe(80)
  })

  it('returns fallback width when estimatedColSpan is 1', () => {
    const result = resolvePdfCellOverlayWidth({
      item: baseItem,
      line: baseLine,
      translatedCellMetadata: {
        colSpanCandidates: [true],
        estimatedColSpans: [1]
      },
      cellIndex: 0,
      fallbackWidth: 80
    })

    expect(result).toBe(80)
  })

  it('widens cell when estimatedColSpan is 2', () => {
    const result = resolvePdfCellOverlayWidth({
      item: baseItem,
      line: baseLine,
      translatedCellMetadata: {
        colSpanCandidates: [true],
        estimatedColSpans: [2]
      },
      cellIndex: 0,
      fallbackWidth: 80
    })

    expect(result).toBe(160)
  })

  it('widens cell when estimatedColSpan is 3', () => {
    const result = resolvePdfCellOverlayWidth({
      item: baseItem,
      line: baseLine,
      translatedCellMetadata: {
        colSpanCandidates: [true],
        estimatedColSpans: [3]
      },
      cellIndex: 0,
      fallbackWidth: 80
    })

    expect(result).toBe(240)
  })

  it('prefers canonical structured cell colSpan over legacy span metadata', () => {
    const result = resolvePdfCellOverlayWidth({
      item: baseItem,
      line: baseLine,
      structuredCell: {
        colSpan: 3
      },
      translatedCellMetadata: {
        colSpanCandidates: [false],
        estimatedColSpans: [1]
      },
      cellIndex: 0,
      fallbackWidth: 80
    })

    expect(result).toBe(240)
  })

  it('caps width by lineRight', () => {
    const result = resolvePdfCellOverlayWidth({
      item: { x: 200, width: 60, right: 260 },
      line: { boundingBox: { x: 40, y: 100, width: 300, height: 14 } },
      translatedCellMetadata: {
        colSpanCandidates: [true],
        estimatedColSpans: [3]
      },
      cellIndex: 0,
      fallbackWidth: 80
    })

    expect(result).toBe(140)
  })

  it('width never smaller than fallback', () => {
    const result = resolvePdfCellOverlayWidth({
      item: { x: 280, width: 60, right: 340 },
      line: { boundingBox: { x: 40, y: 100, width: 300, height: 14 } },
      translatedCellMetadata: {
        colSpanCandidates: [true],
        estimatedColSpans: [2]
      },
      cellIndex: 0,
      fallbackWidth: 60
    })

    expect(result).toBe(60)
  })

  it('returns fallback for invalid geometry', () => {
    const result = resolvePdfCellOverlayWidth({
      item: baseItem,
      line: { boundingBox: { x: 40, y: 100, width: -100, height: 14 } },
      translatedCellMetadata: {
        colSpanCandidates: [true],
        estimatedColSpans: [2]
      },
      cellIndex: 0,
      fallbackWidth: 80
    })

    expect(result).toBe(80)
  })

  it('returns fallback for invalid fallbackWidth', () => {
    const result = resolvePdfCellOverlayWidth({
      item: baseItem,
      line: baseLine,
      translatedCellMetadata: {
        colSpanCandidates: [true],
        estimatedColSpans: [2]
      },
      cellIndex: 0,
      fallbackWidth: NaN
    })

    expect(result).toBe(0)
  })
})
