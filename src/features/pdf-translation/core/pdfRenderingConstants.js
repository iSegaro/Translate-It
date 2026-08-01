export const PDF_PAGE_BACKGROUND = '#fff'

// Production OCR render scale.
export const PDF_REGION_OCR_RENDER_SCALE = 1.25

// Per-page raster allocation budget.
// Applies to all zoom modes including uncapped Fit Width.

/** Maximum backing pixels per rendered page (width × height). */
export const PDF_MAX_PAGE_RASTER_PIXELS = 12_000_000

/** Maximum backing canvas axis dimension in pixels. */
export const PDF_MAX_CANVAS_DIMENSION = 4_096

/** Maximum estimated RGBA bytes per rendered page. */
export const PDF_MAX_PAGE_RASTER_BYTES = 48_000_000

/** Minimum raster output scale before a page is considered unrenderable. */
export const PDF_MIN_RASTER_OUTPUT_SCALE = 0.25
