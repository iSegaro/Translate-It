/**
 * LayoutRegionDetector — conservative spatial grouping of text lines into regions.
 *
 * Phase L4a: Added `assignRegionIdsToLines()` for region-aware block building.
 * Lines are assigned to regions based on bounding box containment.
 * Used by `buildPdfLogicalBlocksFromLines()` to prevent cross-region merges.
 *
 * Strategy: group consecutive vertically-close lines into regions. A large
 * vertical gap (> medianFontSize × 3) between two lines breaks the region.
 * Region bounding boxes are unions of member line bounding boxes.
 */

const REGION_GAP_MULTIPLIER = 3
const REGION_TYPE_UNKNOWN = 'unknown'

function getMedianFontSize(lines) {
  const sizes = lines
    .map((line) => line.fontSize || line.roleMetadata?.fontSize || 0)
    .filter((s) => s > 0)
  if (!sizes.length) return 12

  const sorted = [...sizes].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function mergeBoundingBoxes(boxes) {
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))

  return {
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
    width: Math.round(Math.max(0, right - x) * 10000) / 10000,
    height: Math.round(Math.max(0, bottom - y) * 10000) / 10000
  }
}

function createRegionId(pageNumber, regionIndex) {
  return `p${pageNumber}-r${regionIndex}`
}

/**
 * Build layout regions from lines using conservative vertical-gap grouping.
 *
 * Lines must be pre-sorted by Y position (as produced by buildPdfTextLinesFromItems).
 * A new region starts when the vertical gap between consecutive lines exceeds
 * `medianFontSize × REGION_GAP_MULTIPLIER`.
 *
 * @param {Object[]} lines — sorted text lines
 * @param {number} pageNumber
 * @param {Object[]} blocks — logical blocks (for blockIds assignment)
 * @returns {Object[]} frozen array of LayoutRegion objects
 */
export function detectLayoutRegions(lines = [], pageNumber = 0, blocks = []) {
  if (!lines.length) return Object.freeze([])

  const medianFontSize = getMedianFontSize(lines)
  const gapThreshold = medianFontSize * REGION_GAP_MULTIPLIER

  const groups = []
  let currentGroup = [lines[0]]

  for (let i = 1; i < lines.length; i++) {
    const prevLine = currentGroup[currentGroup.length - 1]
    const currentLine = lines[i]

    const prevBottom = prevLine.boundingBox.y + prevLine.boundingBox.height
    const currentTop = currentLine.boundingBox.y
    const gap = currentTop - prevBottom

    if (gap > gapThreshold) {
      groups.push(currentGroup)
      currentGroup = [currentLine]
    } else {
      currentGroup.push(currentLine)
    }
  }
  groups.push(currentGroup)

  const regions = groups.map((group, regionIndex) => {
    const boundingBox = mergeBoundingBoxes(group.map((line) => line.boundingBox))

    const blockIds = []
    for (const block of blocks) {
      const bb = block.boundingBox
      if (!bb) continue

      const centerX = bb.x + bb.width / 2
      const centerY = bb.y + bb.height / 2

      if (
        centerX >= boundingBox.x &&
        centerX <= boundingBox.x + boundingBox.width &&
        centerY >= boundingBox.y &&
        centerY <= boundingBox.y + boundingBox.height
      ) {
        blockIds.push(block.id)
      }
    }

    return Object.freeze({
      id: createRegionId(pageNumber, regionIndex),
      type: REGION_TYPE_UNKNOWN,
      boundingBox,
      childRegionIds: Object.freeze([]),
      blockIds: Object.freeze(blockIds),
      metadata: Object.freeze({
        lineCount: group.length,
        fontSize: medianFontSize,
        gapThreshold
      })
    })
  })

  return Object.freeze(regions)
}

/**
 * Assign region IDs to lines based on bounding box containment.
 *
 * A line is assigned to a region if its center point falls within the region's
 * bounding box. Lines that don't match any region get `regionId: null`.
 *
 * @param {Object[]} lines — text lines with boundingBox
 * @param {Object[]} regions — layout regions from detectLayoutRegions
 * @returns {Object[]} new array of lines with `regionId` property added
 */
export function assignRegionIdsToLines(lines = [], regions = []) {
  if (!lines.length || !regions.length) {
    return lines.map((line) => ({ ...line, regionId: null }))
  }

  return lines.map((line) => {
    const bb = line.boundingBox
    if (!bb) return { ...line, regionId: null }

    const centerX = bb.x + bb.width / 2
    const centerY = bb.y + bb.height / 2

    for (const region of regions) {
      const rbb = region.boundingBox
      if (
        centerX >= rbb.x &&
        centerX <= rbb.x + rbb.width &&
        centerY >= rbb.y &&
        centerY <= rbb.y + rbb.height
      ) {
        return { ...line, regionId: region.id }
      }
    }

    return { ...line, regionId: null }
  })
}
