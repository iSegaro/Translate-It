import {
  PDF_PAGE_MARGIN,
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

function getPageChromeHeight() {
  return PDF_PAGE_PADDING_TOP + PDF_PAGE_PADDING_BOTTOM + PDF_PAGE_LABEL_HEIGHT + PDF_PAGE_LABEL_MARGIN_BOTTOM
}

function getViewerVerticalChromeHeight() {
  return PDF_VIEWER_PADDING_TOP + PDF_VIEWER_PADDING_BOTTOM
}

function resolvePdfCanvasSlot(layout = {}) {
  const width = toFiniteDimension(layout.width)
  const height = toFiniteDimension(layout.height)
  const availableCanvasWidth = Math.max(320, width - PDF_PAGE_MARGIN * 2)
  const availableCanvasHeight = Math.max(
    0,
    height - getViewerVerticalChromeHeight() - getPageChromeHeight()
  )

  return {
    width,
    height,
    availableCanvasWidth,
    availableCanvasHeight,
    pageChromeHeight: getPageChromeHeight(),
    viewerChromeHeight: getViewerVerticalChromeHeight()
  }
}

export {
  getPageChromeHeight,
  getViewerVerticalChromeHeight,
  resolvePdfCanvasSlot
}
