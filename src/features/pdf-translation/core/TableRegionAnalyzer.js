/**
 * TableRegionAnalyzer — diagnostic-only table metadata enrichment.
 *
 * Phase L5e: Adds colSpan candidate detection for regions classified as 'table'.
 * ColSpan candidates are detected by checking if cell width crosses column
 * boundaries and neighbor cells are missing. This is diagnostic-only — no
 * rendering, translation, or adapter changes.
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
  const cellsByPosition = new Map()

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

        const cellKey = `${row.index}:${bestColumn.index}`
        cellsByPosition.set(cellKey, { rowIndex: row.index, columnIndex: bestColumn.index })

        const cellId = `${region.id}-r${row.index}-c${bestColumn.index}-i${itemIndex}`

        cells.push(Object.freeze({
          cellId,
          rowIndex: row.index,
          columnIndex: bestColumn.index,
          text: item.text,
          boundingBox: Object.freeze(bb),
          sourceLineIndex: lineIndex,
          sourceItemIndex: itemIndex,
          spanCandidate,
          colSpanCandidate: false,
          estimatedColSpan: 1
        }))
      }
    }
  }

  const enrichedCells = cells.map((cell) => {
    if (!cell.spanCandidate) {
      return cell
    }

    const matchedColumn = columns[cell.columnIndex]
    if (!matchedColumn) return cell

    const cellRight = cell.boundingBox.x + cell.boundingBox.width
    let estimatedColSpan = 1

    for (let i = cell.columnIndex + 1; i < columns.length; i++) {
      const nextColumn = columns[i]
      if (cellRight > nextColumn.x) {
        estimatedColSpan++
      } else {
        break
      }
    }

    if (estimatedColSpan <= 1) return cell

    let hasMissingNeighbor = false
    for (let i = cell.columnIndex + 1; i < cell.columnIndex + estimatedColSpan; i++) {
      const neighborKey = `${cell.rowIndex}:${i}`
      if (!cellsByPosition.has(neighborKey)) {
        hasMissingNeighbor = true
        break
      }
    }

    if (!hasMissingNeighbor) return cell

    return Object.freeze({
      ...cell,
      colSpanCandidate: true,
      estimatedColSpan
    })
  })

  return Object.freeze(enrichedCells)
}

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function buildCanonicalGrid(cells, rowCount, columnCount) {
  if (!cells.length || rowCount < 2 || columnCount < 2) {
    return Object.freeze({ rows: Object.freeze([]), columns: Object.freeze([]) })
  }

  const cellsByColumn = new Map()
  for (const cell of cells) {
    const colIdx = cell.columnIndex
    if (!cellsByColumn.has(colIdx)) {
      cellsByColumn.set(colIdx, [])
    }
    cellsByColumn.get(colIdx).push(cell)
  }

  const gridColumns = []
  for (const [colIdx, colCells] of cellsByColumn) {
    const xValues = colCells.map((c) => c.boundingBox.x)
    const widthValues = colCells.map((c) => c.boundingBox.width)
    gridColumns.push(Object.freeze({
      columnIndex: colIdx,
      x: Math.round(median(xValues) * 100) / 100,
      width: Math.round(median(widthValues) * 100) / 100
    }))
  }
  gridColumns.sort((a, b) => a.columnIndex - b.columnIndex)

  const cellsByRow = new Map()
  for (const cell of cells) {
    const rowIdx = cell.rowIndex
    if (!cellsByRow.has(rowIdx)) {
      cellsByRow.set(rowIdx, [])
    }
    cellsByRow.get(rowIdx).push(cell)
  }

  const gridRows = []
  for (let r = 0; r < rowCount; r++) {
    const rowCells = cellsByRow.get(r)
    if (!rowCells) {
      gridRows.push(Object.freeze([]))
      continue
    }
    const sorted = [...rowCells].sort((a, b) => a.columnIndex - b.columnIndex)
    const frozenCells = sorted.map((c) => Object.freeze({
      cellId: c.cellId,
      rowIndex: c.rowIndex,
      columnIndex: c.columnIndex
    }))
    gridRows.push(Object.freeze(frozenCells))
  }

  return Object.freeze({
    rows: Object.freeze(gridRows),
    columns: Object.freeze(gridColumns)
  })
}

function buildTableMetadata(region, lines) {
  const columns = detectTableColumns(region, lines)
  const rows = detectTableRows(region, lines)
  const cells = detectTableCells(region, lines, columns, rows)

  const hasSpanCandidates = cells.some((cell) => cell.colSpanCandidate === true)
  const grid = buildCanonicalGrid(cells, rows.length, columns.length)

  return Object.freeze({
    columnCount: columns.length,
    rowCount: rows.length,
    hasMergedCells: false,
    hasSpanCandidates,
    hasMultiLevelHeaders: false,
    columns,
    rows,
    cells,
    grid
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

/**
 * Enrich block line items with table metadata from page layout regions.
 *
 * This bridges the gap between diagnostic table metadata (in pageLayout.regions)
 * and translation adapter input (block line items). Items that match a table cell
 * by source line index and item position get cellId, rowIndex, columnIndex,
 * colSpanCandidate, and estimatedColSpan attached.
 *
 * Returns new blocks — does not mutate input blocks.
 *
 * @param {Object[]} blocks — logical blocks from PdfLogicalBlockBuilder
 * @param {Object} pageLayout — PageLayoutModel with table metadata
 * @returns {Object[]} new blocks with enriched line items
 */
