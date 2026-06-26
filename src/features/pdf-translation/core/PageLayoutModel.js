/**
 * PageLayoutModel — canonical page structure for the PDF translation pipeline.
 *
 * This is a read-only data model that captures the spatial layout of a PDF page.
 * It wraps existing lines and blocks, adding a `regions` array for future
 * spatial grouping and a `readingOrder` for deterministic element traversal.
 *
 * Phase L0: Infrastructure only. `regions` is always empty. No new analysis.
 * Future phases will populate regions and use them for block building, rendering,
 * masking, and export.
 */

/**
 * @typedef {Object} BoundingBox
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} PageLayoutModel
 * @property {number} pageNumber
 * @property {BoundingBox} pageSize
 * @property {Object[]} lines — text lines from the page (built by PdfLayoutAnalyzer)
 * @property {Object[]} blocks — logical blocks for translation (built by PdfLogicalBlockBuilder)
 * @property {LayoutRegion[]} regions — spatial groupings (empty in Phase L0)
 * @property {string[]} readingOrder — ordered identifiers for deterministic traversal.
 *   Phase L0 representation: contains block IDs sorted by page, readingOrderIndex,
 *   and columnIndex. Future phases may evolve this into ordering of generic layout
 *   objects (regions, blocks, or mixed). Consumers should treat this as an
 *   implementation detail and avoid assuming it will always represent only blocks.
 */

/**
 * @typedef {Object} LayoutRegion
 * @property {string} id
 * @property {string} type — 'unknown' in Phase L0
 * @property {BoundingBox} boundingBox
 * @property {string[]} childRegionIds
 * @property {string[]} blockIds
 * @property {Object} metadata
 */

const REGION_TYPE_UNKNOWN = 'unknown'

function buildReadingOrder(blocks) {
  return blocks
    .slice()
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber
      if (a.readingOrderIndex !== b.readingOrderIndex) return a.readingOrderIndex - b.readingOrderIndex
      if (a.columnIndex !== b.columnIndex) return a.columnIndex - b.columnIndex
      return 0
    })
    .map((block) => block.id)
}

/**
 * Build a PageLayoutModel from existing lines and blocks.
 *
 * This function does NOT perform any new analysis. It wraps existing data
 * into the canonical model structure. All fields are populated from inputs.
 *
 * @param {Object} options
 * @param {number} options.pageNumber
 * @param {Object} options.pageSize — { width, height }
 * @param {Object[]} options.lines — text lines from buildPdfTextLinesFromItems
 * @param {Object[]} options.blocks — logical blocks from PdfLogicalBlockBuilder
 * @returns {PageLayoutModel}
 */
export function buildPageLayoutModel({ pageNumber = 0, pageSize = null, lines = [], blocks = [] }) {
  const normalizedPageSize = pageSize
    ? {
      width: Number(pageSize.width) || 0,
      height: Number(pageSize.height) || 0
    }
    : null

  const readingOrder = buildReadingOrder(blocks)

  return Object.freeze({
    pageNumber,
    pageSize: normalizedPageSize,
    lines: Object.freeze([...lines]),
    blocks: Object.freeze([...blocks]),
    regions: Object.freeze([]),
    readingOrder: Object.freeze(readingOrder)
  })
}

/**
 * Check if a value is a valid PageLayoutModel.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isPageLayoutModel(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.pageNumber === 'number' &&
    Array.isArray(value.lines) &&
    Array.isArray(value.blocks) &&
    Array.isArray(value.regions) &&
    Array.isArray(value.readingOrder)
  )
}

/**
 * Create an empty PageLayoutModel for a page with no content.
 *
 * @param {number} pageNumber
 * @param {Object|null} pageSize
 * @returns {PageLayoutModel}
 */
export function createEmptyPageLayoutModel(pageNumber = 0, pageSize = null) {
  return buildPageLayoutModel({ pageNumber, pageSize, lines: [], blocks: [] })
}

export { REGION_TYPE_UNKNOWN }
