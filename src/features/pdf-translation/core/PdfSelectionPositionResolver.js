import { WindowsConfig } from '@/features/windows/managers/core/WindowsConfig.js'
import { POINTER_SELECTION_GAP } from './PdfSelectionPositionConstants.js'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getViewportSize() {
  return {
    width: document.documentElement?.clientWidth || window.innerWidth || 0,
    height: window.innerHeight || 0
  }
}

export function resolveSelectionIconPosition(selectionGeometry, interactionAnchor) {
  if (!selectionGeometry) return null

  if (!interactionAnchor) {
    return {
      x: selectionGeometry.x,
      y: selectionGeometry.y,
      width: selectionGeometry.width,
      height: selectionGeometry.height
    }
  }

  const viewport = getViewportSize()
  const iconSize = WindowsConfig.POSITIONING.ICON_SIZE
  const margin = WindowsConfig.POSITIONING.VIEWPORT_MARGIN
  const rectWidth = selectionGeometry.width
  const rectHeight = selectionGeometry.height
  const anchorX = interactionAnchor.x
  const anchorY = interactionAnchor.y
  const preferredX = anchorX
  const preferredY = anchorY + POINTER_SELECTION_GAP

  let finalX = preferredX
  let finalY = preferredY

  if (preferredX + iconSize > viewport.width - margin) {
    finalX = viewport.width - iconSize - margin
  } else if (preferredX < margin) {
    finalX = margin
  }

  finalX = clamp(finalX, margin, Math.max(margin, viewport.width - iconSize - margin))

  if (preferredY + iconSize > viewport.height - margin) {
    finalY = anchorY - iconSize - POINTER_SELECTION_GAP
  }

  return {
    x: finalX,
    y: finalY,
    width: rectWidth,
    height: rectHeight
  }

}
