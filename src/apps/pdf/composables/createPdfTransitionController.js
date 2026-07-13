import { nextTick, onBeforeUnmount, ref, unref } from 'vue'
import { CONTENT_VIEW } from './usePdfViewerMode.js'
import { captureScrollAnchor, capturePdfBackedScrollAnchor, isPdfAnchor } from '../utils/pdfScrollAnchor.js'
import { resolvePdfCanvasSlot } from '../utils/pdfFitPageFootprint.js'
import { createPdfTransitionAnchor, PDF_SCROLL_OWNER, isPdfBackedContentView } from './createPdfTransitionAnchor.js'
import { resolveEffectivePaneTopology, doesOriginalPaneLayoutChange } from '../utils/pdfViewerTopology.js'
const ZOOM_PERCENT_OPTIONS = [50, 75, 100, 125, 150, 200]

const DEFAULT_VIEWER_WIDTH = 960

export function createPdfTransitionController({
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
}) {
  let contentTransitionSeq = 0
  let layoutChangeSeq = 0
  let scrollSyncSuppressionFrameId = null
  let controlledZoomSeq = 0
  let pendingTransitionRestore = null
  let deferredZoomLayout = null
  let renderWindowFreezeDepth = 0
  let currentPageSuppressionDepth = 0

  function _getSuppressionDebugState() {
    return {
      depth: currentPageSuppressionDepth,
      suppressed: currentPageSuppressionDepth > 0,
      pendingToken: pendingTransitionRestore
        ? { seq: pendingTransitionRestore.transitionSeq, owns: pendingTransitionRestore.ownsCurrentPageSuppression }
        : null
    }
  }

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

  function syncCurrentPageSuppressionState() {
    currentPageUpdatesSuppressed.value = currentPageSuppressionDepth > 0
  }

  function beginCurrentPageSuppression() {
    currentPageSuppressionDepth += 1
    syncCurrentPageSuppressionState()
  }

  function endCurrentPageSuppression() {
    if (currentPageSuppressionDepth === 0) {
      syncCurrentPageSuppressionState()
      return
    }

    currentPageSuppressionDepth = Math.max(0, currentPageSuppressionDepth - 1)
    syncCurrentPageSuppressionState()
  }

  function clearPendingTransitionRestore(transitionSeq = null) {

    if (!pendingTransitionRestore) {
      return { cleared: false, releasedCurrentPageSuppression: false }
    }

    if (transitionSeq != null && pendingTransitionRestore.transitionSeq !== transitionSeq) {
      return { cleared: false, releasedCurrentPageSuppression: false }
    }

    const { ownsCurrentPageSuppression } = pendingTransitionRestore
    let releasedCurrentPageSuppression = false
    if (ownsCurrentPageSuppression) {
      endCurrentPageSuppression()
      releasedCurrentPageSuppression = true
    }
    pendingTransitionRestore = null
    return { cleared: true, releasedCurrentPageSuppression }
  }

  const {
    resolveAnchorOwner,
    resolveOwnerScrollTarget,
    capturePdfAwareOwnedScrollAnchor,
    captureControlledTransitionAnchors,
    restoreOwnedScrollAnchor,
    restoreControlledTransitionAnchors,
    deriveTranslatedAnchorFromOriginal,
    deriveOriginalAnchorFromTranslated,
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
    clearScrollSyncSuppressionTimer()
    clearPendingTransitionRestore('unmount')
    deferredZoomLayout = null
  })

  function getPendingTransitionRestoreForCurrentTransition(transitionSeq) {
    return pendingTransitionRestore?.transitionSeq === transitionSeq
      ? pendingTransitionRestore
      : null
  }

  function beginControlledTransition() {
    clearPendingTransitionRestore('begin-controlled-transition')
    contentTransitionSeq += 1
  }

  function clearScrollSyncSuppressionTimer() {
    if (scrollSyncSuppressionFrameId != null) {
      cancelAnimationFrame(scrollSyncSuppressionFrameId)
      scrollSyncSuppressionFrameId = null
    }
  }

  function refreshCurrentPage() {
    pdfViewerRef.value?.refreshCurrentPage?.()
    pdfTranslatedPaneRef.value?.refreshCurrentPage?.()
  }

  function completePendingTransition(reason, transitionSeq, hasPrimaryError = false) {
    const clearResult = clearPendingTransitionRestore(reason, transitionSeq)
    if (clearResult.releasedCurrentPageSuppression) {
      if (hasPrimaryError) {
        try { refreshCurrentPage() } catch { /* best-effort */ }
      } else {
        refreshCurrentPage()
      }
    }
    return clearResult
  }

  async function runWithCurrentPageSuppression(work) {
    beginCurrentPageSuppression()
    try {
      return await work()
    } finally {
      endCurrentPageSuppression()
    }
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
    const previousTopology = resolveEffectivePaneTopology({
      contentView: previousView,
      selectedLayoutMode: selectedLayoutMode?.value
    })
    const nextTopology = resolveEffectivePaneTopology({
      contentView: nextView,
      selectedLayoutMode: selectedLayoutMode?.value
    })
    const completionOwnedByLayout = doesOriginalPaneLayoutChange(previousTopology, nextTopology)
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
    const pdfAnchorForRestore = isPdfBackedTransition && isPdfAnchor(anchor) ? anchor : null
    pendingTransitionRestore = {
      transitionSeq: contentTransitionSeq,
      pdfAnchor: pdfAnchorForRestore,
      ownsCurrentPageSuppression: true
    }

    beginCurrentPageSuppression()

    try {
      setContentView(nextView)

      await nextTick()

      const restoredOwner = restoreOwnedScrollAnchor(anchor)

      if (!completionOwnedByLayout) {
        const clearResult = clearPendingTransitionRestore('provisional-complete', contentTransitionSeq)
        if (clearResult.releasedCurrentPageSuppression) {
          refreshCurrentPage()
        }
      }

      if (isSideBySide.value) {
        syncFromOwner(restoredOwner || anchor?.owner || owner)
      }
    } catch (error) {
      const errorClearResult = clearPendingTransitionRestore('content-view-error', contentTransitionSeq)
      if (errorClearResult.releasedCurrentPageSuppression) {
        refreshCurrentPage()
      }
      throw error
    }
  }

  async function handleLayoutModeChange(mode) {
    const owner = resolveAnchorOwner()
    const anchor = capturePdfAwareOwnedScrollAnchor(owner)

    const prevTopology = resolveEffectivePaneTopology({
      contentView: contentView.value,
      selectedLayoutMode: selectedLayoutMode.value
    })
    const nextTopology = resolveEffectivePaneTopology({
      contentView: contentView.value,
      selectedLayoutMode: mode
    })
    const origLayoutChanges = doesOriginalPaneLayoutChange(prevTopology, nextTopology)

    beginControlledTransition()
    const layoutPdfAnchor = isPdfAnchor(anchor) ? anchor : null
    const ownsPendingPdfSuppression = !!(layoutPdfAnchor && origLayoutChanges)
    pendingTransitionRestore = {
      transitionSeq: contentTransitionSeq,
      pdfAnchor: layoutPdfAnchor,
      ownerAnchor: layoutPdfAnchor ? null : anchor,
      ownsCurrentPageSuppression: ownsPendingPdfSuppression
    }

    let renderWindowFreezeAcquired = false
    let primaryErrorDuringCleanup = null

    try {
      acquireRenderWindowFreeze()
      renderWindowFreezeAcquired = true

      beginCurrentPageSuppression()

      setLayoutMode(mode)

      await nextTick()

      if (isSideBySide.value && showTranslatedPdfPane.value) {
        syncFromOwner(owner)
        return
      }

      if (isPdfAnchor(anchor)) {
        return
      }

      const restoredOwner = restoreOwnedScrollAnchor(anchor)

      if (isSideBySide.value) {
        syncFromOwner(restoredOwner || anchor?.owner || owner)
      }
    } catch (error) {
      primaryErrorDuringCleanup = error
      const clearResult = clearPendingTransitionRestore('layout-mode-error', contentTransitionSeq)
      if (clearResult.releasedCurrentPageSuppression) {
        refreshCurrentPage()
      }
      throw error
    } finally {
      try {
        if (renderWindowFreezeAcquired) {
          releaseRenderWindowFreeze()
        }
        try {
          await refreshRenderWindowAfterLayoutTransition()
        } catch (cleanupError) {
          if (primaryErrorDuringCleanup) {
            console.warn('[PdfTransitionController] Cleanup error suppressed:', cleanupError)
          } else {
            throw cleanupError
          }
        }
      } finally {
        if (!ownsPendingPdfSuppression) {
          endCurrentPageSuppression()
          refreshCurrentPage()
        }
      }
    }
  }

  async function handleLayoutChange(layout = null) {
    const nextLayout = normalizeLayout(layout)
    const currentLayout = viewerLayout.value
    const contentSeqAtStart = contentTransitionSeq
    const pendingTransitionRestoreForTransition = getPendingTransitionRestoreForCurrentTransition(contentSeqAtStart)

    if (
      nextLayout.width === currentLayout.width &&
      nextLayout.height === currentLayout.height
    ) {
      completePendingTransition('layout-no-dimension-change-consume', contentSeqAtStart)
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
    const pdfAnchorFromToken = pendingTransitionRestoreForTransition?.pdfAnchor ?? null
    const ownerAnchorFromToken = pendingTransitionRestoreForTransition?.ownerAnchor ?? null

    const shouldFreezeRenderWindow =
      contentSeqAtStart > 0 && pendingTransitionRestoreForTransition != null

    try {
      const pendingPdfAnchor = pdfAnchorFromToken
      let capturedAnchors = pendingTransitionRestoreForTransition?.pdfAnchor
        ? null
        : ownerAnchorFromToken
          ? null
          : (captureControlledTransitionAnchors() || { originalAnchor: null, translatedAnchor: null })
      const translatedAnchor = pendingTransitionRestoreForTransition?.pdfAnchor
        ? deriveTranslatedAnchorFromOriginal?.(pendingTransitionRestoreForTransition.pdfAnchor) || null
        : capturedAnchors?.translatedAnchor ?? null

      if (ownerAnchorFromToken && !pendingTransitionRestoreForTransition?.pdfAnchor) {
        if (ownerAnchorFromToken.owner === PDF_SCROLL_OWNER.ORIGINAL) {
          capturedAnchors = {
            originalAnchor: ownerAnchorFromToken,
            translatedAnchor: deriveTranslatedAnchorFromOriginal?.(ownerAnchorFromToken) || null
          }
        } else {
          capturedAnchors = {
            originalAnchor: deriveOriginalAnchorFromTranslated(ownerAnchorFromToken),
            translatedAnchor: ownerAnchorFromToken
          }
        }
      }
      beginScrollSyncSuppression()
      if (shouldFreezeRenderWindow) {
        acquireRenderWindowFreeze()
      }
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
          try {
            restoreControlledTransitionAnchors({
              originalAnchor: pendingPdfAnchor,
              translatedAnchor
            })
          } finally {
            completePendingTransition('authoritative-layout-consume', contentSeqAtStart)
          }
          return
        }
        try {
          restoreControlledTransitionAnchors(capturedAnchors)
        } finally {
          completePendingTransition('layout-consume', contentSeqAtStart)
        }
      }
    } catch (error) {
      completePendingTransition('layout-error', contentSeqAtStart, true)
      throw error
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
    const effectiveLayout = {
      width: normalizedLayout.width > 0 ? normalizedLayout.width : DEFAULT_VIEWER_WIDTH,
      height: normalizedLayout.height
    }
    const canvasSlot = resolvePdfCanvasSlot(effectiveLayout)
    return {
      width: effectiveLayout.width,
      height: effectiveLayout.height,
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
    __debugCurrentPageSuppression: {
      begin: beginCurrentPageSuppression,
      end: endCurrentPageSuppression,
      getDepth: () => currentPageSuppressionDepth
    },
    __debugSetPendingTransitionRestore: (value) => {
      pendingTransitionRestore = value
    },
    __debugGetSuppressionState: _getSuppressionDebugState,
    renderWindowEvictionFrozen,
    suppressScrollSync,
    buildLayoutRequest,
    resetViewerState,
    zoomMode,
    zoomPercent
  }
}
