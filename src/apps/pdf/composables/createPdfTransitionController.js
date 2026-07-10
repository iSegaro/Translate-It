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
  let currentPageSuppressionDepth = 0

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

  function beginCurrentPageSuppression({ owner = 'layout-mode', transitionSeq = null, pageNumber = null, reason = '' } = {}) {
    currentPageSuppressionDepth += 1
    syncCurrentPageSuppressionState()
    console.log('[LAYOUT-DIAG][current-page-suppression]', JSON.stringify({
      action: 'acquire',
      owner,
      depth: currentPageSuppressionDepth,
      transitionSeq,
      pageNumber,
      reason
    }))
  }

  function endCurrentPageSuppression({ owner = 'layout-mode', transitionSeq = null, pageNumber = null, reason = '' } = {}) {
    if (currentPageSuppressionDepth === 0) {
      console.log('[LAYOUT-DIAG][current-page-suppression]', JSON.stringify({
        action: 'underflow-prevented',
        owner,
        depth: currentPageSuppressionDepth,
        transitionSeq,
        pageNumber,
        reason
      }))
      syncCurrentPageSuppressionState()
      return
    }

    currentPageSuppressionDepth = Math.max(0, currentPageSuppressionDepth - 1)
    console.log('[LAYOUT-DIAG][current-page-suppression]', JSON.stringify({
      action: currentPageSuppressionDepth > 0 ? 'retained' : 'release',
      owner,
      depth: currentPageSuppressionDepth,
      transitionSeq,
      pageNumber,
      reason
    }))
    syncCurrentPageSuppressionState()
  }

  function clearPendingPdfBackedAnchor(reason = '', transitionSeq = null) {
    if (!pendingPdfBackedAnchor) return

    if (transitionSeq != null && pendingPdfBackedAnchor.transitionSeq !== transitionSeq) {
      return
    }

    const { transitionSeq: pendingTransitionSeq, anchor, ownsCurrentPageSuppression } = pendingPdfBackedAnchor
    if (ownsCurrentPageSuppression) {
      endCurrentPageSuppression({
        owner: 'pending-pdf-anchor',
        transitionSeq: pendingTransitionSeq,
        pageNumber: anchor?.pageNumber ?? null,
        reason
      })
    }
    pendingPdfBackedAnchor = null
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
    clearPendingPdfBackedAnchor('unmount')
    deferredZoomLayout = null
  })

  function beginControlledTransition() {
    clearPendingPdfBackedAnchor('begin-controlled-transition')
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

  function refreshCurrentPage() {
    pdfViewerRef.value?.refreshCurrentPage?.()
    pdfTranslatedPaneRef.value?.refreshCurrentPage?.()
  }

  async function runWithCurrentPageSuppression(work) {
    beginCurrentPageSuppression({ owner: 'zoom', reason: 'controlled-zoom' })
    try {
      return await work()
    } finally {
      endCurrentPageSuppression({ owner: 'zoom', reason: 'controlled-zoom' })
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
    console.log('[LAYOUT-DIAG][layout]', JSON.stringify({
      reason: 'applyDeferredZoomLayout',
      controlledZoomSeq,
      contentTransitionSeq,
      suppressedLayoutRestoreSeq
    }))
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
    console.log('[LAYOUT-DIAG][transition-start]', JSON.stringify({
      seq: contentTransitionSeq,
      fromView: contentView.value,
      toView: nextView,
      layoutMode: isSideBySide.value ? 'side-by-side' : 'single',
      currentPage: currentPage.value,
      originalScrollTop: originalScrollContainer.value?.scrollTop ?? 0,
      translatedScrollTop: translatedScrollContainer.value?.scrollTop ?? 0
    }))
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
      ? { transitionSeq: contentTransitionSeq, anchor, ownsCurrentPageSuppression: true }
      : null
    if (pendingPdfBackedAnchor) {
      beginCurrentPageSuppression({
        owner: 'pending-pdf-anchor',
        transitionSeq: pendingPdfBackedAnchor.transitionSeq,
        pageNumber: pendingPdfBackedAnchor.anchor?.pageNumber ?? null,
        reason: 'content-transition-pending-anchor'
      })
      console.log('[LAYOUT-DIAG][pending-anchor]', JSON.stringify({
        action: 'created',
        transitionSeq: pendingPdfBackedAnchor.transitionSeq,
        pageNumber: pendingPdfBackedAnchor.anchor?.pageNumber ?? null,
        widthChanged: null,
        currentWidth: viewerLayout.value.width,
        nextWidth: viewerLayout.value.width
      }))
    }

    setContentView(nextView)

    try {
      await nextTick()

      const restoredOwner = restoreOwnedScrollAnchor(anchor)
      if (restoredOwner && isPdfBackedTransition && isPdfAnchor(anchor)) {
        console.log('[LAYOUT-DIAG][pending-anchor]', JSON.stringify({
          action: 'provisional-restore',
          transitionSeq: contentTransitionSeq,
          pageNumber: anchor?.pageNumber ?? null,
          widthChanged: null,
          currentWidth: viewerLayout.value.width,
          nextWidth: viewerLayout.value.width
        }))
        if (!isSideBySide.value && !showTranslatedPdfPane.value) {
          clearPendingPdfBackedAnchor('provisional-restore-no-layout-change', contentTransitionSeq)
        }
      }

      if (isSideBySide.value) {
        syncFromOwner(restoredOwner || anchor?.owner || owner)
      }
      scheduleControlledTransitionSuppressionClear()
    } catch (error) {
      clearPendingPdfBackedAnchor('content-view-error', contentTransitionSeq)
      throw error
    }
  }

  async function handleLayoutModeChange(mode) {
    console.log('[LAYOUT-DIAG][event-chain]', JSON.stringify({
      source: 'handleLayoutModeChange',
      reason: 'toolbar-toggle',
      mode,
      contentView: contentView.value,
      currentPage: currentPage.value,
      contentTransitionSeq,
      controlledZoomSeq,
      suppressedLayoutRestoreSeq,
      renderWindowFrozen: renderWindowEvictionFrozen.value,
      currentPageSuppressed: currentPageUpdatesSuppressed.value
    }))
    console.log('[LAYOUT-DIAG][transition-start]', JSON.stringify({
      seq: contentTransitionSeq,
      fromLayout: viewerLayout.value,
      toLayout: mode,
      contentView: contentView.value,
      currentPage: currentPage.value,
      originalScrollTop: originalScrollContainer.value?.scrollTop ?? 0,
      translatedScrollTop: translatedScrollContainer.value?.scrollTop ?? 0
    }))
    const owner = resolveAnchorOwner()
    const anchor = capturePdfAwareOwnedScrollAnchor(owner)

    beginControlledTransition()
    pendingPdfBackedAnchor = isPdfAnchor(anchor)
      ? { transitionSeq: contentTransitionSeq, anchor, ownsCurrentPageSuppression: false }
      : null
    acquireRenderWindowFreeze()
    beginCurrentPageSuppression({
      owner: 'layout-mode',
      transitionSeq: contentTransitionSeq,
      reason: 'layout-mode-transition'
    })
    try {
      setLayoutMode(mode)

      await nextTick()

      if (isSideBySide.value && showTranslatedPdfPane.value) {
        syncFromOwner(owner)
        scheduleControlledTransitionSuppressionClear()
        console.log('[LAYOUT-DIAG][transition-end]', JSON.stringify({
          seq: contentTransitionSeq,
          currentPage: currentPage.value,
          originalScrollTop: originalScrollContainer.value?.scrollTop ?? 0,
          translatedScrollTop: translatedScrollContainer.value?.scrollTop ?? 0,
          layoutMode: mode
        }))
        return
      }

      if (isPdfAnchor(anchor)) {
        scheduleControlledTransitionSuppressionClear()
        console.log('[LAYOUT-DIAG][transition-end]', JSON.stringify({
          seq: contentTransitionSeq,
          currentPage: currentPage.value,
          originalScrollTop: originalScrollContainer.value?.scrollTop ?? 0,
          translatedScrollTop: translatedScrollContainer.value?.scrollTop ?? 0,
          layoutMode: mode
        }))
        return
      }

      const restoredOwner = restoreOwnedScrollAnchor(anchor)

      if (isSideBySide.value) {
        syncFromOwner(restoredOwner || anchor?.owner || owner)
      }
      scheduleControlledTransitionSuppressionClear()
    } finally {
      try {
        releaseRenderWindowFreeze()
        await refreshRenderWindowAfterLayoutTransition()
        console.log('[LAYOUT-DIAG][transition-end]', JSON.stringify({
          seq: contentTransitionSeq,
          currentPage: currentPage.value,
          originalScrollTop: originalScrollContainer.value?.scrollTop ?? 0,
          translatedScrollTop: translatedScrollContainer.value?.scrollTop ?? 0,
          layoutMode: mode
        }))
      } finally {
        endCurrentPageSuppression({
          owner: 'layout-mode',
          transitionSeq: contentTransitionSeq,
          reason: 'layout-mode-transition'
        })
        refreshCurrentPage()
      }
    }
  }

  async function handleLayoutChange(layout = null) {
    const nextLayout = normalizeLayout(layout)
    const currentLayout = viewerLayout.value

    console.log('[LAYOUT-DIAG][event-chain]', JSON.stringify({
      source: 'handleLayoutChange',
      reason: 'layout-change-event',
      nextWidth: nextLayout.width,
      nextHeight: nextLayout.height,
      currentWidth: currentLayout.width,
      currentHeight: currentLayout.height,
      sameSize: nextLayout.width === currentLayout.width && nextLayout.height === currentLayout.height,
      contentTransitionSeq,
      controlledZoomSeq,
      suppressedLayoutRestoreSeq,
      hasPendingPdfBackedAnchor: !!pendingPdfBackedAnchor,
      renderWindowFrozen: renderWindowEvictionFrozen.value,
      currentPageSuppressed: currentPageUpdatesSuppressed.value,
      layoutMode: isSideBySide.value ? 'side-by-side' : 'single',
      contentView: contentView.value
    }))

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
    const widthChanged = nextLayout.width !== currentLayout.width
    const pendingPdfAnchorForTransition = pendingPdfBackedAnchor?.transitionSeq === contentSeqAtStart
      ? pendingPdfBackedAnchor.anchor
      : null
    if (pendingPdfBackedAnchor && pendingPdfBackedAnchor.transitionSeq !== contentSeqAtStart) {
      console.log('[LAYOUT-DIAG][pending-anchor]', JSON.stringify({
        action: 'stale-discarded',
        transitionSeq: pendingPdfBackedAnchor.transitionSeq,
        pageNumber: pendingPdfBackedAnchor.anchor?.pageNumber ?? null,
        widthChanged,
        currentWidth: currentLayout.width,
        nextWidth: nextLayout.width
      }))
    }
    const suppressRestoreForControlledTransition = suppressedLayoutRestoreSeq === contentSeqAtStart
    const pendingPdfAnchor = pendingPdfAnchorForTransition
    const shouldFreezeRenderWindow = !!pendingPdfAnchor || (
      contentSeqAtStart > 0 && suppressedLayoutRestoreSeq === contentSeqAtStart
    )
    const capturedAnchors = pendingPdfAnchorForTransition ? null : (captureControlledTransitionAnchors() || { originalAnchor: null, translatedAnchor: null })
    const translatedAnchor = pendingPdfAnchorForTransition
      ? deriveTranslatedAnchorFromOriginal?.(pendingPdfAnchorForTransition) || null
      : capturedAnchors.translatedAnchor
    if (pendingPdfAnchorForTransition) {
      console.log('[LAYOUT-DIAG][layout-race]', JSON.stringify({
        action: 'pending-anchor-wins',
        layoutSeq,
        currentLayoutSeq: layoutChangeSeq,
        contentSeqAtStart,
        currentContentSeq: contentTransitionSeq,
        pendingPage: pendingPdfAnchorForTransition?.pageNumber ?? null,
        widthChanged
      }))
      console.log('[LAYOUT-DIAG][translated-sync]', JSON.stringify({
        action: 'derived-from-original',
        transitionSeq: contentSeqAtStart,
        layoutSeq,
        originalPage: pendingPdfAnchorForTransition?.pageNumber ?? null,
        derivedTranslatedPage: translatedAnchor?.pageNumber ?? null,
        originalOffsetRatio: pendingPdfAnchorForTransition?.offsetRatio ?? null,
        derivedOffsetRatio: translatedAnchor?.offsetRatio ?? null
      }))
    }

    console.log('[LAYOUT-DIAG][layout]', JSON.stringify({
      seq: layoutChangeSeq,
      reason: 'handleLayoutChange',
      controlledZoomSeq,
      contentTransitionSeq: contentSeqAtStart,
      suppressedLayoutRestoreSeq,
      suppressRestoreForControlledTransition,
      hasPendingPdfAnchor: !!pendingPdfAnchor,
      shouldFreezeRenderWindow
    }))

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
          console.log('[LAYOUT-DIAG][layout-race]', JSON.stringify({
            action: 'stale-transition',
            layoutSeq,
            currentLayoutSeq: layoutChangeSeq,
            contentSeqAtStart,
            currentContentSeq: contentTransitionSeq,
            pendingPage: pendingPdfAnchorForTransition?.pageNumber ?? null,
            widthChanged
          }))
          return
        }
        if (layoutSeq !== layoutChangeSeq) {
          console.log('[LAYOUT-DIAG][layout-race]', JSON.stringify({
            action: 'stale-layout',
            layoutSeq,
            currentLayoutSeq: layoutChangeSeq,
            contentSeqAtStart,
            currentContentSeq: contentTransitionSeq,
            pendingPage: pendingPdfAnchorForTransition?.pageNumber ?? null,
            widthChanged
          }))
          return
        }
        if (pendingPdfAnchor) {
          console.log('[LAYOUT-DIAG][translated-sync]', JSON.stringify({
            action: 'restore-input',
            transitionSeq: contentSeqAtStart,
            layoutSeq,
            originalPage: pendingPdfAnchor?.pageNumber ?? null,
            translatedPage: translatedAnchor?.pageNumber ?? null,
            originalOffsetRatio: pendingPdfAnchor?.offsetRatio ?? null,
            derivedOffsetRatio: translatedAnchor?.offsetRatio ?? null
          }))
          try {
            restoreControlledTransitionAnchors({
              originalAnchor: pendingPdfAnchor,
              translatedAnchor
            })
          } finally {
            console.log('[LAYOUT-DIAG][pending-anchor]', JSON.stringify({
              action: 'consumed',
              transitionSeq: contentSeqAtStart,
              pageNumber: pendingPdfAnchor?.pageNumber ?? null,
              widthChanged,
              currentWidth: currentLayout.width,
              nextWidth: nextLayout.width
            }))
            clearPendingPdfBackedAnchor('authoritative-layout-consume', contentSeqAtStart)
            console.log('[LAYOUT-DIAG][layout-race]', JSON.stringify({
              action: 'restored',
              layoutSeq,
              currentLayoutSeq: layoutChangeSeq,
              contentSeqAtStart,
              currentContentSeq: contentTransitionSeq,
              pendingPage: pendingPdfAnchor?.pageNumber ?? null,
              widthChanged
            }))
          }
          return
        }
        if (suppressRestoreForControlledTransition || suppressedLayoutRestoreSeq === contentSeqAtStart) {
          return
        }

        restoreControlledTransitionAnchors(capturedAnchors)
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
    renderWindowEvictionFrozen,
    suppressScrollSync,
    buildLayoutRequest,
    resetViewerState,
    zoomMode,
    zoomPercent
  }
}
