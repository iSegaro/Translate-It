import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

vi.mock('../utils/pdfScrollAnchor.js', () => ({
  captureScrollAnchor: vi.fn(),
  capturePdfBackedScrollAnchor: vi.fn(),
  isPdfAnchor: vi.fn()
}))

vi.mock('../utils/pdfFitPageFootprint.js', () => ({
  resolvePdfCanvasSlot: vi.fn(() => ({ availableCanvasWidth: 800, availableCanvasHeight: 600 }))
}))

vi.mock('./createPdfTransitionAnchor.js', () => {
  const PDF_SCROLL_OWNER = Object.freeze({ ORIGINAL: 'original', TRANSLATED: 'translated' })
  return {
    PDF_SCROLL_OWNER,
    isPdfBackedContentView: vi.fn((view) => view === 'original' || view === 'translated-pdf'),
    createPdfTransitionAnchor: vi.fn()
  }
})

const { CONTENT_VIEW } = await import('./usePdfViewerMode.js')
const { createPdfTransitionController } = await import('./createPdfTransitionController.js')
const scrollAnchor = await import('../utils/pdfScrollAnchor.js')
const pdfTransitionAnchor = await import('./createPdfTransitionAnchor.js')
const { PDF_SCROLL_OWNER } = pdfTransitionAnchor

function createController(options = {}) {
  const contentView = ref(options.contentView ?? CONTENT_VIEW.ORIGINAL)
  const isSideBySide = ref(options.isSideBySide ?? false)
  const showTranslatedTextPane = ref(options.showTranslatedTextPane ?? false)
  const showTranslatedPdfPane = ref(options.showTranslatedPdfPane ?? false)
  const session = ref(options.session ?? null)
  const hasDocument = ref(options.hasDocument ?? true)
  const currentPage = ref(options.currentPage ?? 1)
  const originalScrollContainer = ref(options.originalScrollContainer ?? null)
  const translatedScrollContainer = ref(options.translatedScrollContainer ?? null)

  const setContentView = vi.fn((val) => { contentView.value = val })
  const setLayoutMode = vi.fn()
  const recomputeLayout = options.recomputeLayout || vi.fn().mockResolvedValue()

  const pdfViewerRef = ref(options.pdfViewerRef ?? null)
  const pdfTranslatedPaneRef = ref(null)
  const pdfViewerLayoutRef = ref({
    setScrollSyncSuppressed: vi.fn(),
    syncFromPane: vi.fn()
  })

  const ctrl = createPdfTransitionController({
    contentView,
    isSideBySide,
    showTranslatedTextPane,
    showTranslatedPdfPane,
    setContentView,
    setLayoutMode,
    session,
    hasDocument,
    recomputeLayout,
    currentPage,
    originalScrollContainer,
    translatedScrollContainer,
    pdfViewerRef,
    pdfTranslatedPaneRef,
    pdfViewerLayoutRef
  })

  return { ctrl, contentView, isSideBySide, currentPage, setContentView, setLayoutMode, recomputeLayout, pdfViewerLayoutRef, pdfViewerRef }
}

let anchorFns

beforeEach(() => {
  vi.clearAllMocks()

  anchorFns = {
    resolveAnchorOwner: vi.fn(),
    resolveOwnerScrollTarget: vi.fn(),
    resolveLayoutTransitionTarget: vi.fn(),
    captureOwnedScrollAnchor: vi.fn(),
    captureLayoutTransitionAnchor: vi.fn(),
    capturePdfAwareOwnedScrollAnchor: vi.fn(),
    captureControlledTransitionAnchors: vi.fn(),
    restoreOwnedScrollAnchor: vi.fn(),
    restoreControlledTransitionAnchors: vi.fn(),
    deriveTranslatedAnchorFromOriginal: vi.fn(),
    resolveTranslatedZoomAnchor: vi.fn(),
    normalizeFitPagePdfAnchor: vi.fn(),
    normalizeFitPageDomRootAnchor: vi.fn()
  }

  pdfTransitionAnchor.createPdfTransitionAnchor.mockReturnValue(anchorFns)
})

