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

function isNearlyMatchingRect(rect, targetRect, tolerance = 2) {
  if (!rect || !targetRect) return false

  return Math.abs(rect.left - targetRect.left) <= tolerance &&
    Math.abs(rect.top - targetRect.top) <= tolerance &&
    Math.abs(getRectRight(rect) - getRectRight(targetRect)) <= tolerance &&
    Math.abs(getRectBottom(rect) - getRectBottom(targetRect)) <= tolerance
}

function getRectRight(rect) {
  return typeof rect?.right === 'number' ? rect.right : rect.left + rect.width
}

function getRectBottom(rect) {
  return typeof rect?.bottom === 'number' ? rect.bottom : rect.top + rect.height
}

function getRangeTextLayer(range) {
  return getElementFromNode(range?.commonAncestorContainer)?.closest?.(PDF_TEXT_LAYER_SELECTOR)
    || getElementFromNode(range?.startContainer)?.closest?.(PDF_TEXT_LAYER_SELECTOR)
    || getElementFromNode(range?.endContainer)?.closest?.(PDF_TEXT_LAYER_SELECTOR)
    || null
}

function isUsableSelectionAnchorRect(rect, textLayerRect) {
  if (!rect || rect.width === 0 || rect.height === 0) return false
  if (!textLayerRect) return true
  if (isNearlyMatchingRect(rect, textLayerRect)) return false

  const textLayerArea = textLayerRect.width * textLayerRect.height
  if (textLayerArea <= 0) return true

  const rectArea = rect.width * rect.height
  const isFullLayerSized = rectArea >= textLayerArea * 0.9 &&
    rect.width >= textLayerRect.width * 0.9 &&
    rect.height >= textLayerRect.height * 0.9

  return !isFullLayerSized
}

function resolveSelectionAnchorRect(range, fallbackRect) {
  const textLayerRect = getRangeTextLayer(range)?.getBoundingClientRect?.() || null
  const validRects = Array.from(range.getClientRects?.() || [])
    .filter((rect) => isUsableSelectionAnchorRect(rect, textLayerRect))

  return validRects.length > 0
    ? validRects[validRects.length - 1]
    : fallbackRect
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
  const boundingRect = range.getBoundingClientRect?.()

  if (!boundingRect || (boundingRect.width === 0 && boundingRect.height === 0)) {
    return null
  }

  const rect = resolveSelectionAnchorRect(range, boundingRect)
  const bottom = getRectBottom(rect)
  const viewport = getViewportSize()
  const iconSize = WindowsConfig.POSITIONING.ICON_SIZE
  const offset = WindowsConfig.POSITIONING.SELECTION_OFFSET
  const margin = WindowsConfig.POSITIONING.VIEWPORT_MARGIN
  const rectLeft = rect.left
  const rectRight = getRectRight(rect)
  const preferredX = rect.left + rect.width / 2 - iconSize / 2
  const preferredY = bottom + offset

  let finalX = preferredX
  let finalY = preferredY

  if (preferredX + iconSize > viewport.width - margin) {
    finalX = rectRight - iconSize
  } else if (preferredX < margin) {
    finalX = rectLeft
  }

  finalX = clamp(finalX, margin, Math.max(margin, viewport.width - iconSize - margin))

  if (preferredY + iconSize > viewport.height - margin) {
    finalY = rect.top - iconSize - offset
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
