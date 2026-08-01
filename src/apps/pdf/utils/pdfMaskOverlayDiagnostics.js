/**
 * pdfMaskOverlayDiagnostics — development-only validation harness
 * for comparing source item geometry vs mask-aware cell overlay geometry.
 *
 * Pure utility: no side effects, no mutations, no rendering impact.
 * Used for dev testing before enabling PDF_OVERLAY_USE_CELL_MASKS.
 */

function r4(n) {
  return Math.round(n * 10000) / 10000
}

function buildCellDiagnostics({ block, translatedCells, maskMap }) {
  if (!block || !translatedCells || !maskMap) return []

  const blockBbox = block.boundingBox
  if (!blockBbox) return []

  const diagnostics = []

  for (const lc of translatedCells) {
    const line = block.lines?.[lc.lineIndex]
    if (!line) continue

    const lineItems = line.items || []
    const cellIds = lc.cellIds || []

    for (let cellIdx = 0; cellIdx < (lc.cells?.length || 0); cellIdx++) {
      const item = lineItems[cellIdx]
      if (!item) continue

      const cellId = cellIds[cellIdx] || null
      const mask = cellId ? maskMap.get(cellId) || null : null
      const hasMask = mask !== null && mask.type === 'cell'

      const sourceX = r4(item.x - blockBbox.x)
      const sourceY = r4(item.y - blockBbox.y)
      const sourceWidth = r4(item.width)
      const sourceHeight = r4(item.height)

      let maskX = sourceX
      let maskY = sourceY
      let maskWidth = sourceWidth
      let maskHeight = sourceHeight

      if (hasMask) {
        const maskBbox = mask.boundingBox
        maskX = r4(maskBbox.x - blockBbox.x)
        maskY = r4(maskBbox.y - blockBbox.y)
        maskWidth = r4(maskBbox.width)
        maskHeight = r4(maskBbox.height)
      }

      diagnostics.push(Object.freeze({
        cellId,
        lineIndex: lc.lineIndex,
        cellIndex: cellIdx,
        hasMask,
        source: Object.freeze({ x: sourceX, y: sourceY, width: sourceWidth, height: sourceHeight }),
        mask: Object.freeze({ x: maskX, y: maskY, width: maskWidth, height: maskHeight }),
        deltaX: r4(maskX - sourceX),
        deltaY: r4(maskY - sourceY),
        deltaWidth: r4(maskWidth - sourceWidth),
        deltaHeight: r4(maskHeight - sourceHeight)
      }))
    }
  }

  return diagnostics
}

/**
 * Build diagnostic comparison between source item geometry and mask geometry
 * for all cells in a block's translatedCells.
 *
 * @param {Object} options
 * @param {Object} options.block - logical block with lines and boundingBox
 * @param {Array} options.translatedCells - from translationState.translatedCells
 * @param {Map|null} options.maskMap - Map<ownerId, mask> from PdfOverlayLayer
 * @returns {Array} frozen diagnostic entries
 */
export function buildCellMaskOverlayDiagnostics({ block, translatedCells, maskMap }) {
  return buildCellDiagnostics({ block, translatedCells, maskMap })
}
