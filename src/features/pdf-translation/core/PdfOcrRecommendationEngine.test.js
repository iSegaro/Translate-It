import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { PdfOcrDetector } = await import('./PdfOcrDetector.js')
const { PdfOcrRecommendationEngine } = await import('./PdfOcrRecommendationEngine.js')

function createCandidate(pageNumber, overrides = {}) {
  return {
    pageNumber,
    logicalBlockCount: 0,
    textItemCount: 0,
    textCharCount: 0,
    hasOcrBlocks: false,
    ocrLanguage: null,
    ...overrides
  }
}

describe('PdfOcrRecommendationEngine', () => {
  let detectorSpy

  beforeEach(() => {
    detectorSpy = vi.spyOn(PdfOcrDetector.prototype, 'isScannedCandidate')
  })

  afterEach(() => {
    detectorSpy.mockRestore()
  })

  it('delegates candidate classification and excludes already OCRd pages', () => {
    const candidates = [createCandidate(1), createCandidate(2, { hasOcrBlocks: true, ocrLanguage: 'eng' })]

    const recommendations = new PdfOcrRecommendationEngine().getRecommendations(candidates)

    expect(recommendations).toEqual([1])
    expect(detectorSpy).toHaveBeenCalledTimes(2)
  })

  it('sorts scanned candidate recommendations', () => {
    const candidates = [createCandidate(3), createCandidate(1), createCandidate(2)]

    expect(new PdfOcrRecommendationEngine().getRecommendations(candidates)).toEqual([1, 2, 3])
  })

  it('returns no recommendation for candidate with source blocks', () => {
    expect(new PdfOcrRecommendationEngine().getRecommendations([
      createCandidate(1, { logicalBlockCount: 1, textItemCount: 1, textCharCount: 5 })
    ])).toEqual([])
  })
})
