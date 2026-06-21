import { beforeEach, describe, expect, it } from 'vitest'

const { PdfOcrDetector } = await import('./PdfOcrDetector.js')

describe('PdfOcrDetector', () => {
  let session

  beforeEach(() => {
    session = {
      pageSessions: new Map(),
      visiblePageNumbers: new Set()
    }
  })

  function setupPageSession(pageNumber, { loaded = true, logicalBlocks = [], textContent = null } = {}) {
    session.pageSessions.set(pageNumber, {
      loaded,
      logicalBlocks,
      textContent,
      ocrBlocks: [],
      ocrLanguage: null
    })
    session.visiblePageNumbers.add(pageNumber)
  }

  it('detects scanned candidate when no text items and no blocks', () => {
    setupPageSession(1, {
      loaded: true,
      logicalBlocks: [],
      textContent: { items: [] }
    })

    const detector = new PdfOcrDetector(session)
    const results = detector.detectScannedPages()

    expect(results).toHaveLength(1)
    expect(results[0].pageNumber).toBe(1)
    expect(results[0].isScannedCandidate).toBe(true)
  })

  it('does not detect when logical blocks exist', () => {
    setupPageSession(1, {
      loaded: true,
      logicalBlocks: [{ id: 'b1' }],
      textContent: { items: [] }
    })

    const detector = new PdfOcrDetector(session)
    const results = detector.detectScannedPages()

    expect(results).toHaveLength(0)
  })

  it('does not detect when text items exceed threshold', () => {
    setupPageSession(1, {
      loaded: true,
      logicalBlocks: [],
      textContent: { items: Array.from({ length: 10 }, (_, i) => ({ str: `item${i}` })) }
    })

    const detector = new PdfOcrDetector(session, { minTextItems: 5 })
    const results = detector.detectScannedPages()

    expect(results).toHaveLength(0)
  })

  it('does not detect when page is not loaded', () => {
    setupPageSession(1, {
      loaded: false,
      logicalBlocks: [],
      textContent: { items: [] }
    })

    const detector = new PdfOcrDetector(session)
    const results = detector.detectScannedPages()

    expect(results).toHaveLength(0)
  })

  it('only checks visible pages', () => {
    setupPageSession(1, {
      loaded: true,
      logicalBlocks: [],
      textContent: { items: [] }
    })
    setupPageSession(2, {
      loaded: true,
      logicalBlocks: [],
      textContent: { items: [] }
    })
    session.visiblePageNumbers.delete(2)

    const detector = new PdfOcrDetector(session)
    const results = detector.detectScannedPages()

    expect(results).toHaveLength(1)
    expect(results[0].pageNumber).toBe(1)
  })

  it('hasScannedPages returns true when pending OCR pages exist', () => {
    setupPageSession(1, {
      loaded: true,
      logicalBlocks: [],
      textContent: { items: [] }
    })

    const detector = new PdfOcrDetector(session)
    expect(detector.hasScannedPages()).toBe(true)
  })

  it('hasScannedPages returns false when all scanned pages already OCRd', () => {
    setupPageSession(1, {
      loaded: true,
      logicalBlocks: [],
      textContent: { items: [] }
    })
    session.pageSessions.get(1).ocrBlocks = [{ id: 'ocr-1' }]

    const detector = new PdfOcrDetector(session)
    expect(detector.hasScannedPages()).toBe(false)
  })

  it('getScannedPageCount excludes already OCRd pages', () => {
    setupPageSession(1, {
      loaded: true,
      logicalBlocks: [],
      textContent: { items: [] }
    })
    setupPageSession(2, {
      loaded: true,
      logicalBlocks: [],
      textContent: { items: [] }
    })
    session.pageSessions.get(1).ocrBlocks = [{ id: 'ocr-1' }]

    const detector = new PdfOcrDetector(session)
    expect(detector.getScannedPageCount()).toBe(1)
  })
})
