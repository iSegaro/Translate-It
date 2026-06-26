/**
 * PageLayoutModel — canonical page structure for the PDF translation pipeline.
 *
 * This is a read-only data model that captures the spatial layout of a PDF page.
 * It wraps existing lines and blocks, adding a `regions` array for spatial grouping
 * and a `readingOrder` for deterministic element traversal.
 *
 * Phase L5a: Diagnostic-only table metadata enrichment. Table regions receive
 * minimal table metadata structure. No consumer uses table metadata for
 * building, rendering, or translation yet.
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
 * @property {LayoutRegion[]} regions — spatial groupings from vertical-gap clustering
 * @property {string[]} readingOrder — ordered identifiers for deterministic traversal.
 *   Phase L0 representation: contains block IDs sorted by page, readingOrderIndex,
 *   and columnIndex. Future phases may evolve this into ordering of generic layout
 *   objects (regions, blocks, or mixed). Consumers should treat this as an
 *   implementation detail and avoid assuming it will always represent only blocks.
 * @property {PageLayoutMetadata} metadata — read-only statistics derived from lines, blocks, and regions
 */

/**
 * @typedef {Object} PageLayoutMetadata
 * @property {number} lineCount — total text lines on the page
 * @property {number} blockCount — total logical blocks on the page
 * @property {number} regionCount — total layout regions detected
 * @property {boolean} hasStructuredBlocks — true if any block has roleMetadata.isStructured === true
 * @property {number} structuredBlockCount — number of blocks with roleMetadata.isStructured === true
 */

/**
 * @typedef {Object} LayoutRegion
 * @property {string} id — deterministic, e.g. 'p1-r0'
 * @property {string} type — 'paragraph' | 'heading' | 'list' | 'table' | 'unknown'
 * @property {BoundingBox} boundingBox — union of member line bounding boxes
 * @property {string[]} childRegionIds — empty in Phase L5a
 * @property {string[]} blockIds — block IDs whose center falls within this region
 * @property {Object} metadata — lineCount, fontSize, gapThreshold + classification signals + table metadata
 */

import { detectLayoutRegions } from './LayoutRegionDetector.js'
import { classifyLayoutRegions } from './LayoutRegionClassifier.js'
import { analyzeTableRegions } from './TableRegionAnalyzer.js'

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

function buildMetadata(lines, blocks, regions) {
  let structuredBlockCount = 0
  for (const block of blocks) {
    if (block.roleMetadata?.isStructured === true) {
      structuredBlockCount++
    }
  }

  return Object.freeze({
    lineCount: lines.length,
    blockCount: blocks.length,
    regionCount: regions.length,
    hasStructuredBlocks: structuredBlockCount > 0,
    structuredBlockCount
  })
}

/**
 * Build a PageLayoutModel from existing lines and blocks.
 *
 * Populates regions via conservative vertical-gap grouping (Phase L2),
 * classifies them via block-role heuristics (Phase L3), and enriches
 * table regions with minimal table metadata (Phase L5a).
 * Does NOT modify block building, rendering, or translation behavior.
 *
 * @param {Object} options
 * @param {number} options.pageNumber
 * @param {Object} options.pageSize — { width, height }
 * @param {Object[]} options.lines — text lines from buildPdfTextLinesFromItems
 * @param {Object[]} options.blocks — logical blocks from PdfLogicalBlockBuilder
 * @param {Object[]} [options.regions] — pre-detected regions (avoids duplicate detection)
 * @returns {PageLayoutModel}
 */
export function buildPageLayoutModel({ pageNumber = 0, pageSize = null, lines = [], blocks = [], regions = null }) {
  const normalizedPageSize = pageSize
    ? {
      width: Number(pageSize.width) || 0,
      height: Number(pageSize.height) || 0
    }
    : null

  const readingOrder = buildReadingOrder(blocks)
  const frozenLines = Object.freeze([...lines])
  const frozenBlocks = Object.freeze([...blocks])
  const detectedRegions = regions || detectLayoutRegions(frozenLines, pageNumber, frozenBlocks)
  const classifiedRegions = classifyLayoutRegions(detectedRegions, frozenLines, frozenBlocks)
  const enrichedRegions = analyzeTableRegions(classifiedRegions)
  const metadata = buildMetadata(frozenLines, frozenBlocks, enrichedRegions)

  return Object.freeze({
    pageNumber,
    pageSize: normalizedPageSize,
    lines: frozenLines,
    blocks: frozenBlocks,
    regions: enrichedRegions,
    readingOrder: Object.freeze(readingOrder),
    metadata
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
    Array.isArray(value.readingOrder) &&
    value.metadata != null &&
    typeof value.metadata.lineCount === 'number' &&
    typeof value.metadata.blockCount === 'number' &&
    typeof value.metadata.regionCount === 'number' &&
    typeof value.metadata.hasStructuredBlocks === 'boolean' &&
    typeof value.metadata.structuredBlockCount === 'number'
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
