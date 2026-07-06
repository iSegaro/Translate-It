import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { CONTENT_VIEW } from './usePdfViewerMode.js'

vi.mock('../utils/pdfScrollAnchor.js', () => ({
  captureScrollAnchor: vi.fn(),
  capturePdfBackedScrollAnchor: vi.fn(),
  restoreScrollAnchor: vi.fn(),
  restorePdfBackedScrollAnchor: vi.fn(),
  isPdfAnchor: vi.fn()
}))

const { createPdfTransitionAnchor, PDF_SCROLL_OWNER, isPdfBackedContentView } = await import('./createPdfTransitionAnchor.js')
const scrollAnchor = await import('../utils/pdfScrollAnchor.js')

function createAnchor(options = {}) {
  const contentView = ref(options.contentView ?? CONTENT_VIEW.ORIGINAL)
  const isSideBySide = ref(options.isSideBySide ?? false)
  const showTranslatedTextPane = ref(options.showTranslatedTextPane ?? false)
  const showTranslatedPdfPane = ref(options.showTranslatedPdfPane ?? false)
  const session = ref(options.session ?? null)
  const originalScrollContainer = ref(options.originalScrollContainer ?? null)
  const translatedScrollContainer = ref(options.translatedScrollContainer ?? null)
  const zoomMode = ref(options.zoomMode ?? 'fit-width')
  const currentPage = ref(options.currentPage ?? 1)

  return createPdfTransitionAnchor({
    contentView,
    isSideBySide,
    showTranslatedTextPane,
    showTranslatedPdfPane,
    session,
    originalScrollContainer,
    translatedScrollContainer,
    zoomMode,
    currentPage
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createPdfTransitionAnchor', () => {
  describe('exports', () => {
    it('defines PDF_SCROLL_OWNER', () => {
      expect(PDF_SCROLL_OWNER).toEqual({ ORIGINAL: 'original', TRANSLATED: 'translated' })
    })

    it('isPdfBackedContentView returns true for ORIGINAL and TRANSLATED_PDF', () => {
      expect(isPdfBackedContentView(CONTENT_VIEW.ORIGINAL)).toBe(true)
      expect(isPdfBackedContentView(CONTENT_VIEW.TRANSLATED_PDF)).toBe(true)
    })

    it('isPdfBackedContentView returns false for TRANSLATION', () => {
      expect(isPdfBackedContentView(CONTENT_VIEW.TRANSLATION)).toBe(false)
    })
  })

  describe('resolveAnchorOwner', () => {
    it('returns explicit ORIGINAL owner', () => {
      const anchor = createAnchor()
      expect(anchor.resolveAnchorOwner(PDF_SCROLL_OWNER.ORIGINAL)).toBe(PDF_SCROLL_OWNER.ORIGINAL)
    })

    it('returns explicit TRANSLATED owner', () => {
      const anchor = createAnchor()
      expect(anchor.resolveAnchorOwner(PDF_SCROLL_OWNER.TRANSLATED)).toBe(PDF_SCROLL_OWNER.TRANSLATED)
    })

    it('returns TRANSLATED when contentView is TRANSLATION and no explicit owner', () => {
      const anchor = createAnchor({ contentView: CONTENT_VIEW.TRANSLATION })
      expect(anchor.resolveAnchorOwner()).toBe(PDF_SCROLL_OWNER.TRANSLATED)
    })

    it('returns ORIGINAL when contentView is ORIGINAL and no explicit owner', () => {
      const anchor = createAnchor({ contentView: CONTENT_VIEW.ORIGINAL })
      expect(anchor.resolveAnchorOwner()).toBe(PDF_SCROLL_OWNER.ORIGINAL)
    })

    it('returns ORIGINAL when contentView is TRANSLATED_PDF and no explicit owner', () => {
      const anchor = createAnchor({ contentView: CONTENT_VIEW.TRANSLATED_PDF })
      expect(anchor.resolveAnchorOwner()).toBe(PDF_SCROLL_OWNER.ORIGINAL)
    })
  })

  describe('resolveOwnerScrollTarget', () => {
    it('uses translated container with translated-page selector when showTranslatedTextPane', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({
        showTranslatedTextPane: true,
        translatedScrollContainer: container
      })
      const target = anchor.resolveOwnerScrollTarget(PDF_SCROLL_OWNER.TRANSLATED)
      expect(target.owner).toBe(PDF_SCROLL_OWNER.TRANSLATED)
      expect(target.container).toBe(container)
      expect(target.selector).toBe('.pdf-translated-page[data-page-number]')
    })

    it('uses translated container with pdf-page selector when showTranslatedPdfPane', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({
        showTranslatedPdfPane: true,
        translatedScrollContainer: container
      })
      const target = anchor.resolveOwnerScrollTarget(PDF_SCROLL_OWNER.TRANSLATED)
      expect(target.owner).toBe(PDF_SCROLL_OWNER.TRANSLATED)
      expect(target.container).toBe(container)
      expect(target.selector).toBe('.pdf-page[data-page-number]')
    })

    it('falls back to original container when owner is not TRANSLATED', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ originalScrollContainer: container })
      const target = anchor.resolveOwnerScrollTarget(PDF_SCROLL_OWNER.ORIGINAL)
      expect(target.owner).toBe(PDF_SCROLL_OWNER.ORIGINAL)
      expect(target.container).toBe(container)
    })

    it('falls back to original container when TRANSLATED has no translated container', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ originalScrollContainer: container, translatedScrollContainer: null })
      const target = anchor.resolveOwnerScrollTarget(PDF_SCROLL_OWNER.TRANSLATED)
      expect(target.owner).toBe(PDF_SCROLL_OWNER.ORIGINAL)
      expect(target.container).toBe(container)
    })

    it('returns container null when no containers exist', () => {
      const anchor = createAnchor({ originalScrollContainer: null, translatedScrollContainer: null })
      const target = anchor.resolveOwnerScrollTarget(PDF_SCROLL_OWNER.ORIGINAL)
      expect(target.container).toBeNull()
    })
  })

  describe('resolveLayoutTransitionTarget', () => {
    it('returns original target for ORIGINAL owner', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ originalScrollContainer: container })
      const target = anchor.resolveLayoutTransitionTarget(PDF_SCROLL_OWNER.ORIGINAL)
      expect(target.owner).toBe(PDF_SCROLL_OWNER.ORIGINAL)
      expect(target.container).toBe(container)
      expect(target.selector).toBe('.pdf-page[data-page-number]')
    })

    it('returns translated target with translated-page selector when showTranslatedTextPane', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ showTranslatedTextPane: true, translatedScrollContainer: container })
      const target = anchor.resolveLayoutTransitionTarget(PDF_SCROLL_OWNER.TRANSLATED)
      expect(target.owner).toBe(PDF_SCROLL_OWNER.TRANSLATED)
      expect(target.container).toBe(container)
      expect(target.selector).toBe('.pdf-translated-page[data-page-number]')
    })

    it('returns translated target with pdf-page selector when not showTranslatedTextPane', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ translatedScrollContainer: container })
      const target = anchor.resolveLayoutTransitionTarget(PDF_SCROLL_OWNER.TRANSLATED)
      expect(target.owner).toBe(PDF_SCROLL_OWNER.TRANSLATED)
      expect(target.container).toBe(container)
      expect(target.selector).toBe('.pdf-page[data-page-number]')
    })
  })

  describe('captureOwnedScrollAnchor', () => {
    it('captures anchor with owner tag', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ originalScrollContainer: container })
      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 1, offsetRatio: 0.5 })

      const result = anchor.captureOwnedScrollAnchor(PDF_SCROLL_OWNER.ORIGINAL)

      expect(scrollAnchor.captureScrollAnchor).toHaveBeenCalledWith(container, '.pdf-page[data-page-number]')
      expect(result).toEqual({ pageNumber: 1, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL })
    })

    it('returns null when captureScrollAnchor returns null', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ originalScrollContainer: container })
      scrollAnchor.captureScrollAnchor.mockReturnValue(null)

      const result = anchor.captureOwnedScrollAnchor(PDF_SCROLL_OWNER.ORIGINAL)

      expect(result).toBeNull()
    })
  })

  describe('capturePdfAwareOwnedScrollAnchor', () => {
    it('tries PDF-backed capture for ORIGINAL content view', () => {
      const container = document.createElement('div')
      const session = { getPageViewport: vi.fn() }
      const anchor = createAnchor({
        contentView: CONTENT_VIEW.ORIGINAL,
        originalScrollContainer: container,
        session
      })
      const pdfAnchor = { pageNumber: 1, offsetRatio: 0.5, pdfPoint: { x: 10, y: 20 } }
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(pdfAnchor)

      const result = anchor.capturePdfAwareOwnedScrollAnchor(PDF_SCROLL_OWNER.ORIGINAL)

      expect(scrollAnchor.capturePdfBackedScrollAnchor).toHaveBeenCalled()
      expect(result).toEqual({ owner: PDF_SCROLL_OWNER.ORIGINAL, ...pdfAnchor })
    })

    it('falls back to DOM capture when PDF-backed capture fails', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({
        contentView: CONTENT_VIEW.ORIGINAL,
        originalScrollContainer: container
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(null)
      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 2, offsetRatio: 0.3 })

      const result = anchor.capturePdfAwareOwnedScrollAnchor(PDF_SCROLL_OWNER.ORIGINAL)

      expect(result).toEqual({ pageNumber: 2, offsetRatio: 0.3, owner: PDF_SCROLL_OWNER.ORIGINAL })
    })

    it('uses DOM capture directly for TRANSLATION content view', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({
        contentView: CONTENT_VIEW.TRANSLATION,
        showTranslatedTextPane: true,
        translatedScrollContainer: container
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 3, offsetRatio: 0.7 })

      const result = anchor.capturePdfAwareOwnedScrollAnchor(PDF_SCROLL_OWNER.TRANSLATED)

      expect(scrollAnchor.capturePdfBackedScrollAnchor).not.toHaveBeenCalled()
      expect(result).toEqual({ pageNumber: 3, offsetRatio: 0.7, owner: PDF_SCROLL_OWNER.TRANSLATED })
    })
  })

  describe('captureLayoutTransitionAnchor', () => {
    it('prefers PDF-backed capture for ORIGINAL owner', () => {
      const container = document.createElement('div')
      const session = { getPageViewport: vi.fn() }
      const anchor = createAnchor({ originalScrollContainer: container, session })
      const pdfAnchor = { pageNumber: 1, offsetRatio: 0, pdfPoint: { x: 0, y: 0 } }
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(pdfAnchor)

      const result = anchor.captureLayoutTransitionAnchor(PDF_SCROLL_OWNER.ORIGINAL)

      expect(scrollAnchor.captureScrollAnchor).not.toHaveBeenCalled()
      expect(result).toEqual({ owner: PDF_SCROLL_OWNER.ORIGINAL, ...pdfAnchor })
    })

    it('falls back to DOM capture for ORIGINAL when PDF-backed fails', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ originalScrollContainer: container })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(null)
      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 2, offsetRatio: 0.4 })

      const result = anchor.captureLayoutTransitionAnchor(PDF_SCROLL_OWNER.ORIGINAL)

      expect(result).toEqual({ owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 2, offsetRatio: 0.4 })
    })

    it('uses DOM capture for TRANSLATED owner', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ showTranslatedTextPane: true, translatedScrollContainer: container })
      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 5, offsetRatio: 0.1 })

      const result = anchor.captureLayoutTransitionAnchor(PDF_SCROLL_OWNER.TRANSLATED)

      expect(scrollAnchor.capturePdfBackedScrollAnchor).not.toHaveBeenCalled()
      expect(result).toEqual({ owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 5, offsetRatio: 0.1 })
    })

    it('returns null when no container', () => {
      const anchor = createAnchor({ originalScrollContainer: null })
      const result = anchor.captureLayoutTransitionAnchor(PDF_SCROLL_OWNER.ORIGINAL)
      expect(result).toBeNull()
    })
  })

  describe('captureControlledTransitionAnchors', () => {
    it('captures both original and translated anchors', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ originalScrollContainer: container })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(null)
      scrollAnchor.captureScrollAnchor
        .mockReturnValueOnce({ pageNumber: 1, offsetRatio: 0 })
        .mockReturnValueOnce(null)

      const result = anchor.captureControlledTransitionAnchors()

      expect(result.originalAnchor).toEqual({ owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 1, offsetRatio: 0 })
      expect(result.translatedAnchor).toBeNull()
    })
  })

  describe('deriveTranslatedAnchorFromOriginal', () => {
    it('derives translated anchor from original', () => {
      const anchor = createAnchor()
      const result = anchor.deriveTranslatedAnchorFromOriginal({ pageNumber: 3, offsetRatio: 0.75, owner: PDF_SCROLL_OWNER.ORIGINAL })
      expect(result).toEqual({ owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 3, offsetRatio: 0.75 })
    })

    it('uses 0 for missing offsetRatio', () => {
      const anchor = createAnchor()
      const result = anchor.deriveTranslatedAnchorFromOriginal({ pageNumber: 1 })
      expect(result.offsetRatio).toBe(0)
    })

    it('returns null for null anchor', () => {
      const anchor = createAnchor()
      expect(anchor.deriveTranslatedAnchorFromOriginal(null)).toBeNull()
    })

    it('returns null for anchor without pageNumber', () => {
      const anchor = createAnchor()
      expect(anchor.deriveTranslatedAnchorFromOriginal({ offsetRatio: 0.5 })).toBeNull()
    })
  })

  describe('resolveTranslatedZoomAnchor', () => {
    it('returns capturedTranslatedAnchor when not side-by-side', () => {
      const anchor = createAnchor({ isSideBySide: false })
      const captured = { owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 2, offsetRatio: 0.5 }
      const result = anchor.resolveTranslatedZoomAnchor({ pageNumber: 1, offsetRatio: 0 }, captured)
      expect(result).toBe(captured)
    })

    it('derives from original when side-by-side', () => {
      const anchor = createAnchor({ isSideBySide: true })
      const captured = { owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 2, offsetRatio: 0.5 }
      const original = { pageNumber: 1, offsetRatio: 0.3, owner: PDF_SCROLL_OWNER.ORIGINAL }
      const result = anchor.resolveTranslatedZoomAnchor(original, captured)
      expect(result).toEqual({ owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 1, offsetRatio: 0.3 })
    })

    it('falls back to capturedTranslatedAnchor when original is null', () => {
      const anchor = createAnchor({ isSideBySide: true })
      const captured = { owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 2, offsetRatio: 0.5 }
      const result = anchor.resolveTranslatedZoomAnchor(null, captured)
      expect(result).toBe(captured)
    })
  })

  describe('restoreOwnedScrollAnchor', () => {
    it('returns null for null anchor', () => {
      const anchor = createAnchor()
      expect(anchor.restoreOwnedScrollAnchor(null)).toBeNull()
    })

    it('uses PDF-backed restoration for PDF anchors', () => {
      const container = document.createElement('div')
      const session = { getPageViewport: vi.fn() }
      const anchor = createAnchor({ originalScrollContainer: container, session, zoomMode: 'fit-width' })
      scrollAnchor.isPdfAnchor.mockReturnValue(true)
      scrollAnchor.restorePdfBackedScrollAnchor.mockReturnValue(true)

      const result = anchor.restoreOwnedScrollAnchor({ owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 1, pdfPoint: { x: 0, y: 0 } })

      expect(scrollAnchor.restorePdfBackedScrollAnchor).toHaveBeenCalled()
      expect(result).toBe(PDF_SCROLL_OWNER.ORIGINAL)
    })

    it('falls back to DOM restore when PDF-backed restore fails', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ originalScrollContainer: container })
      scrollAnchor.isPdfAnchor.mockReturnValue(true)
      scrollAnchor.restorePdfBackedScrollAnchor.mockReturnValue(false)
      scrollAnchor.restoreScrollAnchor.mockReturnValue(true)

      const result = anchor.restoreOwnedScrollAnchor({ owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 1, pdfPoint: { x: 0, y: 0 } })

      expect(scrollAnchor.restoreScrollAnchor).toHaveBeenCalled()
      expect(result).toBe(PDF_SCROLL_OWNER.ORIGINAL)
    })

    it('tries fallback owner when primary DOM restore fails', () => {
      const originalContainer = document.createElement('div')
      const translatedContainer = document.createElement('div')
      const anchor = createAnchor({
        originalScrollContainer: originalContainer,
        translatedScrollContainer: translatedContainer,
        showTranslatedTextPane: true
      })
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      scrollAnchor.restoreScrollAnchor.mockReturnValueOnce(false).mockReturnValueOnce(true)

      const result = anchor.restoreOwnedScrollAnchor({ owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 1, offsetRatio: 0.5 })

      expect(scrollAnchor.restoreScrollAnchor).toHaveBeenCalledTimes(2)
      expect(result).toBe(PDF_SCROLL_OWNER.TRANSLATED)
    })

    it('returns null when all restore attempts fail', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ originalScrollContainer: container })
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      scrollAnchor.restoreScrollAnchor.mockReturnValue(false)

      const result = anchor.restoreOwnedScrollAnchor({ owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 1, offsetRatio: 0.5 })

      expect(scrollAnchor.restoreScrollAnchor).toHaveBeenCalledTimes(2)
      expect(result).toBeNull()
    })
  })

  describe('restoreControlledTransitionAnchors', () => {
    it('restores original and translated anchors, returns original owner', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ originalScrollContainer: container })
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      scrollAnchor.restoreScrollAnchor.mockReturnValue(true)

      const result = anchor.restoreControlledTransitionAnchors({
        originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 1, offsetRatio: 0.5 },
        translatedAnchor: { owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 1, offsetRatio: 0.5 }
      })

      expect(scrollAnchor.restoreScrollAnchor).toHaveBeenCalledTimes(2)
      expect(result).toBe(PDF_SCROLL_OWNER.ORIGINAL)
    })

    it('skips translated restore when translatedAnchor is null', () => {
      const container = document.createElement('div')
      const anchor = createAnchor({ originalScrollContainer: container })
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      scrollAnchor.restoreScrollAnchor.mockReturnValue(true)

      anchor.restoreControlledTransitionAnchors({
        originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 1, offsetRatio: 0.5 },
        translatedAnchor: null
      })

      expect(scrollAnchor.restoreScrollAnchor).toHaveBeenCalledTimes(1)
    })
  })

  describe('normalizeFitPagePdfAnchor', () => {
    it('returns null for null anchor', () => {
      const anchor = createAnchor()
      expect(anchor.normalizeFitPagePdfAnchor(null)).toBeNull()
    })

    it('normalizes PDF anchor with viewport', () => {
      scrollAnchor.isPdfAnchor.mockReturnValue(true)
      const session = { getPageViewport: vi.fn().mockReturnValue({ convertToPdfPoint: vi.fn().mockReturnValue([0, 50]) }) }
      const anchor = createAnchor({ session })

      const result = anchor.normalizeFitPagePdfAnchor({
        pageNumber: 1,
        offsetRatio: 0.5,
        pdfPoint: { x: 10, y: 20 }
      })

      expect(result.pdfPoint.y).toBe(50)
      expect(result.offsetRatio).toBe(0)
    })

    it('handles missing viewport gracefully in PDF branch', () => {
      scrollAnchor.isPdfAnchor.mockReturnValue(true)
      const session = { getPageViewport: vi.fn().mockReturnValue(null) }
      const anchor = createAnchor({ session })

      const result = anchor.normalizeFitPagePdfAnchor({
        pageNumber: 1,
        offsetRatio: 0.5,
        pdfPoint: { x: 10, y: 20 }
      })

      expect(session.getPageViewport).toHaveBeenCalledWith(1)
      expect(result.offsetRatio).toBe(0)
    })

    it('normalizes non-PDF anchor by zeroing offsetRatio', () => {
      const anchor = createAnchor()
      scrollAnchor.isPdfAnchor.mockReturnValue(false)

      const result = anchor.normalizeFitPagePdfAnchor({ pageNumber: 1, offsetRatio: 0.5 })

      expect(result.offsetRatio).toBe(0)
    })
  })

  describe('normalizeFitPageDomRootAnchor', () => {
    it('returns null for null anchor', () => {
      const anchor = createAnchor()
      expect(anchor.normalizeFitPageDomRootAnchor(null)).toBeNull()
    })

    it('returns unmodified anchor for anchor without pageNumber', () => {
      const anchor = createAnchor()
      const input = { owner: PDF_SCROLL_OWNER.ORIGINAL }
      expect(anchor.normalizeFitPageDomRootAnchor(input)).toBe(input)
    })

    it('zeroes offsetRatio while preserving owner and pageNumber', () => {
      const anchor = createAnchor()
      const result = anchor.normalizeFitPageDomRootAnchor({ owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 3, offsetRatio: 0.8 })
      expect(result).toEqual({ owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 3, offsetRatio: 0 })
    })
  })
})