describe('createPdfTransitionController', () => {
  describe('handleContentViewChange', () => {
    it('preserves PDF-backed anchor when switching between PDF-backed views', async () => {
      const { ctrl, setContentView } = createController()

      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })

      const pdfAnchor = { pageNumber: 1, offsetRatio: 0, pdfPoint: { x: 0, y: 0 } }
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(pdfAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(true)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)

      expect(scrollAnchor.capturePdfBackedScrollAnchor).toHaveBeenCalled()
      expect(setContentView).toHaveBeenCalledWith(CONTENT_VIEW.TRANSLATED_PDF)
      expect(anchorFns.restoreOwnedScrollAnchor).toHaveBeenCalledWith(
        expect.objectContaining({ owner: PDF_SCROLL_OWNER.ORIGINAL, pdfPoint: { x: 0, y: 0 } })
      )
    })

    it('normalizes anchor during TRANSLATION to PDF-backed transition', async () => {
      const { ctrl, setContentView, currentPage } = createController({ contentView: CONTENT_VIEW.TRANSLATION })

      currentPage.value = 5
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.TRANSLATED)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        container: document.createElement('div'),
        selector: '.pdf-translated-page[data-page-number]'
      })

      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 2, offsetRatio: 0.5 })
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.ORIGINAL)

      expect(scrollAnchor.capturePdfBackedScrollAnchor).not.toHaveBeenCalled()
      expect(scrollAnchor.captureScrollAnchor).toHaveBeenCalled()
      expect(setContentView).toHaveBeenCalledWith(CONTENT_VIEW.ORIGINAL)
      expect(anchorFns.restoreOwnedScrollAnchor).toHaveBeenCalledWith(
        expect.objectContaining({ pageNumber: 5, offsetRatio: 0 })
      )
    })

    it('uses DOM capture when switching from PDF-backed view to TRANSLATION', async () => {
      const { ctrl, setContentView } = createController()

      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })

      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 3, offsetRatio: 0.3 })
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      expect(scrollAnchor.capturePdfBackedScrollAnchor).not.toHaveBeenCalled()
      expect(scrollAnchor.captureScrollAnchor).toHaveBeenCalled()
      expect(setContentView).toHaveBeenCalledWith(CONTENT_VIEW.TRANSLATION)
    })

    it('triggers side-by-side sync after restore when isSideBySide is true', async () => {
      const { ctrl, setContentView, pdfViewerLayoutRef } = createController({ isSideBySide: true })

      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })

      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 1, offsetRatio: 0 })
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      expect(pdfViewerLayoutRef.value.syncFromPane).toHaveBeenCalled()
    })
  })

  describe('handleLayoutModeChange', () => {
    it('captures PDF-aware anchor and restores via DOM path', async () => {
      const { ctrl, setLayoutMode } = createController()

      const domAnchor = { pageNumber: 2, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleLayoutModeChange('side-by-side')

      expect(anchorFns.capturePdfAwareOwnedScrollAnchor).toHaveBeenCalledWith(PDF_SCROLL_OWNER.ORIGINAL)
      expect(setLayoutMode).toHaveBeenCalledWith('side-by-side')
      expect(anchorFns.restoreOwnedScrollAnchor).toHaveBeenCalledWith(domAnchor)
    })

    it('freezes render window eviction before layout mode changes', async () => {
      const { ctrl, setLayoutMode } = createController()

      const domAnchor = { pageNumber: 2, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      setLayoutMode.mockImplementation(() => {
        expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)
      })

      await ctrl.handleLayoutModeChange('side-by-side')

      expect(setLayoutMode).toHaveBeenCalledWith('side-by-side')
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
    })

    it('keeps render window eviction frozen during layout anchor restore', async () => {
      const { ctrl } = createController()

      const domAnchor = { pageNumber: 2, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockImplementation(() => {
        expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)
        return PDF_SCROLL_OWNER.ORIGINAL
      })

      await ctrl.handleLayoutModeChange('side-by-side')

      expect(anchorFns.restoreOwnedScrollAnchor).toHaveBeenCalledWith(domAnchor)
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
    })

    it('releases render window eviction freeze when layout mode change throws', async () => {
      const { ctrl, setLayoutMode } = createController()

      const domAnchor = { pageNumber: 2, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      setLayoutMode.mockImplementation(() => {
        throw new Error('layout failed')
      })

      await expect(ctrl.handleLayoutModeChange('side-by-side')).rejects.toThrow('layout failed')

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
    })

    it('skips DOM restore when anchor is PDF-backed', async () => {
      const { ctrl, setLayoutMode } = createController()

      const pdfAnchor = { pageNumber: 1, offsetRatio: 0, pdfPoint: { x: 0, y: 0 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(pdfAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(true)

      await ctrl.handleLayoutModeChange('single')

      expect(setLayoutMode).toHaveBeenCalledWith('single')
      expect(anchorFns.restoreOwnedScrollAnchor).not.toHaveBeenCalled()
    })
  })

  describe('handleLayoutChange', () => {
    it('exits early when dimensions are unchanged', async () => {
      const { ctrl, recomputeLayout } = createController()

      await ctrl.handleLayoutChange({ width: 0, height: 0 })

      expect(recomputeLayout).not.toHaveBeenCalled()
    })

    it('defers layout change during controlled zoom and applies after zoom', async () => {
      const { ctrl, recomputeLayout } = createController()

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { pageNumber: 1, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL },
        translatedAnchor: null
      })
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveTranslatedZoomAnchor.mockImplementation((a) => a)
      anchorFns.normalizeFitPagePdfAnchor.mockImplementation((a) => a)

      const zoomPromise = ctrl.handleZoomChange({ mode: 'fit-page' })

      await ctrl.handleLayoutChange({ width: 500, height: 400 })

      await zoomPromise

      expect(recomputeLayout).toHaveBeenCalledWith(
        expect.objectContaining({ availableCanvasWidth: 800, availableCanvasHeight: 600 })
      )
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalled()
    })

    it('does not restore stale PDF-backed anchor during resize after successful content view restore', async () => {
      const { ctrl, recomputeLayout } = createController()

      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })

      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue({ pageNumber: 1, pdfPoint: { x: 0, y: 0 } })
      scrollAnchor.isPdfAnchor.mockReturnValue(true)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)
      await new Promise(resolve => requestAnimationFrame(resolve))

      const freshAnchors = {
        originalAnchor: { pageNumber: 40, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.ORIGINAL },
        translatedAnchor: null
      }
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        ...freshAnchors
      })
      recomputeLayout.mockImplementationOnce(() => {
        expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
        return Promise.resolve()
      })

      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith(freshAnchors)
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
    })

    it('freezes render window eviction for layout recompute during controlled layout transition', async () => {
      const { ctrl, recomputeLayout } = createController()

      const domAnchor = { pageNumber: 2, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      const layoutModeTransition = ctrl.handleLayoutModeChange('side-by-side')

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: domAnchor,
        translatedAnchor: null
      })
      recomputeLayout.mockImplementationOnce(() => {
        expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)
        return Promise.resolve()
      })

      await ctrl.handleLayoutChange({ width: 800, height: 600 })
      await layoutModeTransition

      expect(recomputeLayout).toHaveBeenCalled()
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
    })

    it('releases render window eviction freeze when controlled layout recompute fails', async () => {
      const { ctrl, recomputeLayout } = createController()

      const domAnchor = { pageNumber: 2, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleLayoutModeChange('side-by-side')

      recomputeLayout.mockRejectedValueOnce(new Error('layout failed'))

      await expect(ctrl.handleLayoutChange({ width: 800, height: 600 })).rejects.toThrow('layout failed')

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
    })

    it('captures, recomputes, and restores for normal resize', async () => {
      vi.useFakeTimers()
      try {
        const { ctrl, recomputeLayout } = createController()

        anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
        anchorFns.resolveOwnerScrollTarget.mockReturnValue({
          owner: PDF_SCROLL_OWNER.ORIGINAL,
          container: document.createElement('div'),
          selector: '.pdf-page[data-page-number]'
        })
        scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 1, offsetRatio: 0 })
        scrollAnchor.isPdfAnchor.mockReturnValue(false)
        anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

        await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

        vi.advanceTimersByTime(100)

        const anchors = {
          originalAnchor: { pageNumber: 2, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL },
          translatedAnchor: null
        }
        anchorFns.captureControlledTransitionAnchors.mockReturnValue(anchors)
        anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

        await ctrl.handleLayoutChange({ width: 800, height: 600 })

        expect(anchorFns.captureControlledTransitionAnchors).toHaveBeenCalled()
        expect(recomputeLayout).toHaveBeenCalled()
        expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith(anchors)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('handleZoomChange', () => {
    it('applies fit-page entry normalization and restores', async () => {
      const { ctrl, recomputeLayout } = createController()

      const domAnchor = { pageNumber: 2, offsetRatio: 0, owner: PDF_SCROLL_OWNER.ORIGINAL }
      const normalizedAnchor = { pageNumber: 2, offsetRatio: 0, owner: PDF_SCROLL_OWNER.ORIGINAL, pdfPoint: { x: 0, y: 0 } }

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: domAnchor,
        translatedAnchor: null
      })
      anchorFns.normalizeFitPagePdfAnchor.mockReturnValue(normalizedAnchor)
      anchorFns.resolveTranslatedZoomAnchor.mockReturnValue(null)
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleZoomChange({ mode: 'fit-page' })

      expect(anchorFns.normalizeFitPagePdfAnchor).toHaveBeenCalledWith(domAnchor)
      expect(ctrl.zoomMode.value).toBe('fit-page')
      expect(recomputeLayout).toHaveBeenCalled()
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalled()
    })

    it('applies fit-width exit normalization when near page top', async () => {
      const { ctrl } = createController()

      ctrl.zoomMode.value = 'fit-page'

      const nearTopAnchor = { pageNumber: 2, offsetRatio: 0.005, owner: PDF_SCROLL_OWNER.ORIGINAL }
      const rootAnchor = { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 2, offsetRatio: 0 }

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: nearTopAnchor,
        translatedAnchor: null
      })
      anchorFns.normalizeFitPageDomRootAnchor.mockReturnValue(rootAnchor)
      anchorFns.resolveTranslatedZoomAnchor.mockReturnValue(null)
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleZoomChange({ mode: 'fit-width' })

      expect(anchorFns.normalizeFitPageDomRootAnchor).toHaveBeenCalledWith(nearTopAnchor)
      expect(ctrl.zoomMode.value).toBe('fit-width')
    })

    it('captures and restores for percent zoom change', async () => {
      const { ctrl, recomputeLayout } = createController()

      const originalAnchor = { pageNumber: 1, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor,
        translatedAnchor: null
      })
      anchorFns.resolveTranslatedZoomAnchor.mockReturnValue(null)
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleZoomChange({ mode: 'percent', value: 150 })

      expect(ctrl.zoomMode.value).toBe('percent')
      expect(ctrl.zoomPercent.value).toBe(150)
      expect(anchorFns.captureControlledTransitionAnchors).toHaveBeenCalled()
      expect(recomputeLayout).toHaveBeenCalled()
    })

    it('keeps render window eviction frozen through recompute and anchor restoration', async () => {
      const { ctrl, recomputeLayout } = createController()

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { pageNumber: 1, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL },
        translatedAnchor: null
      })
      anchorFns.resolveTranslatedZoomAnchor.mockReturnValue(null)
      anchorFns.restoreControlledTransitionAnchors.mockImplementation(() => {
        expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)
        return PDF_SCROLL_OWNER.ORIGINAL
      })
      anchorFns.normalizeFitPagePdfAnchor.mockImplementation((a) => a)
      recomputeLayout.mockImplementationOnce(() => {
        expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)
        return Promise.resolve()
      })

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)

      await ctrl.handleZoomChange({ mode: 'fit-page' })

      expect(recomputeLayout).toHaveBeenCalled()
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalled()
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
    })

    it('keeps render window eviction frozen while applying deferred layout', async () => {
      const { ctrl, recomputeLayout } = createController()

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { pageNumber: 1, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL },
        translatedAnchor: null
      })
      anchorFns.resolveTranslatedZoomAnchor.mockReturnValue(null)
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.normalizeFitPagePdfAnchor.mockImplementation((a) => a)
      recomputeLayout
        .mockImplementationOnce(async () => {
          await ctrl.handleLayoutChange({ width: 500, height: 400 })
        })
        .mockImplementationOnce(() => {
          expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)
          return Promise.resolve()
        })

      await ctrl.handleZoomChange({ mode: 'fit-page' })

      expect(recomputeLayout).toHaveBeenCalledTimes(2)
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
    })

    it('nested handleLayoutChange does not prematurely release freeze from handleLayoutModeChange', async () => {
      const { ctrl, recomputeLayout } = createController()

      const domAnchor = { pageNumber: 2, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)

      let innerResolve = null
      recomputeLayout.mockImplementationOnce(() => {
        return new Promise((resolve) => { innerResolve = resolve })
      })

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: domAnchor,
        translatedAnchor: null
      })

      const layoutModePromise = ctrl.handleLayoutModeChange('side-by-side')
      const layoutChangePromise = ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)

      await layoutModePromise

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)

      innerResolve()
      await layoutChangePromise

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
    })
  })

  describe('handleZoomStep', () => {
    it('increments to next zoom percent', async () => {
      const { ctrl, recomputeLayout } = createController()

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { pageNumber: 1, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL },
        translatedAnchor: null
      })
      anchorFns.resolveTranslatedZoomAnchor.mockReturnValue(null)
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleZoomStep(1)

      expect(ctrl.zoomMode.value).toBe('percent')
      expect(ctrl.zoomPercent.value).toBe(125)
      expect(recomputeLayout).toHaveBeenCalled()
    })

    it('decrements to previous zoom percent', async () => {
      const { ctrl, recomputeLayout } = createController()

      ctrl.zoomMode.value = 'percent'
      ctrl.zoomPercent.value = 125

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { pageNumber: 1, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL },
        translatedAnchor: null
      })
      anchorFns.resolveTranslatedZoomAnchor.mockReturnValue(null)
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleZoomStep(-1)

      expect(ctrl.zoomPercent.value).toBe(100)
      expect(recomputeLayout).toHaveBeenCalled()
    })

    it('clamps at min bound without calling recompute', async () => {
      const { ctrl, recomputeLayout } = createController()

      ctrl.zoomMode.value = 'percent'
      ctrl.zoomPercent.value = 50

      await ctrl.handleZoomStep(-1)

      expect(ctrl.zoomPercent.value).toBe(50)
      expect(recomputeLayout).not.toHaveBeenCalled()
    })

    it('clamps at max bound', async () => {
      const { ctrl, recomputeLayout } = createController()

      ctrl.zoomMode.value = 'percent'
      ctrl.zoomPercent.value = 200

      await ctrl.handleZoomStep(1)

      expect(ctrl.zoomPercent.value).toBe(200)
      expect(recomputeLayout).not.toHaveBeenCalled()
    })
  })

  describe('orchestration path', () => {
    it('captures anchor, updates state, and restores in correct order for layout mode change', async () => {
      const { ctrl, setLayoutMode, recomputeLayout, pdfViewerLayoutRef } = createController()

      const domAnchor = { pageNumber: 3, offsetRatio: 0.25 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleLayoutModeChange('side-by-side')

      expect(anchorFns.capturePdfAwareOwnedScrollAnchor).toHaveBeenCalledBefore(anchorFns.restoreOwnedScrollAnchor)
      expect(setLayoutMode).toHaveBeenCalledBefore(anchorFns.restoreOwnedScrollAnchor)
    })

    it('refreshes render window after layout mode thaw', async () => {
      const refreshRenderWindow = vi.fn()
      const { ctrl } = createController({
        pdfViewerRef: { refreshRenderWindow }
      })

      const domAnchor = { pageNumber: 3, offsetRatio: 0.25 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleLayoutModeChange('single')

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
      expect(refreshRenderWindow).toHaveBeenCalledTimes(1)
    })

    it('captures, zooms, and restores in correct order for zoom transition', async () => {
      const { ctrl, recomputeLayout, pdfViewerLayoutRef } = createController()

      const originalAnchor = { pageNumber: 1, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor,
        translatedAnchor: null
      })
      anchorFns.resolveTranslatedZoomAnchor.mockReturnValue(null)
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.normalizeFitPagePdfAnchor.mockImplementation((a) => a)

      await ctrl.handleZoomChange({ mode: 'fit-page' })

      expect(anchorFns.captureControlledTransitionAnchors).toHaveBeenCalled()
      expect(recomputeLayout).toHaveBeenCalled()
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalled()
      expect(pdfViewerLayoutRef.value.setScrollSyncSuppressed).toHaveBeenCalledWith(true)
    })
  })

  describe('safety', () => {
    it('applies restored scroll state to target container through anchor restoration', async () => {
      const { ctrl } = createController()

      const container = { scrollTop: 0, scrollLeft: 0 }
      const domAnchor = { pageNumber: 3, offsetRatio: 0.5 }

      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockImplementation((anchor) => {
        container.scrollTop = anchor.pageNumber * 200 + anchor.offsetRatio * 100
        return PDF_SCROLL_OWNER.ORIGINAL
      })

      await ctrl.handleLayoutModeChange('side-by-side')

      expect(container.scrollTop).toBe(650)
      expect(anchorFns.restoreOwnedScrollAnchor).toHaveBeenCalledWith(domAnchor)
    })

    it('cleans up suppression state when recomputeLayout fails during zoom transition', async () => {
      const { ctrl, recomputeLayout } = createController()

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { pageNumber: 1, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL },
        translatedAnchor: null
      })
      anchorFns.resolveTranslatedZoomAnchor.mockReturnValue(null)
      anchorFns.normalizeFitPagePdfAnchor.mockImplementation((a) => a)
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      recomputeLayout.mockRejectedValueOnce(new Error('layout failed'))

      await expect(ctrl.handleZoomChange({ mode: 'fit-page' })).rejects.toThrow('layout failed')

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { pageNumber: 1, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL },
        translatedAnchor: null
      })
      recomputeLayout.mockResolvedValue()

      await ctrl.handleZoomStep(1)

      expect(ctrl.zoomPercent.value).toBe(125)
      expect(recomputeLayout).toHaveBeenCalled()
    })
  })
})
