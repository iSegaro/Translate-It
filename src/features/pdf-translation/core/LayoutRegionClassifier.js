/**
 * LayoutRegionClassifier — diagnostic-only region type classification.
 *
 * Phase L3: Classifies regions produced by LayoutRegionDetector using
 * conservative heuristics based on block roles and line-level signals.
 * Classification is metadata-only — no consumer changes behavior yet.
 *
 * Strategy:
 * 1. Structured/table blocks → table
 * 2. Dominant block role heading → heading
 * 3. Dominant block role list-item → list
 * 4. Line-level fallbacks (font ratio, markers, item gaps)
 * 5. Default → paragraph
 * 6. Ambiguous → unknown
 */

const REGION_TYPE_PARAGRAPH = 'paragraph'
const REGION_TYPE_HEADING = 'heading'
const REGION_TYPE_LIST = 'list'
const REGION_TYPE_TABLE = 'table'
const REGION_TYPE_UNKNOWN = 'unknown'

const HEADING_FONT_RATIO_THRESHOLD = 1.25

const LIST_MARKER_PATTERN = /^(?:[•‣◦·*-]|[a-zA-Z][.)])\s+\S/
const NUMERIC_MARKER_PATTERN = /^\(?(\d+(?:\.\d+)*)[.)]?\s/
const LIST_MARKER_MAJORITY_THRESHOLD = 0.5

const TABLE_ITEM_GAP_MULTIPLIER = 1.5
const TABLE_MIN_ITEMS = 2

const KPI_FONT_RATIO_THRESHOLD = 1.5
const KPI_SHORT_LINE_THRESHOLD = 20
const KPI_MIN_LINES = 2

function getMedianFontSize(lines) {
  const sizes = lines
    .map((line) => line.fontSize || line.roleMetadata?.fontSize || 0)
    .filter((s) => s > 0)
  if (!sizes.length) return 12

  const sorted = [...sizes].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function isListItemText(text) {
  return LIST_MARKER_PATTERN.test(text) || NUMERIC_MARKER_PATTERN.test(text)
}

function isTableLikeLine(line) {
  if (!line.items || line.items.length < TABLE_MIN_ITEMS) return false

  const gaps = [...line.items]
    .sort((a, b) => a.x - b.x || a.index - b.index)
    .map((item, index, items) => {
      if (index === items.length - 1) return 0
      const next = items[index + 1]
      return next.x - item.right
    })

  const widestGap = Math.max(...gaps, 0)
  const fontSize = line.fontSize || 12
  return widestGap >= fontSize * TABLE_ITEM_GAP_MULTIPLIER
}

function computeBlockRoleStats(region, blocks) {
  const regionBlockIds = new Set(region.blockIds)
  const regionBlocks = blocks.filter((block) => regionBlockIds.has(block.id))

  if (!regionBlocks.length) {
    return {
      dominantRole: null,
      dominantRoleRatio: 0,
      hasStructuredBlocks: false,
      blockCount: 0,
      roleCounts: new Map()
    }
  }

  const roleCounts = new Map()
  let hasStructuredBlocks = false

  for (const block of regionBlocks) {
    const role = block.role || 'paragraph'
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1)
    if (block.roleMetadata?.isStructured === true) {
      hasStructuredBlocks = true
    }
  }

  let dominantRole = null
  let dominantCount = 0
  for (const [role, count] of roleCounts) {
    if (count > dominantCount) {
      dominantRole = role
      dominantCount = count
    }
  }

  return {
    dominantRole,
    dominantRoleRatio: dominantCount / regionBlocks.length,
    hasStructuredBlocks,
    blockCount: regionBlocks.length,
    roleCounts
  }
}

function computeLineSignals(region, lines, pageMedianFontSize) {
  const regionLines = lines.filter((line) => {
    const bb = line.boundingBox
    const rbb = region.boundingBox
    return (
      bb.x >= rbb.x &&
      bb.x <= rbb.x + rbb.width &&
      bb.y >= rbb.y &&
      bb.y <= rbb.y + rbb.height
    )
  })

  if (!regionLines.length) {
    return {
      lineCount: 0,
      averageFontSize: 0,
      fontRatioVsPageMedian: 1,
      rtlRatio: 0,
      listMarkerRatio: 0,
      tableLikeLineRatio: 0,
      shortLineRatio: 0,
      totalItemCount: 0
    }
  }

  const fontSizes = regionLines.map((l) => l.fontSize || 12)
  const averageFontSize = fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length
  const fontRatioVsPageMedian = pageMedianFontSize > 0 ? averageFontSize / pageMedianFontSize : 1

  const rtlCount = regionLines.filter((l) => l.direction === 'rtl').length
  const rtlRatio = rtlCount / regionLines.length

  const listMarkerCount = regionLines.filter((l) => isListItemText(l.text)).length
  const listMarkerRatio = listMarkerCount / regionLines.length

  const tableLikeCount = regionLines.filter(isTableLikeLine).length
  const tableLikeLineRatio = tableLikeCount / regionLines.length

  const shortLineCount = regionLines.filter((l) => l.text.length <= KPI_SHORT_LINE_THRESHOLD).length
  const shortLineRatio = shortLineCount / regionLines.length

  const totalItemCount = regionLines.reduce((sum, l) => sum + (l.items?.length || 0), 0)

  return {
    lineCount: regionLines.length,
    averageFontSize,
    fontRatioVsPageMedian,
    rtlRatio,
    listMarkerRatio,
    tableLikeLineRatio,
    shortLineRatio,
    totalItemCount
  }
}

