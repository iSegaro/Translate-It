import { nextTick, onBeforeUnmount, ref, unref } from 'vue'
import { CONTENT_VIEW } from './usePdfViewerMode.js'
import { captureScrollAnchor, restoreScrollAnchor, capturePdfBackedScrollAnchor, restorePdfBackedScrollAnchor } from '../utils/pdfScrollAnchor.js'

const PDF_SCROLL_OWNER = Object.freeze({
  ORIGINAL: 'original',
  TRANSLATED: 'translated'
})

const ZOOM_PERCENT_OPTIONS = [50, 75, 100, 125, 150, 200]

const DEFAULT_VIEWER_WIDTH = 960

export function createPdfTransitionController({
  contentView,
  isSideBySide,
  showOriginalPane,
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
  pdfViewerLayoutRef
}) {
  let contentTransitionSeq = 0
  let layoutChangeSeq = 0
  let suppressedLayoutRestoreSeq = 0
  let suppressedLayoutRestoreFrameId = null
  let pendingPdfBackedAnchor = null

  const zoomMode = ref('fit-width')
  const zoomPercent = ref(100)
  const viewerLayout = ref({ width: 0, height: 0 })

  onBeforeUnmount(() => {
    clearControlledTransitionSuppressionTimer()
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

  function resolveScrollAnchor() {
    if (!showOriginalPane.value && showTranslatedTextPane.value) {
      const container = translatedScrollContainer.value
      if (container) {
        return { container, selector: '.pdf-translated-page[data-page-number]' }
      }
    }
    return { container: originalScrollContainer.value, selector: '.pdf-page[data-page-number]' }
  }

  function resolveAnchorOwner(explicitOwner) {
    if (explicitOwner === PDF_SCROLL_OWNER.ORIGINAL || explicitOwner === PDF_SCROLL_OWNER.TRANSLATED) {
      return explicitOwner
    }

    return contentView.value === CONTENT_VIEW.TRANSLATION
      ? PDF_SCROLL_OWNER.TRANSLATED
      : PDF_SCROLL_OWNER.ORIGINAL
  }

  function resolveOwnerScrollTarget(owner) {
    if (owner === PDF_SCROLL_OWNER.TRANSLATED) {
      if (showTranslatedTextPane.value && translatedScrollContainer.value) {
        return { owner, container: translatedScrollContainer.value, selector: '.pdf-translated-page[data-page-number]' }
      }

      if (showTranslatedPdfPane.value && translatedScrollContainer.value) {
        return { owner, container: translatedScrollContainer.value, selector: '.pdf-page[data-page-number]' }
      }
    }

    if (originalScrollContainer.value) {
      return { owner: PDF_SCROLL_OWNER.ORIGINAL, container: originalScrollContainer.value, selector: '.pdf-page[data-page-number]' }
    }

    if (translatedScrollContainer.value) {
      const selector = showTranslatedTextPane.value
        ? '.pdf-translated-page[data-page-number]'
        : '.pdf-page[data-page-number]'
      return { owner: PDF_SCROLL_OWNER.TRANSLATED, container: translatedScrollContainer.value, selector }
    }

    return { owner, container: null, selector: '.pdf-page[data-page-number]' }
  }

  function captureOwnedScrollAnchor(owner) {
    const target = resolveOwnerScrollTarget(owner)
    const anchor = captureScrollAnchor(target.container, target.selector)
    return anchor ? { ...anchor, owner: target.owner } : null
  }

  function capturePdfAwareOwnedScrollAnchor(owner) {
    if (isPdfBackedContentView(contentView.value)) {
      const target = resolveOwnerScrollTarget(owner)
      const pdfSession = unref(session) ?? null
      const pdfAnchor = capturePdfBackedScrollAnchor(target.container, target.selector, pdfSession)
      return pdfAnchor
        ? { owner, ...pdfAnchor }
        : captureOwnedScrollAnchor(owner)
    }

    return captureOwnedScrollAnchor(owner)
  }

  function isPdfBackedPdfTransition(previousView, nextView) {
    return isPdfBackedContentView(previousView) && isPdfBackedContentView(nextView) && previousView !== nextView
  }

  function isPdfBackedContentView(view) {
    return view === CONTENT_VIEW.ORIGINAL || view === CONTENT_VIEW.TRANSLATED_PDF
  }

  function isTranslatedTextPdfBackedTransition(previousView, nextView) {
    return (
      previousView === CONTENT_VIEW.TRANSLATION && isPdfBackedContentView(nextView)
    ) || (
      isPdfBackedContentView(previousView) && nextView === CONTENT_VIEW.TRANSLATION
    )
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

  function restoreOwnedScrollAnchor(anchor) {
    if (!anchor) return null

    const preferredTarget = resolveOwnerScrollTarget(anchor.owner)
    const pdfSession = unref(session) ?? null

    if (anchor.pdfPoint && restorePdfBackedScrollAnchor(anchor, preferredTarget.container, preferredTarget.selector, pdfSession)) {
      return preferredTarget.owner
    }

    const preferredAnchor = preferredTarget.owner === anchor.owner
      ? anchor
      : { ...anchor, owner: preferredTarget.owner, offsetRatio: 0 }
    const restoredOwner = restoreScrollAnchor(preferredAnchor, preferredTarget.container, preferredTarget.selector)
      ? preferredTarget.owner
      : null

    if (restoredOwner) return restoredOwner

    const fallbackOwner = anchor.owner === PDF_SCROLL_OWNER.TRANSLATED
      ? PDF_SCROLL_OWNER.ORIGINAL
      : PDF_SCROLL_OWNER.TRANSLATED
    const fallbackTarget = resolveOwnerScrollTarget(fallbackOwner)
    const fallbackAnchor = fallbackTarget.owner === anchor.owner
      ? anchor
      : { ...anchor, owner: fallbackTarget.owner, offsetRatio: 0 }

    return restoreScrollAnchor(fallbackAnchor, fallbackTarget.container, fallbackTarget.selector)
      ? fallbackTarget.owner
      : null
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
    pendingPdfBackedAnchor = isPdfBackedTransition && anchor?.pdfPoint
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
    pendingPdfBackedAnchor = anchor?.pdfPoint
      ? { transitionSeq: contentTransitionSeq, anchor }
      : null
    setLayoutMode(mode)

    await nextTick()

    if (anchor?.pdfPoint) {
      scheduleControlledTransitionSuppressionClear()
      return
    }

    const restoredOwner = restoreOwnedScrollAnchor(anchor)

    if (isSideBySide.value) {
      syncFromOwner(restoredOwner || anchor?.owner || owner)
    }
    scheduleControlledTransitionSuppressionClear()
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

    layoutChangeSeq += 1
    const layoutSeq = layoutChangeSeq
    const contentSeqAtStart = contentTransitionSeq
    const suppressRestoreForControlledTransition = suppressedLayoutRestoreSeq === contentSeqAtStart
    const pendingPdfAnchor = pendingPdfBackedAnchor?.transitionSeq === contentSeqAtStart
      ? pendingPdfBackedAnchor.anchor
      : null

    const owner = resolveAnchorOwner()
    const { container, selector } = resolveScrollAnchor()
    const pdfSession = unref(session) ?? null
    const rawAnchor = isPdfBackedContentView(contentView.value)
      && capturePdfBackedScrollAnchor(container, selector, pdfSession)
    const anchor = rawAnchor
      ? { owner, ...rawAnchor }
      : captureScrollAnchor(container, selector)
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
        restoreOwnedScrollAnchor(pendingPdfAnchor)
        syncFromOwner(resolveAnchorOwner())
        return
      }
      if (suppressRestoreForControlledTransition || suppressedLayoutRestoreSeq === contentSeqAtStart) {
        return
      }

      if (anchor?.pdfPoint) {
        restoreOwnedScrollAnchor(anchor)
      } else {
        restoreScrollAnchor(anchor, container, selector)
      }
      syncFromOwner(resolveAnchorOwner())
    }
  }

  async function handleZoomChange({ mode, value }) {
    if (mode === 'fit-page') {
      if (zoomMode.value === 'fit-page') {
        return
      }

      zoomMode.value = 'fit-page'

      if (hasDocument.value) {
        const { container, selector } = resolveScrollAnchor()
        const anchor = captureScrollAnchor(container, selector)
        await recomputeLayout(buildLayoutRequest())
        await nextTick()
        restoreScrollAnchor(anchor, container, selector)
        syncFromOwner(resolveAnchorOwner())
      }
      return
    }

    if (mode === 'fit-width') {
      if (zoomMode.value === 'fit-width') {
        return
      }

      zoomMode.value = 'fit-width'

      if (hasDocument.value) {
        const { container, selector } = resolveScrollAnchor()
        const anchor = captureScrollAnchor(container, selector)
        await recomputeLayout(buildLayoutRequest())
        await nextTick()
        restoreScrollAnchor(anchor, container, selector)
        syncFromOwner(resolveAnchorOwner())
      }
      return
    }

    const nextPercent = clampZoomPercent(Number(value))
    if (zoomMode.value === 'percent' && zoomPercent.value === nextPercent) {
      return
    }

    const { container, selector } = resolveScrollAnchor()
    const anchor = captureScrollAnchor(container, selector)

    zoomMode.value = 'percent'
    zoomPercent.value = nextPercent

    if (hasDocument.value) {
      await recomputeLayout(buildLayoutRequest())
      await nextTick()
      restoreScrollAnchor(anchor, container, selector)
      syncFromOwner(resolveAnchorOwner())
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

    const { container, selector } = resolveScrollAnchor()
    const anchor = captureScrollAnchor(container, selector)

    zoomMode.value = 'percent'
    zoomPercent.value = nextPercent

    if (hasDocument.value) {
      await recomputeLayout(buildLayoutRequest())
      await nextTick()
      restoreScrollAnchor(anchor, container, selector)
      syncFromOwner(resolveAnchorOwner())
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
    return {
      width: normalizedLayout.width > 0 ? normalizedLayout.width : DEFAULT_VIEWER_WIDTH,
      height: normalizedLayout.height,
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
    buildLayoutRequest,
    resetViewerState,
    zoomMode,
    zoomPercent
  }
}
