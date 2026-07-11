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

const mockTopologyRef = vi.hoisted(() => ({ doesTopologyChange: null, realDoesTopologyChange: null }))

vi.mock('../utils/pdfViewerTopology.js', async () => {
  const mod = await vi.importActual('../utils/pdfViewerTopology.js')
  mockTopologyRef.realDoesTopologyChange = mod.doesTopologyChange
  mockTopologyRef.doesTopologyChange = vi.fn((prev, next) => mod.doesTopologyChange(prev, next))
  return {
    resolveEffectivePaneTopology: mod.resolveEffectivePaneTopology,
    doesTopologyChange: mockTopologyRef.doesTopologyChange
  }
})

vi.mock('./createPdfTransitionAnchor.js', () => {
  const PDF_SCROLL_OWNER = Object.freeze({ ORIGINAL: 'original', TRANSLATED: 'translated' })
  return {
    PDF_SCROLL_OWNER,
    isPdfBackedContentView: vi.fn((view) => view === 'original' || view === 'translated-pdf'),
    createPdfTransitionAnchor: vi.fn()
  }
})

const { CONTENT_VIEW, LAYOUT_MODE } = await import('./usePdfViewerMode.js')
const { createPdfTransitionController } = await import('./createPdfTransitionController.js')
const scrollAnchor = await import('../utils/pdfScrollAnchor.js')
const pdfTransitionAnchor = await import('./createPdfTransitionAnchor.js')
const { PDF_SCROLL_OWNER } = pdfTransitionAnchor

