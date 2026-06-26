/**
 * TableRegionAnalyzer — diagnostic-only table metadata enrichment.
 *
 * Phase L5d: Adds cell-to-grid mapping for regions classified as 'table'.
 * Cells are mapped by item-to-column proximity using x-position.
 * This is diagnostic-only — no rendering, translation, or adapter changes.
 *
 * Pipeline position: after classifyLayoutRegions, before buildMetadata.
 */

const REGION_TYPE_TABLE = 'table'
const MIN_TABLE_LINES = 2
const MIN_COLUMN_CLUSTERS = 2
const MIN_ITEMS_FOR_DETECTION = 2

function getMedianFontSize(lines) {
  const sizes = lines
    .map((line) => line.fontSize || line.roleMetadata?.fontSize || 0)
    .filter((s) => s > 0)
  if (!sizes.length) return 12

  const sorted = [...sizes].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function isNumericText(text) {
  const trimmed = text.trim()
  if (!trimmed) return false
  return /^[\d.,\s+\-–—%$€£¥₹]+$/.test(trimmed)
}

function clusterXPositions(positions, tolerance) {
  if (!positions.length) return []

  const sorted = [...positions].sort((a, b) => a - b)
  const clusters = []
  let currentCluster = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - currentCluster[currentCluster.length - 1] <= tolerance) {
      currentCluster.push(sorted[i])
    } else {
      clusters.push(currentCluster)
      currentCluster = [sorted[i]]
    }
  }
  clusters.push(currentCluster)

  return clusters
}

function detectTableColumns(region, lines) {
  const regionLineEntries = getRegionLines(region, lines)

  if (regionLineEntries.length < MIN_TABLE_LINES) {
    return Object.freeze([])
  }

  const allItems = []
  for (const entry of regionLineEntries) {
    if (!entry.line.items || !entry.line.items.length) continue
    for (const item of entry.line.items) {
      if (item.text && item.text.trim().length > 0) {
        allItems.push(item)
      }
    }
  }

  if (allItems.length < MIN_ITEMS_FOR_DETECTION) {
    return Object.freeze([])
  }

  const regionLines = regionLineEntries.map((e) => e.line)
  const medianFontSize = getMedianFontSize(regionLines)
  const tolerance = Math.max(medianFontSize * 0.75, 6)

  const xPositions = allItems.map((item) => item.x)
  const clusters = clusterXPositions(xPositions, tolerance)

  if (clusters.length < MIN_COLUMN_CLUSTERS) {
    return Object.freeze([])
  }

  const xSpread = Math.max(...xPositions) - Math.min(...xPositions)
  if (xSpread < tolerance * 2) {
    return Object.freeze([])
  }

  const columns = clusters.map((cluster) => {
    const avgX = cluster.reduce((sum, x) => sum + x, 0) / cluster.length

    const clusterItems = allItems.filter((item) => {
      const dist = Math.abs(item.x - avgX)
      return dist <= tolerance
    })

    const maxWidth = Math.max(...clusterItems.map((item) => item.right - item.x))
    const avgWidth = clusterItems.reduce((sum, item) => sum + (item.right - item.x), 0) / clusterItems.length

    const numericCount = clusterItems.filter((item) => isNumericText(item.text)).length
    const align = numericCount > clusterItems.length / 2 ? 'right' : 'left'

    return {
      x: Math.round(avgX * 100) / 100,
      width: Math.round(maxWidth * 100) / 100,
      align,
      itemCount: clusterItems.length,
      averageWidth: Math.round(avgWidth * 100) / 100
    }
  })

  const sortedColumns = columns
    .sort((a, b) => a.x - b.x)
    .map((column, index) => Object.freeze({
      ...column,
      index
    }))

  return Object.freeze(sortedColumns)
}

function getRegionLines(region, lines) {
  const regionLines = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.boundingBox) continue

    if (line.regionId === region.id) {
      regionLines.push({ line, originalIndex: i })
      continue
    }

    const bb = line.boundingBox
    const rbb = region.boundingBox
    const centerX = bb.x + bb.width / 2
    const centerY = bb.y + bb.height / 2

    if (
      centerX >= rbb.x &&
      centerX <= rbb.x + rbb.width &&
      centerY >= rbb.y &&
      centerY <= rbb.y + rbb.height
    ) {
      regionLines.push({ line, originalIndex: i })
    }
  }
  return regionLines
}

