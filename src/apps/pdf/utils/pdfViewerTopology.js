import { CONTENT_VIEW, LAYOUT_MODE } from '../constants/pdfViewerConstants.js'

export function resolveEffectivePaneTopology({
  contentView,
  selectedLayoutMode
} = {}) {
  const effectiveLayout = contentView === CONTENT_VIEW.ORIGINAL
    ? LAYOUT_MODE.SINGLE
    : selectedLayoutMode === LAYOUT_MODE.SIDE_BY_SIDE
      ? LAYOUT_MODE.SIDE_BY_SIDE
      : LAYOUT_MODE.SINGLE

  const showOriginalPane = contentView !== CONTENT_VIEW.TRANSLATION || effectiveLayout === LAYOUT_MODE.SIDE_BY_SIDE
  const showTranslatedTextPane = contentView === CONTENT_VIEW.TRANSLATION
  const showTranslatedPdfPane = contentView === CONTENT_VIEW.TRANSLATED_PDF && effectiveLayout === LAYOUT_MODE.SIDE_BY_SIDE
  const paneRoles = []

  if (showOriginalPane) paneRoles.push('original')
  if (showTranslatedTextPane) paneRoles.push('translated-text')
  if (showTranslatedPdfPane) paneRoles.push('translated-pdf')

  return {
    contentView,
    effectiveLayout,
    showOriginalPane,
    showTranslatedTextPane,
    showTranslatedPdfPane,
    paneCount: paneRoles.length,
    paneRoles
  }
}

export function doesTopologyChange(previousTopology, nextTopology) {
  return previousTopology.effectiveLayout !== nextTopology.effectiveLayout ||
    previousTopology.paneCount !== nextTopology.paneCount ||
    previousTopology.showOriginalPane !== nextTopology.showOriginalPane ||
    previousTopology.showTranslatedTextPane !== nextTopology.showTranslatedTextPane ||
    previousTopology.showTranslatedPdfPane !== nextTopology.showTranslatedPdfPane
}

export function doesOriginalPaneLayoutChange(previousTopology, nextTopology) {
  if (!nextTopology.showOriginalPane) return false
  if (!previousTopology.showOriginalPane && nextTopology.showOriginalPane) return true
  return previousTopology.effectiveLayout !== nextTopology.effectiveLayout
}