function createController(options = {}) {
  const contentView = ref(options.contentView ?? CONTENT_VIEW.ORIGINAL)
  const isSideBySide = ref(options.isSideBySide ?? false)
  const selectedLayoutMode = ref(options.selectedLayoutMode ?? (options.isSideBySide ? LAYOUT_MODE.SIDE_BY_SIDE : LAYOUT_MODE.SINGLE))
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
  const pdfTranslatedPaneRef = ref(options.pdfTranslatedPaneRef ?? null)
  const pdfViewerLayoutRef = ref({
    setScrollSyncSuppressed: vi.fn(),
    syncFromPane: vi.fn()
  })

  const ctrl = createPdfTransitionController({
    contentView,
    selectedLayoutMode,
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

  return { ctrl, contentView, isSideBySide, selectedLayoutMode, currentPage, setContentView, setLayoutMode, recomputeLayout, pdfViewerLayoutRef, pdfViewerRef, pdfTranslatedPaneRef }
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let anchorFns

beforeEach(() => {
  vi.clearAllMocks()

  if (mockTopologyRef.doesTopologyChange && mockTopologyRef.realDoesTopologyChange) {
    mockTopologyRef.doesTopologyChange.mockImplementation(
      (prev, next) => mockTopologyRef.realDoesTopologyChange(prev, next)
    )
  }

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
    deriveOriginalAnchorFromTranslated: vi.fn(),
    resolveTranslatedZoomAnchor: vi.fn(),
    normalizeFitPagePdfAnchor: vi.fn(),
    normalizeFitPageDomRootAnchor: vi.fn()
  }

  pdfTransitionAnchor.createPdfTransitionAnchor.mockReturnValue(anchorFns)
})

describe('createPdfTransitionController', () => {
  describe('currentPage suppression depth', () => {
    it('increments and decrements depth safely', () => {
      const { ctrl } = createController()

      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
      ctrl.__debugCurrentPageSuppression.begin({ owner: 'layout-mode', reason: 'test' })
      ctrl.__debugCurrentPageSuppression.begin({ owner: 'zoom', reason: 'test-nested' })
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(2)

      ctrl.__debugCurrentPageSuppression.end({ owner: 'zoom', reason: 'test-nested' })
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(1)

      ctrl.__debugCurrentPageSuppression.end({ owner: 'layout-mode', reason: 'test' })
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)

      ctrl.__debugCurrentPageSuppression.end({ owner: 'layout-mode', reason: 'extra-end' })
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
    })

    it('keeps outer suppression active across nested runWithCurrentPageSuppression work', async () => {
      const firstRecompute = createDeferred()
      const recomputeLayout = vi.fn().mockReturnValue(firstRecompute.promise)
      const { ctrl } = createController({ recomputeLayout, isSideBySide: true, showTranslatedPdfPane: true })

      ctrl.__debugCurrentPageSuppression.begin({ owner: 'layout-mode', reason: 'outer' })
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { pageNumber: 1, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL },
        translatedAnchor: null
      })
      anchorFns.resolveTranslatedZoomAnchor.mockImplementation((a) => a)
      anchorFns.normalizeFitPagePdfAnchor.mockImplementation((a) => a)
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      const zoomPromise = ctrl.handleZoomChange({ mode: 'fit-page' })
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(2)

      firstRecompute.resolve()
      await zoomPromise

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(1)

      ctrl.__debugCurrentPageSuppression.end({ owner: 'layout-mode', reason: 'outer' })
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
    })
  })

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

    it('keeps pending PDF anchor authoritative when width event is followed by height event before recompute resolves', async () => {
      const firstRecompute = createDeferred()
      const secondRecompute = createDeferred()
      const recomputeLayout = vi.fn()
        .mockReturnValueOnce(firstRecompute.promise)
        .mockReturnValueOnce(secondRecompute.promise)
      const { ctrl } = createController({ recomputeLayout, isSideBySide: true, showTranslatedPdfPane: true })

      const page35Anchor = { pageNumber: 35, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      const wrongOriginalAnchor = { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 48, offsetRatio: 0.4 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(page35Anchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        pageNumber: 35,
        offsetRatio: 0.25
      })
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: wrongOriginalAnchor,
        translatedAnchor: null
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(1)
      const firstLayout = ctrl.handleLayoutChange({ width: 705, height: 636 })
      const secondLayout = ctrl.handleLayoutChange({ width: 705, height: 651 })

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)
      firstRecompute.resolve()
      await firstLayout

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)
      expect(anchorFns.restoreControlledTransitionAnchors).not.toHaveBeenCalled()

      secondRecompute.resolve()
      await secondLayout

      expect(recomputeLayout).toHaveBeenCalledTimes(2)
      expect(anchorFns.captureControlledTransitionAnchors).not.toHaveBeenCalled()
      expect(anchorFns.deriveTranslatedAnchorFromOriginal).toHaveBeenCalledTimes(2)
      expect(anchorFns.deriveTranslatedAnchorFromOriginal).toHaveBeenCalledWith(
        expect.objectContaining({ pageNumber: 35, pdfPoint: { x: 10, y: 20 } })
      )
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledTimes(1)
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith({
        originalAnchor: expect.objectContaining({ pageNumber: 35, pdfPoint: { x: 10, y: 20 } }),
        translatedAnchor: expect.objectContaining({ pageNumber: 35, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.TRANSLATED })
      })
      expect(anchorFns.restoreControlledTransitionAnchors).not.toHaveBeenCalledWith({
        originalAnchor: expect.objectContaining({ pageNumber: 48 }),
        translatedAnchor: null
      })
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
    })

    it('skips translated restore when derived translated anchor is null', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl } = createController({ recomputeLayout, isSideBySide: true, showTranslatedPdfPane: true })

      const page35Anchor = { pageNumber: 35, pdfPoint: { x: 0, y: 0 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(page35Anchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(true)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue(null)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)
      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith({
        originalAnchor: expect.objectContaining({ pageNumber: 35 }),
        translatedAnchor: null
      })
      expect(anchorFns.restoreControlledTransitionAnchors).not.toHaveBeenCalledWith(
        expect.objectContaining({
          translatedAnchor: expect.objectContaining({ pageNumber: 38 })
        })
      )
    })

    it('keeps pending PDF anchor authoritative when latest height event resolves before stale width event', async () => {
      const firstRecompute = createDeferred()
      const secondRecompute = createDeferred()
      const recomputeLayout = vi.fn()
        .mockReturnValueOnce(firstRecompute.promise)
        .mockReturnValueOnce(secondRecompute.promise)
      const { ctrl } = createController({ recomputeLayout, isSideBySide: true, showTranslatedPdfPane: true })

      const page35Anchor = { pageNumber: 35, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(page35Anchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        pageNumber: 35,
        offsetRatio: 0.25
      })
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 43, offsetRatio: 0.4 },
        translatedAnchor: null
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)
      const firstLayout = ctrl.handleLayoutChange({ width: 705, height: 636 })
      const secondLayout = ctrl.handleLayoutChange({ width: 705, height: 651 })

      secondRecompute.resolve()
      await secondLayout

      expect(anchorFns.deriveTranslatedAnchorFromOriginal).toHaveBeenCalledTimes(2)
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledTimes(1)
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith({
        originalAnchor: expect.objectContaining({ pageNumber: 35 }),
        translatedAnchor: expect.objectContaining({ pageNumber: 35, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.TRANSLATED })
      })
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)

      firstRecompute.resolve()
      await firstLayout

      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledTimes(1)
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
    })

    it('consumes a pending PDF-backed content anchor only once', async () => {
      const { ctrl } = createController({ isSideBySide: true, showTranslatedPdfPane: true })

      const page35Anchor = { pageNumber: 35, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(page35Anchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        pageNumber: 35,
        offsetRatio: 0.25
      })
      anchorFns.captureControlledTransitionAnchors
        .mockReturnValueOnce({ originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 48, offsetRatio: 0.4 }, translatedAnchor: null })
        .mockReturnValueOnce({ originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 49, offsetRatio: 0.4 }, translatedAnchor: null })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)
      await ctrl.handleLayoutChange({ width: 800, height: 600 })
      await new Promise(resolve => requestAnimationFrame(resolve))
      await ctrl.handleLayoutChange({ width: 900, height: 600 })

      expect(anchorFns.deriveTranslatedAnchorFromOriginal).toHaveBeenCalledTimes(1)
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenNthCalledWith(1, {
        originalAnchor: expect.objectContaining({ pageNumber: 35 }),
        translatedAnchor: expect.objectContaining({ pageNumber: 35, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.TRANSLATED })
      })
    })

    it('does not carry a stale pending PDF anchor into a later DOM-backed content transition', async () => {
      const { ctrl } = createController()

      const page35Anchor = { pageNumber: 35, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      const domAnchor = { pageNumber: 48, offsetRatio: 0.4 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(page35Anchor)
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)

      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(null)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 48, offsetRatio: 0.4 },
        translatedAnchor: null
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)
      await new Promise(resolve => requestAnimationFrame(resolve))
      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith({
        originalAnchor: expect.objectContaining({ pageNumber: 48 }),
        translatedAnchor: null
      })
      expect(anchorFns.restoreControlledTransitionAnchors).not.toHaveBeenCalledWith({
        originalAnchor: expect.objectContaining({ pageNumber: 35 }),
        translatedAnchor: null
      })
    })

    it('does not restore an old pending anchor when transition sequence changes while layout awaits', async () => {
      const firstRecompute = createDeferred()
      const recomputeLayout = vi.fn().mockReturnValueOnce(firstRecompute.promise)
      const { ctrl } = createController({ recomputeLayout, isSideBySide: true, showTranslatedPdfPane: true })

      const page35Anchor = { pageNumber: 35, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      const domAnchor = { pageNumber: 5, offsetRatio: 0.4 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(page35Anchor)
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 48, offsetRatio: 0.4 },
        translatedAnchor: null
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)
      const staleLayout = ctrl.handleLayoutChange({ width: 705, height: 636 })

      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(null)
      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      firstRecompute.resolve()
      await staleLayout

      expect(anchorFns.restoreControlledTransitionAnchors).not.toHaveBeenCalled()
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
    })

    it('preserves the same PDF-backed page across repeated content-view toggles', async () => {
      const { ctrl, currentPage } = createController({ currentPage: 35, isSideBySide: true, showTranslatedPdfPane: true })

      const page35Anchor = { pageNumber: 35, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(page35Anchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        pageNumber: 35,
        offsetRatio: 0.25
      })
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 48, offsetRatio: 0.4 },
        translatedAnchor: null
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)
      await ctrl.handleLayoutChange({ width: 800, height: 600 })
      await ctrl.handleContentViewChange(CONTENT_VIEW.ORIGINAL)
      await ctrl.handleLayoutChange({ width: 900, height: 600 })
      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)
      await ctrl.handleLayoutChange({ width: 700, height: 600 })

      expect(currentPage.value).toBe(35)
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledTimes(3)
      for (const call of anchorFns.restoreControlledTransitionAnchors.mock.calls) {
        expect(call[0].originalAnchor.pageNumber).toBe(35)
      }
    })

    it('retains pending anchor when translated-pdf side-by-side collapses to original', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl, currentPage } = createController({
        contentView: CONTENT_VIEW.TRANSLATED_PDF,
        isSideBySide: true,
        showTranslatedPdfPane: true,
        currentPage: 13,
        recomputeLayout
      })

      const page13Anchor = { pageNumber: 13, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(page13Anchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        pageNumber: 13,
        offsetRatio: 0.25
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.ORIGINAL)

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(1)

      await ctrl.handleLayoutChange({ width: 1448, height: 600 })

      expect(currentPage.value).toBe(13)
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
    })

    it('retains pending anchor when original becomes translated-pdf side-by-side', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl } = createController({
        contentView: CONTENT_VIEW.ORIGINAL,
        selectedLayoutMode: LAYOUT_MODE.SIDE_BY_SIDE,
        recomputeLayout
      })

      const page13Anchor = { pageNumber: 13, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(page13Anchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        pageNumber: 13,
        offsetRatio: 0.25
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(1)

      await ctrl.handleLayoutChange({ width: 1448, height: 600 })

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
    })

    it('keeps current page stable across repeated topology-changing toggles', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl, currentPage } = createController({
        contentView: CONTENT_VIEW.TRANSLATED_PDF,
        isSideBySide: true,
        showTranslatedPdfPane: true,
        currentPage: 13,
        recomputeLayout
      })

      const page13Anchor = { pageNumber: 13, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(page13Anchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        pageNumber: 13,
        offsetRatio: 0.25
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.ORIGINAL)
      await ctrl.handleLayoutChange({ width: 1448, height: 600 })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)
      await ctrl.handleLayoutChange({ width: 1448, height: 600 })

      expect(currentPage.value).toBe(13)
    })

    it('releases pending-anchor suppression when topology stays stable', async () => {
      const refreshCurrentPage = vi.fn()
      const { ctrl } = createController({
        pdfViewerRef: { refreshCurrentPage }
      })

      const page13Anchor = { pageNumber: 13, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(page13Anchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        pageNumber: 13,
        offsetRatio: 0.25
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
      expect(refreshCurrentPage).toHaveBeenCalledTimes(1)
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

    it('consumes suppression token when non-PDF translation has no geometry change', async () => {
      const refreshCurrentPage = vi.fn()
      const { ctrl } = createController({ pdfViewerRef: { refreshCurrentPage } })

      mockTopologyRef.doesTopologyChange.mockReturnValue(false)

      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 13, offsetRatio: 0.25 })
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
      expect(refreshCurrentPage).toHaveBeenCalledTimes(1)
      expect(anchorFns.restoreControlledTransitionAnchors).not.toHaveBeenCalled()
    })

    it('keeps suppression active when non-PDF translation changes geometry', async () => {
      const refreshCurrentPage = vi.fn()
      const { ctrl } = createController({ pdfViewerRef: { refreshCurrentPage } })

      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 13, offsetRatio: 0.25 })
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(1)
      expect(refreshCurrentPage).not.toHaveBeenCalled()
    })

    it('clears token and releases suppression when setContentView throws', async () => {
      const refreshCurrentPage = vi.fn()
      const { ctrl, setContentView } = createController({
        pdfViewerRef: { refreshCurrentPage }
      })

      const domAnchor = { pageNumber: 1, offsetRatio: 0, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      setContentView.mockImplementation(() => {
        throw new Error('content view failed')
      })

      await expect(ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)).rejects.toThrow('content view failed')

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
      expect(refreshCurrentPage).toHaveBeenCalledTimes(1)
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

    it('suppresses current-page updates across layout mode anchor lifecycle and refreshes after release', async () => {
      const refreshRenderWindow = vi.fn(() => {
        expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
        expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
      })
      const refreshCurrentPage = vi.fn(() => {
        expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      })
      const { ctrl, setLayoutMode } = createController({
        pdfViewerRef: { refreshRenderWindow, refreshCurrentPage }
      })

      const domAnchor = { pageNumber: 36, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      setLayoutMode.mockImplementation(() => {
        expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
      })
      anchorFns.restoreOwnedScrollAnchor.mockImplementation(() => {
        expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
        return PDF_SCROLL_OWNER.ORIGINAL
      })

      await ctrl.handleLayoutModeChange('side-by-side')

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(refreshRenderWindow).toHaveBeenCalledTimes(1)
      expect(refreshCurrentPage).toHaveBeenCalledTimes(1)
      expect(refreshRenderWindow).toHaveBeenCalledBefore(refreshCurrentPage)
    })

    it('keeps the original logical page authoritative across repeated layout mode toggles', async () => {
      const refreshCurrentPage = vi.fn()
      const { ctrl, currentPage } = createController({
        currentPage: 36,
        pdfViewerRef: { refreshRenderWindow: vi.fn(), refreshCurrentPage }
      })

      const anchor = { pageNumber: 36, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockImplementation(() => {
        expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
        return anchor
      })
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockImplementation(() => {
        expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
        return PDF_SCROLL_OWNER.ORIGINAL
      })

      await ctrl.handleLayoutModeChange('side-by-side')
      await ctrl.handleLayoutModeChange('single')
      await ctrl.handleLayoutModeChange('side-by-side')

      expect(currentPage.value).toBe(36)
      expect(anchorFns.restoreOwnedScrollAnchor).toHaveBeenCalledTimes(3)
      expect(refreshCurrentPage).toHaveBeenCalledTimes(3)
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
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
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
    })

    it('releases current-page suppression when layout mode change throws', async () => {
      const refreshCurrentPage = vi.fn(() => {
        expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      })
      const { ctrl, setLayoutMode } = createController({
        pdfViewerRef: { refreshRenderWindow: vi.fn(), refreshCurrentPage }
      })

      const domAnchor = { pageNumber: 36, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      setLayoutMode.mockImplementation(() => {
        expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)
        throw new Error('layout failed')
      })

      await expect(ctrl.handleLayoutModeChange('side-by-side')).rejects.toThrow('layout failed')

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
      expect(refreshCurrentPage).toHaveBeenCalledTimes(1)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
    })

    it('clears token and releases freeze when setLayoutMode throws for PDF-backed transition', async () => {
      const refreshCurrentPage = vi.fn()
      const { ctrl, setLayoutMode } = createController({
        pdfViewerRef: { refreshRenderWindow: vi.fn(), refreshCurrentPage }
      })

      const pdfAnchor = { pageNumber: 1, offsetRatio: 0, pdfPoint: { x: 0, y: 0 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(pdfAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(true)
      setLayoutMode.mockImplementation(() => {
        throw new Error('layout failed')
      })

      await expect(ctrl.handleLayoutModeChange('single')).rejects.toThrow('layout failed')

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
      expect(refreshCurrentPage).toHaveBeenCalledTimes(1)
    })

    it('clears token and releases freeze when restoreOwnedScrollAnchor throws in layout mode change', async () => {
      const refreshCurrentPage = vi.fn()
      const { ctrl } = createController({
        pdfViewerRef: { refreshRenderWindow: vi.fn(), refreshCurrentPage }
      })

      const domAnchor = { pageNumber: 2, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockImplementation(() => {
        throw new Error('restore failed')
      })

      await expect(ctrl.handleLayoutModeChange('side-by-side')).rejects.toThrow('restore failed')

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
      expect(refreshCurrentPage).toHaveBeenCalledTimes(1)
    })

    it('preserves primary error when cleanup succeeds', async () => {
      const { ctrl, setLayoutMode } = createController()

      const domAnchor = { pageNumber: 2, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      setLayoutMode.mockImplementation(() => {
        throw new Error('primary failed')
      })

      await expect(ctrl.handleLayoutModeChange('side-by-side')).rejects.toThrow('primary failed')

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
    })

    it('preserves primary error when cleanup also throws', async () => {
      const refreshRenderWindow = vi.fn(() => { throw new Error('cleanup failed') })
      const { ctrl, setLayoutMode } = createController({
        pdfViewerRef: { refreshRenderWindow, refreshCurrentPage: vi.fn() }
      })
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      const domAnchor = { pageNumber: 2, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      setLayoutMode.mockImplementation(() => {
        throw new Error('primary failed')
      })

      await expect(ctrl.handleLayoutModeChange('side-by-side')).rejects.toThrow('primary failed')

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
      expect(console.warn).toHaveBeenCalled()
    })

    it('propagates cleanup error when no primary error occurred', async () => {
      const refreshRenderWindow = vi.fn(() => { throw new Error('cleanup failed') })
      const { ctrl } = createController({
        pdfViewerRef: { refreshRenderWindow, refreshCurrentPage: vi.fn() }
      })

      const domAnchor = { pageNumber: 2, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await expect(ctrl.handleLayoutModeChange('side-by-side')).rejects.toThrow('cleanup failed')

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
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

    it('releases pending-anchor suppression when authoritative restore throws', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl } = createController({ recomputeLayout, isSideBySide: true, showTranslatedPdfPane: true })

      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })

      const pendingAnchor = { pageNumber: 35, pdfPoint: { x: 0, y: 0 } }
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(pendingAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(true)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 48, offsetRatio: 0.4 },
        translatedAnchor: null
      })
      anchorFns.restoreControlledTransitionAnchors.mockImplementation(() => {
        throw new Error('restore failed')
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)

      await expect(ctrl.handleLayoutChange({ width: 800, height: 600 })).rejects.toThrow('restore failed')
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
    })

    it('restores retained PDF-backed content anchor during first width-changing resize after content view restore', async () => {
      const { ctrl, recomputeLayout } = createController({ isSideBySide: true, showTranslatedPdfPane: true })

      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })

      const pendingAnchor = { pageNumber: 1, pdfPoint: { x: 0, y: 0 } }
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(pendingAnchor)
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
        expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)
        return Promise.resolve()
      })

      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith({
        originalAnchor: expect.objectContaining(pendingAnchor),
        translatedAnchor: null
      })
      expect(anchorFns.restoreControlledTransitionAnchors).not.toHaveBeenCalledWith(freshAnchors)
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

    it('captures, recomputes, and restores for transition-backed layout change', async () => {
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
    })

    it('keeps render window frozen during deferred recompute in transition-backed layout change', async () => {
      const deferredRecompute = createDeferred()
      const recomputeLayout = vi.fn().mockReturnValue(deferredRecompute.promise)
      const { ctrl } = createController({ recomputeLayout })

      const domAnchor = { pageNumber: 3, offsetRatio: 0.5, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: domAnchor,
        translatedAnchor: null
      })
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)

      const layoutPromise = ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(true)

      deferredRecompute.resolve()
      await layoutPromise

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledTimes(1)
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
    })

    it('releases render window freeze when restore throws during transition-backed layout change', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl } = createController({ recomputeLayout })

      const domAnchor = { pageNumber: 33, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: domAnchor,
        translatedAnchor: null
      })
      anchorFns.restoreControlledTransitionAnchors.mockImplementation(() => {
        throw new Error('restore failed')
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      await expect(ctrl.handleLayoutChange({ width: 800, height: 600 })).rejects.toThrow('restore failed')

      expect(ctrl.renderWindowEvictionFrozen.value).toBe(false)
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
    })

    it('restores captured anchors during non-PDF text transition', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl } = createController({ recomputeLayout })

      const domAnchor = { pageNumber: 31, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      const capturedAnchors = {
        originalAnchor: domAnchor,
        translatedAnchor: null
      }
      anchorFns.captureControlledTransitionAnchors.mockReturnValue(capturedAnchors)
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith(capturedAnchors)
    })

    it('skips restore via stale content sequence guard', async () => {
      const deferredRecompute = createDeferred()
      const recomputeLayout = vi.fn().mockReturnValue(deferredRecompute.promise)
      const { ctrl } = createController({ recomputeLayout })

      const domAnchor = { pageNumber: 31, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: domAnchor,
        translatedAnchor: null
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(null)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      const layoutPromise = ctrl.handleLayoutChange({ width: 800, height: 600 })

      // Start a second transition — increments contentTransitionSeq
      await ctrl.handleContentViewChange(CONTENT_VIEW.ORIGINAL)

      deferredRecompute.resolve()
      await layoutPromise

      expect(anchorFns.restoreControlledTransitionAnchors).not.toHaveBeenCalled()
    })

    it('skips restore via stale layout sequence guard', async () => {
      const firstRecompute = createDeferred()
      const secondRecompute = createDeferred()
      const recomputeLayout = vi.fn()
        .mockReturnValueOnce(firstRecompute.promise)
        .mockReturnValueOnce(secondRecompute.promise)
      const { ctrl } = createController({ recomputeLayout })

      const domAnchor = { pageNumber: 31, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: domAnchor,
        translatedAnchor: null
      })
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(null)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      const firstLayout = ctrl.handleLayoutChange({ width: 800, height: 600 })
      const secondLayout = ctrl.handleLayoutChange({ width: 900, height: 600 })

      secondRecompute.resolve()
      await secondLayout

      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledTimes(1)

      firstRecompute.resolve()
      await firstLayout

      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledTimes(1)
    })

    it('restores from pending PDF anchor not captured anchors', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl } = createController({ recomputeLayout, isSideBySide: true, showTranslatedPdfPane: true })

      const pendingAnchor = { pageNumber: 35, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      const capturedAnchor = { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 48, offsetRatio: 0.4 }

      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(pendingAnchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        pageNumber: 35,
        offsetRatio: 0.25
      })
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: capturedAnchor,
        translatedAnchor: null
      })
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)

      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledTimes(1)
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith({
        originalAnchor: expect.objectContaining({ pageNumber: 35 }),
        translatedAnchor: expect.objectContaining({ pageNumber: 35 })
      })
      expect(anchorFns.restoreControlledTransitionAnchors).not.toHaveBeenCalledWith({
        originalAnchor: capturedAnchor,
        translatedAnchor: null
      })
    })

    it('suppresses current-page updates during non-PDF Original to Translation transition', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl } = createController({ recomputeLayout })

      const domAnchor = { pageNumber: 33, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: domAnchor,
        translatedAnchor: null
      })
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      // After handleContentViewChange: token created, suppression active
      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)

      // handleLayoutChange consumes token and releases suppression
      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
    })

    it('suppresses current-page updates during non-PDF Translation to Original transition', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl } = createController({ recomputeLayout, contentView: CONTENT_VIEW.TRANSLATION })

      // Capture from translated pane
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.TRANSLATED)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        container: document.createElement('div'),
        selector: '.pdf-translated-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 45, offsetRatio: 0.3 })
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.TRANSLATED)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: null,
        translatedAnchor: { pageNumber: 45, offsetRatio: 0.3, owner: PDF_SCROLL_OWNER.TRANSLATED }
      })
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.TRANSLATED)

      await ctrl.handleContentViewChange(CONTENT_VIEW.ORIGINAL)

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)

      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
    })

    it('releases suppression after restore', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl } = createController({ recomputeLayout })

      const domAnchor = { pageNumber: 33, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: domAnchor,
        translatedAnchor: null
      })
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)

      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledTimes(1)
    })

    it('consumes generic transition token once for PDF-backed path without double restore', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl } = createController({ recomputeLayout, isSideBySide: true, showTranslatedPdfPane: true })

      const pendingAnchor = { pageNumber: 35, offsetRatio: 0.25, pdfPoint: { x: 10, y: 20 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(pendingAnchor)
      scrollAnchor.isPdfAnchor.mockImplementation((anchor) => !!anchor?.pdfPoint)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({
        owner: PDF_SCROLL_OWNER.TRANSLATED,
        pageNumber: 35,
        offsetRatio: 0.25
      })
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 48, offsetRatio: 0.4 },
        translatedAnchor: null
      })
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)

      // PDF path fires first, consumes token once
      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      // Only one restore call — no double restore
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledTimes(1)
    })

    it('clears old generic transition token when stale content sequence fires', async () => {
      const deferredRecompute = createDeferred()
      const recomputeLayout = vi.fn().mockReturnValue(deferredRecompute.promise)
      const { ctrl } = createController({ recomputeLayout })

      const domAnchor = { pageNumber: 33, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: domAnchor,
        translatedAnchor: null
      })
      anchorFns.restoreControlledTransitionAnchors.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      scrollAnchor.capturePdfBackedScrollAnchor.mockReturnValue(null)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)

      const staleLayoutPromise = ctrl.handleLayoutChange({ width: 800, height: 600 })

      // Second transition clears old token via beginControlledTransition
      await ctrl.handleContentViewChange(CONTENT_VIEW.ORIGINAL)

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)

      deferredRecompute.resolve()
      await staleLayoutPromise

      // Stale seq guard returned early — no restore
      expect(anchorFns.restoreControlledTransitionAnchors).not.toHaveBeenCalled()
    })

    it('releases suppression when authoritative restore throws', async () => {
      const recomputeLayout = vi.fn().mockResolvedValue(true)
      const { ctrl } = createController({ recomputeLayout })

      const domAnchor = { pageNumber: 33, offsetRatio: 0.25, owner: PDF_SCROLL_OWNER.ORIGINAL }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue(domAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: domAnchor,
        translatedAnchor: null
      })
      anchorFns.restoreControlledTransitionAnchors.mockImplementation(() => {
        throw new Error('restore failed')
      })

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATION)

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(true)

      await expect(ctrl.handleLayoutChange({ width: 800, height: 600 })).rejects.toThrow('restore failed')

      expect(ctrl.currentPageUpdatesSuppressed.value).toBe(false)
      expect(ctrl.__debugCurrentPageSuppression.getDepth()).toBe(0)
    })

    it('restores both panes from ownerAnchor after Translation single switches to side-by-side', async () => {
      const { ctrl, recomputeLayout } = createController({ contentView: CONTENT_VIEW.TRANSLATION })

      const translatedAnchor = { owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 28, offsetRatio: 0.3 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.TRANSLATED)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(translatedAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.TRANSLATED)
      anchorFns.deriveOriginalAnchorFromTranslated.mockReturnValue({ owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 28, offsetRatio: 0 })

      await ctrl.handleLayoutModeChange('side-by-side')

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 1, offsetRatio: 0 },
        translatedAnchor
      })
      recomputeLayout.mockResolvedValue()

      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(anchorFns.captureControlledTransitionAnchors).not.toHaveBeenCalled()
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith({
        originalAnchor: expect.objectContaining({ pageNumber: 28 }),
        translatedAnchor: expect.objectContaining({ pageNumber: 28 })
      })
    })

    it('restores both panes from ownerAnchor after Original single switches to side-by-side', async () => {
      const { ctrl, recomputeLayout } = createController()

      const originalAnchor = { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 14, offsetRatio: 0.5 }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(originalAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({ owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 14, offsetRatio: 0.5 })

      await ctrl.handleLayoutModeChange('side-by-side')

      anchorFns.captureControlledTransitionAnchors.mockReturnValue({
        originalAnchor,
        translatedAnchor: { owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 1, offsetRatio: 0 }
      })
      recomputeLayout.mockResolvedValue()

      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(anchorFns.captureControlledTransitionAnchors).not.toHaveBeenCalled()
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith({
        originalAnchor: expect.objectContaining({ pageNumber: 14 }),
        translatedAnchor: expect.objectContaining({ pageNumber: 14 })
      })
    })

    it('does not use ownerAnchor when pdfAnchor is present and authoritative', async () => {
      const { ctrl, recomputeLayout } = createController({ isSideBySide: true, showTranslatedPdfPane: true })

      const pdfAnchor = { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 5, pdfPoint: { x: 0, y: 0 } }
      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.capturePdfAwareOwnedScrollAnchor.mockReturnValue(pdfAnchor)
      scrollAnchor.isPdfAnchor.mockReturnValue(true)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleLayoutModeChange('side-by-side')

      const freshAnchors = {
        originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 40, offsetRatio: 0.25 },
        translatedAnchor: null
      }
      anchorFns.captureControlledTransitionAnchors.mockReturnValue(freshAnchors)
      anchorFns.deriveTranslatedAnchorFromOriginal.mockReturnValue({ owner: PDF_SCROLL_OWNER.TRANSLATED, pageNumber: 5, offsetRatio: 0 })
      recomputeLayout.mockResolvedValue()

      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith({
        originalAnchor: expect.objectContaining(pdfAnchor),
        translatedAnchor: expect.anything()
      })
      expect(anchorFns.restoreControlledTransitionAnchors).not.toHaveBeenCalledWith(freshAnchors)
      expect(anchorFns.deriveOriginalAnchorFromTranslated).not.toHaveBeenCalled()
    })

    it('falls back to captureControlledTransitionAnchors when token has no ownerAnchor or pdfAnchor', async () => {
      const { ctrl, recomputeLayout } = createController()

      anchorFns.resolveAnchorOwner.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)
      anchorFns.resolveOwnerScrollTarget.mockReturnValue({
        owner: PDF_SCROLL_OWNER.ORIGINAL,
        container: document.createElement('div'),
        selector: '.pdf-page[data-page-number]'
      })
      scrollAnchor.captureScrollAnchor.mockReturnValue({ pageNumber: 3, offsetRatio: 0.5 })
      scrollAnchor.isPdfAnchor.mockReturnValue(false)
      anchorFns.restoreOwnedScrollAnchor.mockReturnValue(PDF_SCROLL_OWNER.ORIGINAL)

      await ctrl.handleContentViewChange(CONTENT_VIEW.TRANSLATED_PDF)
      await new Promise(resolve => requestAnimationFrame(resolve))

      const freshAnchors = {
        originalAnchor: { owner: PDF_SCROLL_OWNER.ORIGINAL, pageNumber: 10, offsetRatio: 0.5 },
        translatedAnchor: null
      }
      anchorFns.captureControlledTransitionAnchors.mockReturnValue(freshAnchors)
      recomputeLayout.mockResolvedValue()

      await ctrl.handleLayoutChange({ width: 800, height: 600 })

      expect(anchorFns.captureControlledTransitionAnchors).toHaveBeenCalled()
      expect(anchorFns.restoreControlledTransitionAnchors).toHaveBeenCalledWith(freshAnchors)
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
