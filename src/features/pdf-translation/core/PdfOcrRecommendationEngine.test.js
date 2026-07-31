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

    const recommendations = new PdfOcrRecommendationEngine().getRecommendations(candidates, 'eng')

    expect(recommendations).toEqual([1])
    expect(detectorSpy).toHaveBeenCalledTimes(2)
  })

  it('recommends a page whose existing OCR uses a different language', () => {
    const candidates = [createCandidate(1, { hasOcrBlocks: true, ocrLanguage: 'eng' })]

    const recommendations = new PdfOcrRecommendationEngine().getRecommendations(candidates, 'fra')

    expect(recommendations).toEqual([1])
  })

  it('keeps pages without OCR blocks eligible for recommendation', () => {
    const candidates = [createCandidate(1, { hasOcrBlocks: false, ocrLanguage: null })]

    const recommendations = new PdfOcrRecommendationEngine().getRecommendations(candidates, 'fra')

    expect(recommendations).toEqual([1])
  })

  it('keeps scanned-page rejection unchanged across language changes', () => {
    const candidates = [createCandidate(1, {
      hasOcrBlocks: true,
      ocrLanguage: 'eng',
      logicalBlockCount: 2,
      textItemCount: 10,
      textCharCount: 40
    })]

    const recommendations = new PdfOcrRecommendationEngine().getRecommendations(candidates, 'fra')

    expect(recommendations).toEqual([])
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
