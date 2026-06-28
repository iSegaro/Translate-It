import { WindowsConfig } from '@/features/windows/managers/core/WindowsConfig.js'

const PDF_TEXT_LAYER_SELECTOR = '.textLayer'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getViewportSize() {
  return {
    width: document.documentElement?.clientWidth || window.innerWidth || 0,
    height: window.innerHeight || 0
  }
}

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

  const bottom = typeof rect.bottom === 'number' ? rect.bottom : rect.top + rect.height
  const viewport = getViewportSize()
  const scrollX = window.scrollX || 0
  const scrollY = window.scrollY || 0
  const iconSize = WindowsConfig.POSITIONING.ICON_SIZE
  const offset = WindowsConfig.POSITIONING.SELECTION_OFFSET
  const margin = WindowsConfig.POSITIONING.VIEWPORT_MARGIN
  const rectLeft = rect.left + scrollX
  const rectRight = (typeof rect.right === 'number' ? rect.right : rect.left + rect.width) + scrollX
  const preferredX = scrollX + rect.left + rect.width / 2 - iconSize / 2
  const preferredY = scrollY + bottom + offset

  let finalX = preferredX
  let finalY = preferredY

  if (preferredX + iconSize > scrollX + viewport.width - margin) {
    finalX = rectRight - iconSize
  } else if (preferredX < scrollX + margin) {
    finalX = rectLeft
  }

  finalX = clamp(finalX, scrollX + margin, Math.max(scrollX + margin, scrollX + viewport.width - iconSize - margin))

  if (preferredY + iconSize > scrollY + viewport.height - margin) {
    finalY = scrollY + rect.top - iconSize - offset
  }

  return {
    x: finalX,
    y: finalY,
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
