import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { PdfOcrDetector } = await import('./PdfOcrDetector.js')
const { PdfOcrRecommendationEngine } = await import('./PdfOcrRecommendationEngine.js')

describe('PdfOcrRecommendationEngine', () => {
  let detectorSpy

  beforeEach(() => {
    detectorSpy = vi.spyOn(PdfOcrDetector.prototype, 'isScannedCandidate')
  })

  afterEach(() => {
    detectorSpy.mockRestore()
  })

  function createPageSession(pageNumber, overrides = {}) {
    return {
      pageNumber,
      loaded: true,
      logicalBlocks: [],
      textContent: { items: [] },
      ocrBlocks: [],
      ocrLanguage: null,
      ...overrides
    }
  }

  it('delegates structural classification to Detector and excludes already OCRd pages', () => {
    const pageSessions = [
      createPageSession(1),
      createPageSession(2, { ocrBlocks: [{ id: 'ocr-2' }], ocrLanguage: 'eng' })
    ]

    const engine = new PdfOcrRecommendationEngine()
    const recommendations = engine.getRecommendations(pageSessions)

    expect(recommendations).toEqual([1])
    expect(detectorSpy).toHaveBeenCalledTimes(2)
  })

  it('preserves recommendation behavior for scanned pages with no text blocks', () => {
    const pageSessions = [
      createPageSession(3, { textContent: { items: [] } }),
      createPageSession(1, { textContent: { items: [] } }),
      createPageSession(2, { textContent: { items: [] } })
    ]

    const engine = new PdfOcrRecommendationEngine()
    const recommendations = engine.getRecommendations(pageSessions)

    expect(recommendations).toEqual([1, 2, 3])
  })

  it('returns empty array when no PageSession qualifies', () => {
    const pageSessions = [
      createPageSession(1, {
        logicalBlocks: [{ id: 'block-1' }],
        textContent: { items: [{ str: 'hello' }] }
      })
    ]

    const engine = new PdfOcrRecommendationEngine()
    const recommendations = engine.getRecommendations(pageSessions)

    expect(recommendations).toEqual([])
  })

  it('returns empty array when no PageSessions supplied', () => {
    const engine = new PdfOcrRecommendationEngine()

    expect(engine.getRecommendations()).toEqual([])
  })

  it('returns stable recommendation results across repeated calls', () => {
    const pageSessions = [
      createPageSession(1, { textContent: { items: [] } }),
      createPageSession(2, { textContent: { items: [] } })
    ]

    const engine = new PdfOcrRecommendationEngine()

    expect(engine.getRecommendations(pageSessions)).toEqual([1, 2])
    expect(engine.getRecommendations(pageSessions)).toEqual([1, 2])
  })
})
