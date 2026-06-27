/**
 * Resolves cell overlay geometry from either mask or source item.
 *
 * @param {Object} options
 * @param {Object} options.item - source item geometry (relative to block)
 * @param {Object} options.blockBbox - block bounding box
 * @param {Object|null} options.mask - cell mask from maskMap
 * @returns {{ x, y, width, height, padding }}
 */
export function resolveCellOverlayGeometry({ item, blockBbox, mask }) {
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
