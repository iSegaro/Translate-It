/**
 * PdfCellSpanLayout — pure helper for span-aware cell overlay width calculation.
 *
 * Phase L5h: Uses optional translatedCells span metadata to widen cell overlays
 * for detected column-span candidates. Falls back to existing width logic when
 * metadata is unavailable or unsafe.
 */

/**
 * Resolve cell overlay width with span awareness.
 *
 * When span metadata indicates a column-span candidate with estimatedColSpan > 1,
 * widens the cell width to cover multiple columns. Otherwise returns fallback width.
 *
 * @param {Object} options
 * @param {Object} options.item — source text item with x, width, right
 * @param {Object} options.line — line with boundingBox
 * @param {Object|null} options.translatedCellMetadata — metadata arrays from translatedCells
 * @param {number} options.cellIndex — index of cell in line
 * @param {number} options.fallbackWidth — pre-computed fallback width
 * @returns {number} resolved cell width
 */
export function resolvePdfCellOverlayWidth({
  item,
  line,
  translatedCellMetadata,
  cellIndex,
  fallbackWidth
}) {
  if (!item || !Number.isFinite(fallbackWidth) || fallbackWidth <= 0) {
    return fallbackWidth || 0
  }

  const colSpanCandidates = translatedCellMetadata?.colSpanCandidates
  const estimatedColSpans = translatedCellMetadata?.estimatedColSpans

  if (!Array.isArray(colSpanCandidates) || !Array.isArray(estimatedColSpans)) {
    return fallbackWidth
  }

  const isSpanCandidate = colSpanCandidates[cellIndex] === true
  const estimatedColSpan = estimatedColSpans[cellIndex]

  if (!isSpanCandidate || !Number.isFinite(estimatedColSpan) || estimatedColSpan <= 1) {
    return fallbackWidth
  }

  const lineRight = (line?.boundingBox?.x || 0) + (line?.boundingBox?.width || 0)
  if (!Number.isFinite(lineRight) || lineRight <= 0) {
    return fallbackWidth
  }

  const spanWidth = Math.min(fallbackWidth * estimatedColSpan, lineRight - item.x)

  if (!Number.isFinite(spanWidth) || spanWidth <= 0) {
    return fallbackWidth
  }

  return Math.max(fallbackWidth, spanWidth)
}
