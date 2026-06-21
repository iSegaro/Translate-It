const PDF_TEXT_LAYER_SELECTOR = '.textLayer'

function getElementFromNode(node) {
  if (!node) return null
  if (node.nodeType === Node.ELEMENT_NODE) return node
  return node.parentElement || null
}

export function isSelectionInsidePdfTextLayer(selection, viewerRoot) {
  if (!selection || !viewerRoot || selection.isCollapsed || selection.rangeCount === 0) {
    return false
  }

  const range = selection.getRangeAt(0)
  const startElement = getElementFromNode(range.startContainer)
  const endElement = getElementFromNode(range.endContainer)

  if (!startElement || !endElement) return false
  if (!viewerRoot.contains(startElement) || !viewerRoot.contains(endElement)) return false

  return !!(startElement.closest(PDF_TEXT_LAYER_SELECTOR) || endElement.closest(PDF_TEXT_LAYER_SELECTOR))
}

export function buildPdfSelectionPosition(selection) {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect?.()

  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return null
  }

  const iconSize = 32
  const offset = 10
  const bottom = typeof rect.bottom === 'number' ? rect.bottom : rect.top + rect.height
  return {
    x: rect.left + rect.width / 2 - iconSize / 2 + window.scrollX,
    y: bottom + offset + window.scrollY,
    width: rect.width,
    height: rect.height
  }
}

export function buildPdfSelectionText(selection) {
  if (!selection) return ''

  return selection
    .toString()
    .replace(/\u00A0/g, ' ')
    .trim()
}

export function buildPdfSelectionPayload(selection, viewerRoot) {
  if (!isSelectionInsidePdfTextLayer(selection, viewerRoot)) {
    return null
  }

  const text = buildPdfSelectionText(selection)
  const position = buildPdfSelectionPosition(selection)

  if (!text || !position) {
    return null
  }

  return { text, position }
}
