import { nextTick, onBeforeUnmount, ref, unref } from 'vue'
import { CONTENT_VIEW } from './usePdfViewerMode.js'
import { captureScrollAnchor, capturePdfBackedScrollAnchor, isPdfAnchor } from '../utils/pdfScrollAnchor.js'
import { resolvePdfCanvasSlot } from '../utils/pdfFitPageFootprint.js'
import { createPdfTransitionAnchor, PDF_SCROLL_OWNER, isPdfBackedContentView } from './createPdfTransitionAnchor.js'
const ZOOM_PERCENT_OPTIONS = [50, 75, 100, 125, 150, 200]

const DEFAULT_VIEWER_WIDTH = 960

export function createPdfTransitionController({
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
}) {
  let contentTransitionSeq = 0
  let layoutChangeSeq = 0
  let suppressedLayoutRestoreSeq = 0
  let suppressedLayoutRestoreFrameId = null
  let scrollSyncSuppressionFrameId = null
  let controlledZoomSeq = 0
  let pendingPdfBackedAnchor = null
  let deferredZoomLayout = null
  let renderWindowFreezeDepth = 0

  const zoomMode = ref('fit-width')
  const zoomPercent = ref(100)
  const viewerLayout = ref({ width: 0, height: 0 })
  const currentPageUpdatesSuppressed = ref(false)
  const suppressScrollSync = ref(false)
  const renderWindowEvictionFrozen = ref(false)

  function acquireRenderWindowFreeze() {
    renderWindowFreezeDepth += 1
    renderWindowEvictionFrozen.value = true
  }

  function releaseRenderWindowFreeze() {
    renderWindowFreezeDepth = Math.max(0, renderWindowFreezeDepth - 1)
    if (renderWindowFreezeDepth === 0) {
      renderWindowEvictionFrozen.value = false
    }
  }

  const {
    resolveAnchorOwner,
    resolveOwnerScrollTarget,
    resolveLayoutTransitionTarget,
    captureOwnedScrollAnchor,
    captureLayoutTransitionAnchor,
    capturePdfAwareOwnedScrollAnchor,
    captureControlledTransitionAnchors,
    restoreOwnedScrollAnchor,
    restoreControlledTransitionAnchors,
    deriveTranslatedAnchorFromOriginal,
    resolveTranslatedZoomAnchor,
    normalizeFitPagePdfAnchor,
    normalizeFitPageDomRootAnchor
  } = createPdfTransitionAnchor({
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

  onBeforeUnmount(() => {
    clearControlledTransitionSuppressionTimer()
    clearScrollSyncSuppressionTimer()
    deferredZoomLayout = null
  })

  function beginControlledTransition() {
    pendingPdfBackedAnchor = null
    contentTransitionSeq += 1
    suppressedLayoutRestoreSeq = contentTransitionSeq
    clearControlledTransitionSuppressionTimer()
  }

  function clearControlledTransitionSuppressionTimer() {
    if (suppressedLayoutRestoreFrameId != null) {
      cancelAnimationFrame(suppressedLayoutRestoreFrameId)
      suppressedLayoutRestoreFrameId = null
    }
  }

  function clearScrollSyncSuppressionTimer() {
    if (scrollSyncSuppressionFrameId != null) {
      cancelAnimationFrame(scrollSyncSuppressionFrameId)
      scrollSyncSuppressionFrameId = null
    }
  }

  function beginCurrentPageSuppression() {
    currentPageUpdatesSuppressed.value = true
  }

  function endCurrentPageSuppression() {
    currentPageUpdatesSuppressed.value = false
  }

  function refreshCurrentPage() {
    pdfViewerRef.value?.refreshCurrentPage?.()
    pdfTranslatedPaneRef.value?.refreshCurrentPage?.()
  }

  async function runWithCurrentPageSuppression(work) {
    beginCurrentPageSuppression()
    try {
      return await work()
    } finally {
      endCurrentPageSuppression()
    }
  }

  function scheduleControlledTransitionSuppressionClear() {
    const seq = suppressedLayoutRestoreSeq
    if (!seq) return

    clearControlledTransitionSuppressionTimer()
    suppressedLayoutRestoreFrameId = requestAnimationFrame(() => {
      suppressedLayoutRestoreFrameId = null
      if (suppressedLayoutRestoreSeq === seq) {
        suppressedLayoutRestoreSeq = 0
      }
    })
  }

  function beginScrollSyncSuppression() {
    pdfViewerLayoutRef.value?.setScrollSyncSuppressed?.(true)
    suppressScrollSync.value = true
    clearScrollSyncSuppressionTimer()
  }

  function beginControlledZoomSuppression() {
    controlledZoomSeq += 1
    deferredZoomLayout = null
    return controlledZoomSeq
  }

  function endControlledZoomSuppression(seq) {
    if (controlledZoomSeq === seq) {
      controlledZoomSeq = 0
    }
  }

  function scheduleScrollSyncSuppressionClear() {
    clearScrollSyncSuppressionTimer()
    scrollSyncSuppressionFrameId = requestAnimationFrame(() => {
      scrollSyncSuppressionFrameId = null
      pdfViewerLayoutRef.value?.setScrollSyncSuppressed?.(false)
      suppressScrollSync.value = false
    })
  }

  async function refreshRenderWindowAfterLayoutTransition() {
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))
    pdfViewerRef.value?.refreshRenderWindow?.()
  }

  function isPdfBackedPdfTransition(previousView, nextView) {
    return isPdfBackedContentView(previousView) && isPdfBackedContentView(nextView) && previousView !== nextView
  }

  function isTranslatedTextPdfBackedTransition(previousView, nextView) {
    return (
      previousView === CONTENT_VIEW.TRANSLATION && isPdfBackedContentView(nextView)
    ) || (
      isPdfBackedContentView(previousView) && nextView === CONTENT_VIEW.TRANSLATION
    )
  }

  async function applyDeferredZoomLayout() {
    const pendingLayout = deferredZoomLayout
    if (!pendingLayout) return

    deferredZoomLayout = null
    await recomputeLayout(buildLayoutRequest(pendingLayout))
    await nextTick()
  }

  function normalizeTranslatedAnchor(anchor, owner, previousView, nextView) {
    if (!isTranslatedTextPdfBackedTransition(previousView, nextView)) return anchor
    if (owner !== PDF_SCROLL_OWNER.TRANSLATED) return anchor

    const pageNumber = Number(currentPage.value)
    const resolvedPage = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : null
    if (!resolvedPage) return anchor

    if (anchor?.pageNumber === resolvedPage) return anchor

    return {
      ...(anchor || { owner }),
      pageNumber: resolvedPage,
      offsetRatio: 0
    }
  }

  function syncFromOwner(owner) {
    pdfViewerLayoutRef.value?.syncFromPane?.(resolveAnchorOwner(owner))
  }

  async function handleContentViewChange(nextView) {
    const previousView = contentView.value
    const owner = resolveAnchorOwner()
    const isPdfBackedTransition = isPdfBackedPdfTransition(previousView, nextView)
    const ownerTarget = resolveOwnerScrollTarget(owner)

    const pdfSession = unref(session) ?? null
    const rawAnchor = isPdfBackedTransition && capturePdfBackedScrollAnchor(ownerTarget.container, ownerTarget.selector, pdfSession)
    let anchor = rawAnchor
      ? { owner, ...rawAnchor }
      : captureScrollAnchor(ownerTarget.container, ownerTarget.selector)

    if (!isPdfBackedTransition) {
      anchor = normalizeTranslatedAnchor(anchor, owner, previousView, nextView)
    }

    beginControlledTransition()
    pendingPdfBackedAnchor = isPdfBackedTransition && isPdfAnchor(anchor)
      ? { transitionSeq: contentTransitionSeq, anchor }
      : null

    setContentView(nextView)

    await nextTick()

    const restoredOwner = restoreOwnedScrollAnchor(anchor)

    if (isSideBySide.value) {
      syncFromOwner(restoredOwner || anchor?.owner || owner)
    }
    scheduleControlledTransitionSuppressionClear()
  }

  async function handleLayoutModeChange(mode) {
    const owner = resolveAnchorOwner()
    const anchor = capturePdfAwareOwnedScrollAnchor(owner)

    beginControlledTransition()
    pendingPdfBackedAnchor = isPdfAnchor(anchor)
      ? { transitionSeq: contentTransitionSeq, anchor }
      : null
    acquireRenderWindowFreeze()
    try {
      setLayoutMode(mode)

      await nextTick()

      if (isSideBySide.value && showTranslatedPdfPane.value) {
        syncFromOwner(owner)
        scheduleControlledTransitionSuppressionClear()
        return
      }

      if (isPdfAnchor(anchor)) {
        scheduleControlledTransitionSuppressionClear()
        return
      }

      const restoredOwner = restoreOwnedScrollAnchor(anchor)

      if (isSideBySide.value) {
        syncFromOwner(restoredOwner || anchor?.owner || owner)
      }
      scheduleControlledTransitionSuppressionClear()
    } finally {
      releaseRenderWindowFreeze()
      await refreshRenderWindowAfterLayoutTransition()
    }
  }

  async function handleLayoutChange(layout = null) {
    const nextLayout = normalizeLayout(layout)
    const currentLayout = viewerLayout.value

    if (
      nextLayout.width === currentLayout.width &&
      nextLayout.height === currentLayout.height
    ) {
      return
    }

    // During active controlled zoom, defer layout changes to avoid
    // corrupting the zoom's recomputeLayout cycle. The deferred layout
    // is applied after zoom recompute completes.
    if (controlledZoomSeq > 0) {
      deferredZoomLayout = nextLayout
      viewerLayout.value = nextLayout
      return
    }

    layoutChangeSeq += 1
    const layoutSeq = layoutChangeSeq
    const contentSeqAtStart = contentTransitionSeq
    const suppressRestoreForControlledTransition = suppressedLayoutRestoreSeq === contentSeqAtStart
    const pendingPdfAnchor = pendingPdfBackedAnchor?.transitionSeq === contentSeqAtStart
      ? pendingPdfBackedAnchor.anchor
      : null
    const shouldFreezeRenderWindow = !!pendingPdfAnchor || (
      contentSeqAtStart > 0 && suppressedLayoutRestoreSeq === contentSeqAtStart
    )

    const anchors = captureControlledTransitionAnchors()

    beginScrollSyncSuppression()
    if (shouldFreezeRenderWindow) {
      acquireRenderWindowFreeze()
    }
    try {
      viewerLayout.value = nextLayout
      if (hasDocument.value) {
        await recomputeLayout(buildLayoutRequest(nextLayout))
        await nextTick()

        if (contentSeqAtStart !== contentTransitionSeq) {
          return
        }
        if (layoutSeq !== layoutChangeSeq) {
          return
        }
        if (pendingPdfAnchor) {
          pendingPdfBackedAnchor = null
          restoreControlledTransitionAnchors({
            originalAnchor: pendingPdfAnchor,
            translatedAnchor: anchors.translatedAnchor
          })
          return
        }
        if (suppressRestoreForControlledTransition || suppressedLayoutRestoreSeq === contentSeqAtStart) {
          return
        }

        restoreControlledTransitionAnchors(anchors)
      }
    } finally {
      if (shouldFreezeRenderWindow) {
        releaseRenderWindowFreeze()
      }
      scheduleScrollSyncSuppressionClear()
    }
  }

  async function runControlledZoomTransition(resolvedOriginalAnchor, finalTranslatedAnchor) {
    const zoomSeq = beginControlledZoomSuppression()
    acquireRenderWindowFreeze()
    beginScrollSyncSuppression()
    try {
      await runWithCurrentPageSuppression(async () => {
        await recomputeLayout(buildLayoutRequest())
        await nextTick()
        await applyDeferredZoomLayout()
        restoreControlledTransitionAnchors({
          originalAnchor: resolvedOriginalAnchor,
          translatedAnchor: finalTranslatedAnchor
        })
      })
    } finally {
      deferredZoomLayout = null
      releaseRenderWindowFreeze()
      endControlledZoomSuppression(zoomSeq)
      scheduleScrollSyncSuppressionClear()
    }
    refreshCurrentPage()
  }

  async function handleZoomChange({ mode, value }) {
    async function applyFitMode(fitMode) {
      if (zoomMode.value === fitMode) return

      const previousZoomMode = zoomMode.value
      zoomMode.value = fitMode

      if (hasDocument.value) {
        const anchors = captureControlledTransitionAnchors()
        const shouldNormalizeExitFromFitPage = previousZoomMode === 'fit-page'
          && fitMode !== 'fit-page'
          && anchors.originalAnchor?.offsetRatio <= 0.01
        const resolvedOriginalAnchor = fitMode === 'fit-page'
          ? normalizeFitPagePdfAnchor(anchors.originalAnchor)
          : shouldNormalizeExitFromFitPage
            ? normalizeFitPageDomRootAnchor(anchors.originalAnchor)
            : anchors.originalAnchor
        await runControlledZoomTransition(resolvedOriginalAnchor, resolveTranslatedZoomAnchor(resolvedOriginalAnchor, anchors.translatedAnchor))
      }
    }

    switch (mode) {
      case 'fit-page':
      case 'fit-width':
        await applyFitMode(mode)
        break

      case 'percent': {
        const nextPercent = clampZoomPercent(Number(value))

        if (zoomMode.value === 'percent' && zoomPercent.value === nextPercent) {
          return
        }

        zoomMode.value = 'percent'
        zoomPercent.value = nextPercent

        if (hasDocument.value) {
          const { originalAnchor, translatedAnchor } = captureControlledTransitionAnchors()
          await runControlledZoomTransition(originalAnchor, resolveTranslatedZoomAnchor(originalAnchor, translatedAnchor))
        }
        break
      }

      default:
        break
    }
  }

  async function handleZoomStep(direction) {
    const currentPercent = zoomPercent.value
    const currentIndex = ZOOM_PERCENT_OPTIONS.indexOf(currentPercent)
    const safeIndex = currentIndex >= 0 ? currentIndex : ZOOM_PERCENT_OPTIONS.indexOf(100)
    const nextIndex = Math.min(
      ZOOM_PERCENT_OPTIONS.length - 1,
      Math.max(0, safeIndex + Number(direction || 0))
    )
    const nextPercent = ZOOM_PERCENT_OPTIONS[nextIndex] || 100

    if (zoomMode.value === 'percent' && zoomPercent.value === nextPercent) {
      return
    }

    zoomMode.value = 'percent'
    zoomPercent.value = nextPercent

    if (hasDocument.value) {
      const { originalAnchor, translatedAnchor } = captureControlledTransitionAnchors()
      await runControlledZoomTransition(originalAnchor, resolveTranslatedZoomAnchor(originalAnchor, translatedAnchor))
    }
  }

  function normalizeLayout(layout = null) {
    if (typeof layout === 'number') {
      return {
        width: Math.max(0, Math.floor(Number(layout) || 0)),
        height: 0
      }
    }

    return {
      width: Math.max(0, Math.floor(Number(layout?.width) || 0)),
      height: Math.max(0, Math.floor(Number(layout?.height) || 0))
    }
  }

  function buildLayoutRequest(layout = viewerLayout.value) {
    const normalizedLayout = normalizeLayout(layout)
    const canvasSlot = resolvePdfCanvasSlot(normalizedLayout)
    return {
      width: normalizedLayout.width > 0 ? normalizedLayout.width : DEFAULT_VIEWER_WIDTH,
      height: normalizedLayout.height,
      availableCanvasWidth: canvasSlot.availableCanvasWidth,
      availableCanvasHeight: canvasSlot.availableCanvasHeight,
      zoomMode: zoomMode.value,
      zoomPercent: zoomPercent.value
    }
  }

  function clampZoomPercent(value) {
    const nearest = ZOOM_PERCENT_OPTIONS.reduce((best, option) => {
      if (!best) return option
      return Math.abs(option - value) < Math.abs(best - option) ? option : best
    }, 0)

    return nearest || 100
  }

  function resetViewerState() {
    zoomMode.value = 'fit-width'
    zoomPercent.value = 100
    viewerLayout.value = { width: 0, height: 0 }
  }

  return {
    handleContentViewChange,
    handleLayoutModeChange,
    handleLayoutChange,
    handleZoomChange,
    handleZoomStep,
    currentPageUpdatesSuppressed,
    renderWindowEvictionFrozen,
    suppressScrollSync,
    buildLayoutRequest,
    resetViewerState,
    zoomMode,
    zoomPercent
  }
}
