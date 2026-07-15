import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { PdfOcrDetector } = await import('./PdfOcrDetector.js')
const { PdfOcrRecommendationEngine } = await import('./PdfOcrRecommendationEngine.js')

describe('PdfOcrRecommendationEngine', () => {
  let session
  let detectSpy

  beforeEach(() => {
    session = {
      pageSessions: new Map(),
      visiblePageNumbers: new Set()
    }
    detectSpy = vi.spyOn(PdfOcrDetector.prototype, 'detectScannedPages')
  })

  afterEach(() => {
    detectSpy.mockRestore()
  })

  function setupPageSession(pageNumber, { loaded = true, logicalBlocks = [], textContent = null, ocrBlocks = [] } = {}) {
    session.pageSessions.set(pageNumber, {
      loaded,
      logicalBlocks,
      textContent,
      ocrBlocks,
      ocrLanguage: ocrBlocks.length > 0 ? 'eng' : null
    })
    session.visiblePageNumbers.add(pageNumber)
  }

  it('recommends scanned pages that have not been OCRd', () => {
    setupPageSession(1, { textContent: { items: [] } })
    setupPageSession(2, { textContent: { items: [] } })

    const engine = new PdfOcrRecommendationEngine(session)
    const recommendations = engine.getRecommendations()

    expect(recommendations).toEqual([1, 2])
    expect(detectSpy).toHaveBeenCalledTimes(1)
  })

  it('excludes already-OCRd pages from recommendations', () => {
    setupPageSession(1, { textContent: { items: [] } })
    setupPageSession(2, { textContent: { items: [] }, ocrBlocks: [{ id: 'ocr-1' }] })

    const engine = new PdfOcrRecommendationEngine(session)
    const recommendations = engine.getRecommendations()

    expect(recommendations).toEqual([1])
  })

  it('excludes pages with extractable text blocks', () => {
    setupPageSession(1, { textContent: { items: [] } })
    setupPageSession(2, { logicalBlocks: [{ id: 'b1' }], textContent: { items: [{ str: 'hello' }] } })

    const engine = new PdfOcrRecommendationEngine(session)
    const recommendations = engine.getRecommendations()

    expect(recommendations).toEqual([1])
  })

  it('excludes pages that are not visible', () => {
    setupPageSession(1, { textContent: { items: [] } })
    setupPageSession(2, { textContent: { items: [] } })
    session.visiblePageNumbers.delete(2)

    const engine = new PdfOcrRecommendationEngine(session)
    const recommendations = engine.getRecommendations()

    expect(recommendations).toEqual([1])
  })

  it('returns empty array when no pages need OCR', () => {
    setupPageSession(1, { logicalBlocks: [{ id: 'b1' }], textContent: { items: [{ str: 'hello' }] } })

    const engine = new PdfOcrRecommendationEngine(session)
    const recommendations = engine.getRecommendations()

    expect(recommendations).toEqual([])
  })

  it('returns empty array when all scanned pages are already OCRd', () => {
    setupPageSession(1, { textContent: { items: [] }, ocrBlocks: [{ id: 'ocr-1' }] })

    const engine = new PdfOcrRecommendationEngine(session)
    const recommendations = engine.getRecommendations()

    expect(recommendations).toEqual([])
  })

  it('returns empty array when no page sessions exist', () => {
    const engine = new PdfOcrRecommendationEngine(session)
    const recommendations = engine.getRecommendations()

    expect(recommendations).toEqual([])
  })

  it('returns recommendations in ascending page-number order', () => {
    setupPageSession(3, { textContent: { items: [] } })
    setupPageSession(1, { textContent: { items: [] } })
    setupPageSession(2, { textContent: { items: [] } })

    const engine = new PdfOcrRecommendationEngine(session)
    const recommendations = engine.getRecommendations()

    expect(recommendations).toEqual([1, 2, 3])
  })
})