function detectTableRows(region, lines) {
  const regionLineEntries = getRegionLines(region, lines)

  if (regionLineEntries.length < MIN_TABLE_LINES) {
    return Object.freeze([])
  }

  const sortedEntries = [...regionLineEntries].sort(
    (a, b) => a.line.boundingBox.y - b.line.boundingBox.y
  )

  const allSameY = sortedEntries.every((entry) => {
    const firstY = sortedEntries[0].line.boundingBox.y
    return Math.abs(entry.line.boundingBox.y - firstY) < 1
  })

  if (allSameY) {
    return Object.freeze([])
  }

  const rows = sortedEntries.map((entry, rowIndex) => {
    const bb = entry.line.boundingBox
    return {
      index: rowIndex,
      y: Math.round(bb.y * 100) / 100,
      height: Math.round(bb.height * 100) / 100,
      lineIndices: Object.freeze([entry.originalIndex]),
      lineCount: 1
    }
  })

  const frozenRows = rows.map((row) => Object.freeze({
    ...row,
    lineIndices: row.lineIndices
  }))

  return Object.freeze(frozenRows)
}

function detectTableCells(region, lines, columns, rows) {
  if (columns.length < 2 || rows.length < 2) {
    return Object.freeze([])
  }

  const regionLineEntries = getRegionLines(region, lines)
  const linesByOriginalIndex = new Map()
  for (const entry of regionLineEntries) {
    linesByOriginalIndex.set(entry.originalIndex, entry.line)
  }

  const regionLines = regionLineEntries.map((e) => e.line)
  const medianFontSize = getMedianFontSize(regionLines)
  const tolerance = Math.max(medianFontSize * 0.75, 6)

  const cells = []

  for (const row of rows) {
    for (const lineIndex of row.lineIndices) {
      const line = linesByOriginalIndex.get(lineIndex)
      if (!line || !line.items) continue

      for (let itemIndex = 0; itemIndex < line.items.length; itemIndex++) {
        const item = line.items[itemIndex]
        if (!item.text || !item.text.trim()) continue

        let bestColumn = null
        let bestDistance = Infinity

        for (const column of columns) {
          const dist = Math.abs(item.x - column.x)
          if (dist < bestDistance) {
            bestDistance = dist
            bestColumn = column
          }
        }

        if (!bestColumn || bestDistance > tolerance) continue

        const itemWidth = item.right - item.x
        const spanCandidate = itemWidth > bestColumn.averageWidth * 1.5

        const bb = {
          x: Math.round(item.x * 100) / 100,
          y: Math.round(item.y * 100) / 100,
          width: Math.round(itemWidth * 100) / 100,
          height: Math.round(item.height * 100) / 100
        }

        cells.push(Object.freeze({
          rowIndex: row.index,
          columnIndex: bestColumn.index,
          text: item.text,
          boundingBox: Object.freeze(bb),
          sourceLineIndex: lineIndex,
          sourceItemIndex: itemIndex,
          spanCandidate
        }))
      }
    }
  }

  return Object.freeze(cells)
}

function buildTableMetadata(region, lines) {
  const columns = detectTableColumns(region, lines)
  const rows = detectTableRows(region, lines)
  const cells = detectTableCells(region, lines, columns, rows)

  return Object.freeze({
    columnCount: columns.length,
    rowCount: rows.length,
    hasMergedCells: false,
    hasMultiLevelHeaders: false,
    columns,
    rows,
    cells
  })
}

/**
 * Enrich table regions with table metadata including column detection.
 *
 * Returns a new frozen array of regions. For regions with type === 'table',
 * adds a `table` field to metadata with detected columns. Non-table regions
 * are unchanged. Does NOT mutate input regions.
 *
 * @param {Object[]} regions — classified regions from classifyLayoutRegions
 * @param {Object[]} lines — text lines from the page
 * @param {Object[]} blocks — logical blocks from the page (reserved for L5c+)
 * @returns {Object[]} frozen array of regions with table metadata
 */
export function analyzeTableRegions(regions = [], lines = [], blocks = []) { // eslint-disable-line no-unused-vars
  if (!regions.length) return Object.freeze([])

  const enrichedRegions = regions.map((region) => {
    if (region.type !== REGION_TYPE_TABLE) {
      return Object.freeze({
        ...region,
        childRegionIds: Object.freeze([...region.childRegionIds]),
        blockIds: Object.freeze([...region.blockIds]),
        metadata: Object.freeze({ ...region.metadata })
      })
    }

    return Object.freeze({
      ...region,
      childRegionIds: Object.freeze([...region.childRegionIds]),
      blockIds: Object.freeze([...region.blockIds]),
      metadata: Object.freeze({
        ...region.metadata,
        table: buildTableMetadata(region, lines)
      })
    })
  })

  return Object.freeze(enrichedRegions)
}