function classifyByBlockRoles(blockStats) {
  if (blockStats.hasStructuredBlocks) {
    return REGION_TYPE_TABLE
  }

  if (blockStats.dominantRole === 'heading' && blockStats.dominantRoleRatio >= 0.5) {
    return REGION_TYPE_HEADING
  }

  if (blockStats.dominantRole === 'list-item' && blockStats.dominantRoleRatio >= 0.5) {
    return REGION_TYPE_LIST
  }

  if (
    blockStats.dominantRole === 'table-cell' ||
    blockStats.dominantRole === 'table-region'
  ) {
    return REGION_TYPE_TABLE
  }

  return null
}

function classifyByLineFallbacks(lineSignals) {
  if (
    lineSignals.lineCount <= 3 &&
    lineSignals.fontRatioVsPageMedian >= HEADING_FONT_RATIO_THRESHOLD &&
    lineSignals.shortLineRatio >= 0.5
  ) {
    return REGION_TYPE_HEADING
  }

  if (lineSignals.listMarkerRatio >= LIST_MARKER_MAJORITY_THRESHOLD) {
    return REGION_TYPE_LIST
  }

  if (lineSignals.tableLikeLineRatio >= 0.5 && lineSignals.totalItemCount >= 4) {
    return REGION_TYPE_TABLE
  }

  return null
}

function hasConflictingSignals(lineSignals, blockStats) {
  const signals = []

  if (lineSignals.fontRatioVsPageMedian >= HEADING_FONT_RATIO_THRESHOLD && lineSignals.shortLineRatio >= 0.5) {
    signals.push('heading')
  }
  if (lineSignals.listMarkerRatio >= LIST_MARKER_MAJORITY_THRESHOLD) {
    signals.push('list')
  }
  if (lineSignals.tableLikeLineRatio >= 0.5) {
    signals.push('table')
  }
  if (blockStats.dominantRole === 'heading') {
    signals.push('heading')
  }
  if (blockStats.dominantRole === 'list-item') {
    signals.push('list')
  }
  if (blockStats.hasStructuredBlocks || blockStats.dominantRole === 'table-cell' || blockStats.dominantRole === 'table-region') {
    signals.push('table')
  }

  const unique = [...new Set(signals)]
  return unique.length > 1
}

function detectPossibleKpiSignal(lineSignals, blockStats) {
  if (blockStats.blockCount >= 1 && blockStats.dominantRoleRatio < 1) return false

  const hasLargeFont = lineSignals.fontRatioVsPageMedian >= KPI_FONT_RATIO_THRESHOLD
  const hasShortLines = lineSignals.shortLineRatio >= 0.5
  const hasFewLines = lineSignals.lineCount <= KPI_MIN_LINES && lineSignals.lineCount >= 1

  return hasLargeFont && hasShortLines && hasFewLines
}

function buildClassificationMetadata(blockStats, lineSignals, possibleKpiSignal) {
  return {
    dominantBlockRole: blockStats.dominantRole,
    dominantBlockRoleRatio: blockStats.dominantRoleRatio,
    hasStructuredBlocks: blockStats.hasStructuredBlocks,
    averageFontSize: lineSignals.averageFontSize,
    fontRatioVsPageMedian: lineSignals.fontRatioVsPageMedian,
    detectedLineCount: lineSignals.lineCount,
    blockCount: blockStats.blockCount,
    rtlRatio: lineSignals.rtlRatio,
    tableSignal: lineSignals.tableLikeLineRatio,
    listSignal: lineSignals.listMarkerRatio,
    possibleKpiSignal
  }
}

/**
 * Classify layout regions using block roles and line-level heuristics.
 *
 * Returns a new frozen array of regions with `type` set.
 * Does NOT mutate input regions.
 *
 * @param {Object[]} regions — regions from detectLayoutRegions
 * @param {Object[]} lines — text lines from the page
 * @param {Object[]} blocks — logical blocks from the page
 * @returns {Object[]} frozen array of classified regions
 */
export function classifyLayoutRegions(regions = [], lines = [], blocks = []) {
  if (!regions.length) return Object.freeze([])

  const pageMedianFontSize = getMedianFontSize(lines)

  const classifiedRegions = regions.map((region) => {
    const blockStats = computeBlockRoleStats(region, blocks)
    const lineSignals = computeLineSignals(region, lines, pageMedianFontSize)
    const possibleKpiSignal = detectPossibleKpiSignal(lineSignals, blockStats)

    const isEmpty = lineSignals.lineCount === 0 && blockStats.blockCount === 0
    const conflicting = hasConflictingSignals(lineSignals, blockStats)

    let type = null

    if (!isEmpty && !conflicting) {
      type = classifyByBlockRoles(blockStats)
      if (!type) {
        type = classifyByLineFallbacks(lineSignals)
      }
    }

    if (!type) {
      type = isEmpty || conflicting
        ? REGION_TYPE_UNKNOWN
        : REGION_TYPE_PARAGRAPH
    }

    const classificationMetadata = buildClassificationMetadata(blockStats, lineSignals, possibleKpiSignal)

    return Object.freeze({
      ...region,
      type,
      boundingBox: region.boundingBox,
      childRegionIds: Object.freeze([...region.childRegionIds]),
      blockIds: Object.freeze([...region.blockIds]),
      metadata: Object.freeze({
        ...region.metadata,
        ...classificationMetadata
      })
    })
  })

  return Object.freeze(classifiedRegions)
}

export {
  REGION_TYPE_PARAGRAPH,
  REGION_TYPE_HEADING,
  REGION_TYPE_LIST,
  REGION_TYPE_TABLE,
  REGION_TYPE_UNKNOWN
}
