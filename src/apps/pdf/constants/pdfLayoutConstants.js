/**
 * PDF Viewer layout contract constants.
 *
 * These define the expected DOM footprint of rendered PDF pages within
 * the scroll viewer. Fit Page canvas-slot calculations depend on these
 * values to derive available canvas height.
 *
 * Any corresponding visual spacing changes in PdfViewer.scss,
 * PdfPageView.scss, or PdfViewerLayout.scss should be kept in sync.
 */

export const PDF_PAGE_MARGIN = 24
export const PDF_VIEWER_PADDING_TOP = 16
export const PDF_VIEWER_PADDING_BOTTOM = 24
export const PDF_PAGE_PADDING_TOP = 16
export const PDF_PAGE_PADDING_BOTTOM = 16
export const PDF_PAGE_LABEL_HEIGHT = 16
export const PDF_PAGE_LABEL_MARGIN_BOTTOM = 12
