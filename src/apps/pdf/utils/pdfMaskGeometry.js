/**
 * Resolves cell overlay geometry from canonical structured cell metadata,
 * mask overrides, or source item geometry.
 *
 * @param {Object} options
 * @param {Object} options.item - source item geometry (relative to block)
 * @param {Object} options.blockBbox - block bounding box
 * @param {Object|null} [options.structuredCell] - canonical structured cell metadata
 * @param {Object|null} options.mask - cell mask from maskMap
 * @returns {{ x, y, width, height, padding }}
 */
export function resolveCellOverlayGeometry({ item, blockBbox, structuredCell = null, mask = null }) {
  if (structuredCell?.boundingBox) {
    const structuredBox = structuredCell.boundingBox
    return {
      x: structuredBox.x - blockBbox.x,
      y: structuredBox.y - blockBbox.y,
      width: structuredBox.width,
      height: structuredBox.height,
      padding: null
    }
  }

  if (!mask || mask.type !== 'cell') {
    return {
      x: item.x - blockBbox.x,
      y: item.y - blockBbox.y,
      width: item.width,
      height: item.height,
      padding: null
    }
  }

  const maskBbox = mask.boundingBox

  return {
    x: maskBbox.x - blockBbox.x,
    y: maskBbox.y - blockBbox.y,
    width: maskBbox.width,
    height: maskBbox.height,
    padding: mask.padding || null
  }
}
