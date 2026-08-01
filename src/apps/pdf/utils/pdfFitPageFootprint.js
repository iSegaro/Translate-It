import {
  PDF_PANE_EDGE_SAFETY_CLEARANCE,
  PDF_PAGE_INLINE_CHROME,
  PDF_VIEWER_PADDING_TOP,
  PDF_VIEWER_PADDING_BOTTOM,
  PDF_PAGE_PADDING_TOP,
  PDF_PAGE_PADDING_BOTTOM,
  PDF_PAGE_LABEL_HEIGHT,
  PDF_PAGE_LABEL_MARGIN_BOTTOM
} from '../constants/pdfLayoutConstants.js'

function toFiniteDimension(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
}

function getStructuralPageChromeHeight() {
  return PDF_PAGE_PADDING_TOP + PDF_PAGE_PADDING_BOTTOM + PDF_PAGE_LABEL_HEIGHT + PDF_PAGE_LABEL_MARGIN_BOTTOM
}

function getViewerVerticalChromeHeight() {
  return PDF_VIEWER_PADDING_TOP + PDF_VIEWER_PADDING_BOTTOM
}

function resolvePdfCanvasSlot(layout = {}) {
  const width = toFiniteDimension(layout.width)
  const height = toFiniteDimension(layout.height)
  const horizontalFootprintInset = PDF_PANE_EDGE_SAFETY_CLEARANCE + PDF_PAGE_INLINE_CHROME
  const availableCanvasWidth = Math.max(320, width - horizontalFootprintInset * 2)
  const availableCanvasHeight = Math.max(
    0,
    height - getViewerVerticalChromeHeight() - getStructuralPageChromeHeight()
  )

  return {
    width,
    height,
    availableCanvasWidth,
    availableCanvasHeight,
    structuralPageChromeHeight: getStructuralPageChromeHeight(),
    viewerChromeHeight: getViewerVerticalChromeHeight()
  }
}

export {
  getStructuralPageChromeHeight,
  getViewerVerticalChromeHeight,
  resolvePdfCanvasSlot
}
