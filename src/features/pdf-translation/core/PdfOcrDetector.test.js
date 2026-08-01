import { beforeEach, describe, expect, it, vi } from 'vitest'

const { PdfOcrDetector } = await import('./PdfOcrDetector.js')

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

describe('PdfOcrDetector', () => {
  let session
  let candidates

  beforeEach(() => {
    candidates = []
    session = {
      getLoadedVisibleOcrCandidates: vi.fn(() => candidates)
    }
  })

  it('detects scanned candidates from committed candidate summaries', () => {
    candidates.push(createCandidate(1))

    const results = new PdfOcrDetector(session).detectScannedPages()

    expect(results).toEqual([{
      pageNumber: 1,
      isScannedCandidate: true,
      alreadyOcrd: false,
      ocrLanguage: null
    }])
  })

  it('preserves threshold behavior for blocks, text items, and text characters', () => {
    const detector = new PdfOcrDetector(session, { minTextItems: 5, minTextChars: 20 })

    expect(detector.isScannedCandidate(createCandidate(1, { logicalBlockCount: 1 }))).toBe(false)
    expect(detector.isScannedCandidate(createCandidate(1, { textItemCount: 6 }))).toBe(false)
    expect(detector.isScannedCandidate(createCandidate(1, { textCharCount: 21 }))).toBe(false)
    expect(detector.isScannedCandidate(createCandidate(1))).toBe(true)
  })

  it('preserves page ordering and OCR language state', () => {
    candidates.push(
      createCandidate(2, { hasOcrBlocks: true, ocrLanguage: 'eng' }),
      createCandidate(1)
    )

    const results = new PdfOcrDetector(session).detectScannedPages()

    expect(results.map(result => result.pageNumber)).toEqual([1, 2])
    expect(results[1]).toMatchObject({ alreadyOcrd: true, ocrLanguage: 'eng' })
  })

  it('uses candidate summaries without raw session storage', () => {
    candidates.push(createCandidate(1))

    new PdfOcrDetector(session).getScannedPageCount()

    expect(session.getLoadedVisibleOcrCandidates).toHaveBeenCalledOnce()
  })

  it('excludes already OCRd scanned pages from the recommendation count', () => {
    candidates.push(createCandidate(1, { hasOcrBlocks: true }), createCandidate(2))

    const detector = new PdfOcrDetector(session)
    expect(detector.getScannedPageCount()).toBe(1)
    expect(detector.hasScannedPages()).toBe(true)
  })
})