export function enrichBlocksWithTableMetadata(blocks = [], pageLayout = null) {
  if (!pageLayout || !pageLayout.regions) return blocks

  const tableCellsBySourceKey = new Map()
  for (const region of pageLayout.regions) {
    const table = region.metadata?.table
    if (!table || !table.cells) continue

    for (const cell of table.cells) {
      const key = `${cell.sourceLineIndex}:${cell.sourceItemIndex}`
      tableCellsBySourceKey.set(key, cell)
    }
  }

  if (tableCellsBySourceKey.size === 0) return blocks

  const pageLines = pageLayout.lines || []
  const pageIndexByGeometry = new Map()
  for (let i = 0; i < pageLines.length; i++) {
    const pl = pageLines[i]
    if (!pl.boundingBox) continue
    const bb = pl.boundingBox
    const geomKey = `${pl.text}|${Math.round(bb.x * 100)}|${Math.round(bb.y * 100)}|${Math.round(bb.width * 100)}|${Math.round(bb.height * 100)}`
    if (!pageIndexByGeometry.has(geomKey)) {
      pageIndexByGeometry.set(geomKey, i)
    }
  }

  return blocks.map((block) => {
    if (!block.lines || !block.lines.length) return block

    let changed = false
    const enrichedLines = block.lines.map((line) => {
      if (!line.items || !line.items.length) return line

      const bb = line.boundingBox
      const geomKey = bb
        ? `${line.text}|${Math.round(bb.x * 100)}|${Math.round(bb.y * 100)}|${Math.round(bb.width * 100)}|${Math.round(bb.height * 100)}`
        : null
      const resolvedSourceLineIndex = geomKey ? pageIndexByGeometry.get(geomKey) : undefined

      if (resolvedSourceLineIndex == null) return line

      let itemsChanged = false
      const enrichedItems = line.items.map((item, itemIndex) => {
        const key = `${resolvedSourceLineIndex}:${itemIndex}`
        const cellMeta = tableCellsBySourceKey.get(key)

        if (!cellMeta) return item
        if (item.cellId === cellMeta.cellId) return item

        itemsChanged = true
        return {
          ...item,
          cellId: cellMeta.cellId,
          rowIndex: cellMeta.rowIndex,
          columnIndex: cellMeta.columnIndex,
          colSpanCandidate: cellMeta.colSpanCandidate,
          estimatedColSpan: cellMeta.estimatedColSpan
        }
      })

      if (!itemsChanged) return line
      changed = true
      return { ...line, items: enrichedItems }
    })

    if (!changed) return block
    return { ...block, lines: enrichedLines }
  })
}
