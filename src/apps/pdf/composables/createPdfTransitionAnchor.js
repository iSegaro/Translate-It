import { unref } from 'vue'
import { CONTENT_VIEW } from './usePdfViewerMode.js'
import {
  captureScrollAnchor,
  capturePdfBackedScrollAnchor,
  restoreScrollAnchor,
  restorePdfBackedScrollAnchor,
  isPdfAnchor
} from '../utils/pdfScrollAnchor.js'

const PDF_SCROLL_OWNER = Object.freeze({
  ORIGINAL: 'original',
  TRANSLATED: 'translated'
})

function isPdfBackedContentView(view) {
  return view === CONTENT_VIEW.ORIGINAL || view === CONTENT_VIEW.TRANSLATED_PDF
}

export { PDF_SCROLL_OWNER, isPdfBackedContentView }

export function createPdfTransitionAnchor({
  contentView,
  isSideBySide,
  showTranslatedTextPane,
  showTranslatedPdfPane,
  session,
  originalScrollContainer,
  translatedScrollContainer,
  zoomMode,
  currentPage
}) {
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

  function resolveLayoutTransitionTarget(owner) {
    if (owner === PDF_SCROLL_OWNER.ORIGINAL) {
      return {
        owner,
        container: originalScrollContainer.value,
        selector: '.pdf-page[data-page-number]'
      }
    }

    return {
      owner: PDF_SCROLL_OWNER.TRANSLATED,
      container: translatedScrollContainer.value,
      selector: showTranslatedTextPane.value
        ? '.pdf-translated-page[data-page-number]'
        : '.pdf-page[data-page-number]'
    }
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
      return pdfAnchor ? { owner, ...pdfAnchor } : captureOwnedScrollAnchor(owner)
    }

    return captureOwnedScrollAnchor(owner)
  }

  function captureLayoutTransitionAnchor(owner) {
    const target = resolveLayoutTransitionTarget(owner)
    if (!target.container) return null

    if (owner === PDF_SCROLL_OWNER.ORIGINAL) {
      const pdfSession = unref(session) ?? null
      const pdfAnchor = capturePdfBackedScrollAnchor(target.container, target.selector, pdfSession)
      if (pdfAnchor) {
        return { owner, ...pdfAnchor }
      }
    }

    const anchor = captureScrollAnchor(target.container, target.selector)
    return anchor ? { owner, ...anchor } : null
  }

  function captureControlledTransitionAnchors() {
    return {
      originalAnchor: captureLayoutTransitionAnchor(PDF_SCROLL_OWNER.ORIGINAL),
      translatedAnchor: captureLayoutTransitionAnchor(PDF_SCROLL_OWNER.TRANSLATED)
    }
  }

  function deriveTranslatedAnchorFromOriginal(originalAnchor) {
    if (!originalAnchor?.pageNumber) return null

    return {
      owner: PDF_SCROLL_OWNER.TRANSLATED,
      pageNumber: originalAnchor.pageNumber,
      offsetRatio: originalAnchor.offsetRatio ?? 0
    }
  }

  function deriveOriginalAnchorFromTranslated(translatedAnchor) {
    if (!translatedAnchor?.pageNumber) return null

    return {
      owner: PDF_SCROLL_OWNER.ORIGINAL,
      pageNumber: translatedAnchor.pageNumber,
      offsetRatio: 0
    }
  }

  function resolveTranslatedZoomAnchor(originalAnchor, capturedTranslatedAnchor) {
    if (!isSideBySide.value) return capturedTranslatedAnchor

    return deriveTranslatedAnchorFromOriginal(originalAnchor) || capturedTranslatedAnchor
  }

  function restoreOwnedScrollAnchor(anchor) {
    if (!anchor) return null

    const preferredTarget = resolveOwnerScrollTarget(anchor.owner)
    const pdfSession = unref(session) ?? null

    if (isPdfAnchor(anchor) && restorePdfBackedScrollAnchor(anchor, preferredTarget.container, preferredTarget.selector, pdfSession, { zoomMode: zoomMode.value })) {
      return preferredTarget.owner
    }

    const preferredAnchor = preferredTarget.owner === anchor.owner
      ? anchor
      : { ...anchor, owner: preferredTarget.owner, offsetRatio: 0 }
    const restoredOwner = restoreScrollAnchor(preferredAnchor, preferredTarget.container, preferredTarget.selector)
      ? preferredTarget.owner
      : null

    if (restoredOwner) {
      return restoredOwner
    }

    const fallbackOwner = anchor.owner === PDF_SCROLL_OWNER.TRANSLATED
      ? PDF_SCROLL_OWNER.ORIGINAL
      : PDF_SCROLL_OWNER.TRANSLATED
    const fallbackTarget = resolveOwnerScrollTarget(fallbackOwner)
    const fallbackAnchor = fallbackTarget.owner === anchor.owner
      ? anchor
      : { ...anchor, owner: fallbackTarget.owner, offsetRatio: 0 }

    const fallbackRestored = restoreScrollAnchor(fallbackAnchor, fallbackTarget.container, fallbackTarget.selector)
    if (fallbackRestored) {
      return fallbackTarget.owner
    }
    return null
  }

  function restoreControlledTransitionAnchors({ originalAnchor, translatedAnchor }) {
    const restoredOriginalOwner = restoreOwnedScrollAnchor(originalAnchor)

    if (translatedAnchor) {
      const translatedTarget = resolveLayoutTransitionTarget(PDF_SCROLL_OWNER.TRANSLATED)
      restoreScrollAnchor(translatedAnchor, translatedTarget.container, translatedTarget.selector)
    }

    return restoredOriginalOwner
  }

  function normalizeFitPagePdfAnchor(anchor) {
    if (!anchor) return anchor

    if (isPdfAnchor(anchor)) {
      const viewport = unref(session)?.getPageViewport?.(anchor.pageNumber)
      const topPdfPoint = viewport?.convertToPdfPoint?.(0, 0) || null
      const topPdfY = Number(topPdfPoint?.[1])

      const normalizedAnchor = Number.isFinite(topPdfY)
        ? { ...anchor, pdfPoint: { ...anchor.pdfPoint, y: topPdfY }, offsetRatio: 0 }
        : { ...anchor, offsetRatio: 0 }
      return normalizedAnchor
    }

    return { ...anchor, offsetRatio: 0 }
  }

  function normalizeFitPageDomRootAnchor(anchor) {
    if (!anchor?.pageNumber) return anchor

    return {
      owner: anchor.owner,
      pageNumber: anchor.pageNumber,
      offsetRatio: 0
    }
  }

  return {
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
    deriveOriginalAnchorFromTranslated,
    resolveTranslatedZoomAnchor,
    normalizeFitPagePdfAnchor,
    normalizeFitPageDomRootAnchor
  }
}
