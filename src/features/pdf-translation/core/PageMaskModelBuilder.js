/**
 * PageMaskModelBuilder — diagnostic-only mask generation for PDF pages.
 *
 * Phase 3a: Generates mask metadata from an existing pageLayout.
 * Masks describe which areas of the page should be covered during
 * overlay rendering or export. This phase is diagnostic-only — no
 * consumer reads masks yet.
 *
 * Pipeline position: after PageLayoutModel.build(), before any consumer.
 */

const CELL_PADDING = Object.freeze({ top: 1, right: 2, bottom: 1, left: 2 })
const BLOCK_PADDING = Object.freeze({ top: 1, right: 1, bottom: 1, left: 1 })
const ROW_PADDING = Object.freeze({ top: 1, right: 2, bottom: 1, left: 2 })
const NUMERIC_PATTERN = /^[\d.,\s+\-–—$€£¥₹BMKbmk%()]+$/
const ROW_MIN_OCCUPIED_CELLS = 3

function clampBBox(bbox, pageSize) {
  if (!pageSize) return bbox

  const x = Math.max(0, bbox.x)
  const y = Math.max(0, bbox.y)
  const maxX = Math.min(x + bbox.width, pageSize.width)
  const maxY = Math.min(y + bbox.height, pageSize.height)
  const width = maxX - x
  const height = maxY - y

  if (width <= 0 || height <= 0) return null

  return Object.freeze({
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100
  })
}

function capPadding(padding, width, height) {
  return Object.freeze({
    top: Math.min(padding.top, height * 0.5),
    right: Math.min(padding.right, width * 0.5),
    bottom: Math.min(padding.bottom, height * 0.5),
    left: Math.min(padding.left, width * 0.5)
  })
}

function resolveContentHint(text, block, region) {
  if (block?.role === 'heading') return 'heading'

  if (region?.metadata?.semantic?.financialStatement) return 'financial'

  if (text && NUMERIC_PATTERN.test(text.trim())) return 'numeric'

  return 'text'
}

function buildCellMasks(pageLayout) {
  const masks = []

  for (const region of pageLayout.regions) {
    const table = region.metadata?.table
    if (!table?.grid?.occupancy) continue

    for (const row of table.grid.occupancy) {
      for (const cell of row) {
        if (cell.state !== 'occupied') continue

        const bbox = clampBBox(cell.boundingBox, pageLayout.pageSize)
        if (!bbox) continue

        masks.push(Object.freeze({
          id: `mask-${pageLayout.pageNumber}-${region.id}-r${cell.rowIndex}-c${cell.columnIndex}`,
          type: 'cell',
          source: 'table-occupancy',
          boundingBox: bbox,
          padding: capPadding(CELL_PADDING, bbox.width, bbox.height),
          backgroundStrategy: 'sample',
          priority: 90,
          contentHint: 'text',
          ownerId: cell.cellId
        }))
      }
    }
  }

  return masks
}

function isRowComplex(row) {
  let occupiedCount = 0
  let hasColSpan = false
  let hasNonOccupied = false

  for (const cell of row) {
    if (cell.state === 'occupied') {
      occupiedCount++
      if (cell.colSpan > 1) hasColSpan = true
    } else {
      hasNonOccupied = true
    }
  }

  return hasColSpan || occupiedCount >= ROW_MIN_OCCUPIED_CELLS || hasNonOccupied
}

function buildRowMasks(pageLayout) {
  const masks = []

  for (const region of pageLayout.regions) {
    const table = region.metadata?.table
    if (!table?.grid?.occupancy) continue

    for (const row of table.grid.occupancy) {
      if (!isRowComplex(row)) continue

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      for (const cell of row) {
        const bb = cell.boundingBox
        if (!bb) continue
        minX = Math.min(minX, bb.x)
        minY = Math.min(minY, bb.y)
        maxX = Math.max(maxX, bb.x + bb.width)
        maxY = Math.max(maxY, bb.y + bb.height)
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY)) continue

      const rowIndex = row[0]?.rowIndex ?? 0
      const bbox = clampBBox({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      }, pageLayout.pageSize)
      if (!bbox) continue

      masks.push(Object.freeze({
        id: `mask-${pageLayout.pageNumber}-${region.id}-row${rowIndex}`,
        type: 'row',
        source: 'table-row',
        boundingBox: bbox,
        padding: capPadding(ROW_PADDING, bbox.width, bbox.height),
        backgroundStrategy: 'sample',
        priority: 80,
        contentHint: 'text',
        ownerId: `table-row:${region.id}:${rowIndex}`
      }))
    }
  }

  return masks
}

function buildBlockMasks(pageLayout, tableRegionIds) {
  const masks = []

  for (const block of (pageLayout.blocks || [])) {
    if (block.roleMetadata?.isStructured === true) continue
    if (tableRegionIds.has(block.regionId)) continue

    const bbox = clampBBox(block.boundingBox, pageLayout.pageSize)
    if (!bbox) continue

    const region = pageLayout.regions?.find((r) => r.id === block.regionId)

    masks.push(Object.freeze({
      id: `mask-${pageLayout.pageNumber}-block-${block.id}`,
      type: 'block',
      source: 'logical-block',
      boundingBox: bbox,
      padding: capPadding(BLOCK_PADDING, bbox.width, bbox.height),
      backgroundStrategy: 'sample',
      priority: 50,
      contentHint: resolveContentHint(block.text, block, region),
      ownerId: block.id
    }))
  }

  return masks
}

/**
 * Build a diagnostic page mask model from an existing pageLayout.
 *
 * Returns a frozen object with masks array and metadata counts.
 * Does NOT mutate pageLayout. Does NOT attach masks to pageLayout.
 *
 * @param {Object} pageLayout — PageLayoutModel from PageLayoutModel.build()
 * @returns {Object} frozen mask model
 */
export function buildPageMaskModel(pageLayout) {
  if (!pageLayout || !pageLayout.regions) {
    return Object.freeze({
      masks: Object.freeze([]),
      metadata: Object.freeze({ totalMasks: 0, cellMasks: 0, blockMasks: 0, regionMasks: 0, rowMasks: 0 })
    })
  }

  const tableRegionIds = new Set()
  for (const region of pageLayout.regions) {
    if (region.type === 'table') {
      tableRegionIds.add(region.id)
    }
  }

  const cellMasks = buildCellMasks(pageLayout)
  const blockMasks = buildBlockMasks(pageLayout, tableRegionIds)
  const rowMasks = buildRowMasks(pageLayout)
  const regionMasks = []

  const masks = [...cellMasks, ...rowMasks, ...blockMasks, ...regionMasks]

  return Object.freeze({
    masks: Object.freeze(masks),
    metadata: Object.freeze({
      totalMasks: masks.length,
      cellMasks: cellMasks.length,
      blockMasks: blockMasks.length,
      regionMasks: regionMasks.length,
      rowMasks: rowMasks.length
    })
  })
}
