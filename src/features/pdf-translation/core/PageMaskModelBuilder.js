/**
 * PageMaskModelBuilder — diagnostic-only mask generation for PDF pages.
 *
 * Phase 3a/3b: Generates mask metadata from an existing pageLayout.
 * Masks describe which areas of the page should be covered during
 * overlay rendering or export. This phase is diagnostic-only — no
 * consumer reads masks yet.
 *
 * Pipeline position: after PageLayoutModel.build(), before any consumer.
 */

import { isStructuredLayoutModel } from './StructuredLayoutModel.js'

const CELL_PADDING = Object.freeze({ top: 1, right: 2, bottom: 1, left: 2 })
const BLOCK_PADDING = Object.freeze({ top: 1, right: 1, bottom: 1, left: 1 })
const ROW_PADDING = Object.freeze({ top: 1, right: 2, bottom: 1, left: 2 })
const NUMERIC_PATTERN = /^[\d.,\s+\-–—$€£¥₹BMKbmk%()]+$/
const ROW_MIN_OCCUPIED_CELLS = 3
const STRUCTURED_REGION_MIN_CONFIDENCE = 0.7
const STRUCTURED_REGION_MAX_AREA_RATIO = 0.35
const STRUCTURED_REGION_MAX_CELL_COUNT = 8
const STRUCTURED_GROUP_MIN_CONFIDENCE = 0.7
const STRUCTURED_GROUP_MAX_AREA_RATIO = 0.45
const STRUCTURED_GROUP_MAX_MEMBER_COUNT = 6
const STRUCTURED_REGION_KINDS = new Set(['kpi', 'key-value'])

function clampBBox(bbox, pageSize) {
  if (!bbox) return null

  const x = Math.max(0, bbox.x)
  const y = Math.max(0, bbox.y)
  const maxX = Math.min(x + bbox.width, pageSize?.width ?? Infinity)
  const maxY = Math.min(y + bbox.height, pageSize?.height ?? Infinity)
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

function isValidBoundingBox(box) {
  return !!box &&
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
}

function unionBoundingBoxes(boxes = []) {
  const validBoxes = boxes.filter((box) => isValidBoundingBox(box))
  if (!validBoxes.length) return null

  const x = Math.min(...validBoxes.map((box) => box.x))
  const y = Math.min(...validBoxes.map((box) => box.y))
  const right = Math.max(...validBoxes.map((box) => box.x + box.width))
  const bottom = Math.max(...validBoxes.map((box) => box.y + box.height))

  return Object.freeze({
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round((right - x) * 100) / 100,
    height: Math.round((bottom - y) * 100) / 100
  })
}

function getPageArea(pageLayout = null) {
  const width = pageLayout?.pageSize?.width
  const height = pageLayout?.pageSize?.height
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return width * height
}

function getBoundingBoxArea(bbox = null) {
  if (!isValidBoundingBox(bbox)) return 0
  return bbox.width * bbox.height
}

function getCoverageRatio(bboxes = [], regionBBox = null) {
  if (!isValidBoundingBox(regionBBox)) return 0

  const union = unionBoundingBoxes(bboxes)
  if (!isValidBoundingBox(union)) return 0

  const regionArea = getBoundingBoxArea(regionBBox)
  if (!Number.isFinite(regionArea) || regionArea <= 0) return 0

  return getBoundingBoxArea(union) / regionArea
}

function isConservativeMaskBBoxSafe(bbox, pageLayout, maxAreaRatio) {
  if (!isValidBoundingBox(bbox)) return false

  const pageArea = getPageArea(pageLayout)
  if (!Number.isFinite(pageArea) || pageArea <= 0) return false

  const ratio = getBoundingBoxArea(bbox) / pageArea
  return Number.isFinite(ratio) && ratio > 0 && ratio <= maxAreaRatio
}

function resolveContentHint(text, block, region) {
  if (block?.role === 'heading') return 'heading'

  if (region?.metadata?.semantic?.financialStatement) return 'financial'

  if (text && NUMERIC_PATTERN.test(text.trim())) return 'numeric'

  return 'text'
}

function getStructuredRegions(pageLayout) {
  const structuredLayout = pageLayout?.metadata?.structured
  if (!isStructuredLayoutModel(structuredLayout)) {
    return []
  }

  return Array.isArray(structuredLayout.regions) ? structuredLayout.regions : []
}

function getStructuredGroups(pageLayout) {
  const structuredLayout = pageLayout?.metadata?.structured
  if (!isStructuredLayoutModel(structuredLayout)) {
    return []
  }

  return Array.isArray(structuredLayout.groups) ? structuredLayout.groups : []
}

function getStructuredRegionCellMap(region = null) {
  const cells = Array.isArray(region?.cells) ? region.cells : []
  const map = new Map()

  for (const cell of cells) {
    if (cell?.id) {
      map.set(cell.id, cell)
    }
    if (cell?.cellId && cell.cellId !== cell.id) {
      map.set(cell.cellId, cell)
    }
  }

  return map
}

function getStructuredRowCells(row = null, cellMap = null) {
  if (!row || !cellMap) return []

  const rowCellIds = Array.isArray(row.cellIds) ? row.cellIds : []
  const directCells = rowCellIds
    .map((cellId) => cellMap.get(cellId) || null)
    .filter(Boolean)

  if (directCells.length > 0) {
    return directCells
  }

  if (!Number.isInteger(row.rowIndex)) {
    return []
  }

  return [...cellMap.values()].filter((cell) => cell.rowIndex === row.rowIndex)
}

function isStructuredRowMaskCandidate(region, row, rowCells) {
  if (!row || !Array.isArray(rowCells) || rowCells.length === 0) {
    return false
  }

  const hasExplicitRowBox = isValidBoundingBox(row.boundingBox)
  const hasEnoughCells = rowCells.length >= 2
  if (!hasExplicitRowBox && !hasEnoughCells) {
    return false
  }

  if (region?.kind === 'table') {
    const hasSpanSignal = rowCells.some((cell) => (
      cell?.rowSpan > 1 ||
      cell?.colSpan > 1 ||
      cell?.spanType === 'candidate' ||
      cell?.spanType === 'merged' ||
      cell?.spanCandidate === true
    ))

    return rowCells.length >= 3 || hasSpanSignal
  }

  return hasEnoughCells
}

function getStructuredRegionCellCount(region = null) {
  return Array.isArray(region?.cells) ? region.cells.length : 0
}

function isStructuredRegionMaskCandidate(region, bbox, pageLayout) {
  if (!region || !STRUCTURED_REGION_KINDS.has(region.kind)) return false
  if (!Number.isFinite(region.confidence) || region.confidence < STRUCTURED_REGION_MIN_CONFIDENCE) return false
  if (!isConservativeMaskBBoxSafe(bbox, pageLayout, STRUCTURED_REGION_MAX_AREA_RATIO)) return false

  const cellCount = getStructuredRegionCellCount(region)
  if (cellCount <= 0 || cellCount > STRUCTURED_REGION_MAX_CELL_COUNT) return false

  const coverageRatio = getCoverageRatio(
    Array.isArray(region.cells) ? region.cells.map((cell) => cell?.boundingBox).filter(Boolean) : [],
    bbox
  )
  if (coverageRatio >= 0.8) return false

  return true
}

function buildStructuredRegionMasks(pageLayout) {
  const structuredRegions = getStructuredRegions(pageLayout)
  const masks = []

  for (const region of structuredRegions) {
    const regionId = region?.id || region?.regionId || null
    if (!regionId) continue
    if (!isStructuredRegionMaskCandidate(region, region.boundingBox, pageLayout)) continue

    const bbox = clampBBox(region.boundingBox, pageLayout.pageSize)
    if (!bbox) continue

    masks.push(Object.freeze({
      id: `mask-${pageLayout.pageNumber}-structured-region-${regionId}`,
      type: 'region',
      source: 'structured-region',
      boundingBox: bbox,
      padding: capPadding(CELL_PADDING, bbox.width, bbox.height),
      backgroundStrategy: 'sample',
      priority: 70,
      contentHint: 'text',
      ownerId: `structured-region:${regionId}`,
      regionKind: region.kind,
      subtype: region.subtype || null,
      confidence: region.confidence,
      sourceReferences: region.sourceReferences
    }))
  }

  return masks
}

function buildStructuredCellMasks(pageLayout) {
  const structuredRegions = getStructuredRegions(pageLayout)
  const masks = []
  const regionIdsWithStructuredMasks = new Set()

  for (const region of structuredRegions) {
    if (!region || region.kind === 'unknown') continue

    const regionId = region.id || region.regionId || null
    if (!regionId) continue

    let regionHasStructuredMasks = false
    for (const cell of (Array.isArray(region.cells) ? region.cells : [])) {
      const bbox = clampBBox(cell?.boundingBox, pageLayout.pageSize)
      const ownerId = cell?.id || cell?.cellId || null
      if (!bbox || !ownerId) continue

      regionHasStructuredMasks = true
      masks.push(Object.freeze({
        id: `mask-${pageLayout.pageNumber}-${regionId}-cell-${ownerId}`,
        type: 'cell',
        source: 'structured-cell',
        boundingBox: bbox,
        padding: capPadding(CELL_PADDING, bbox.width, bbox.height),
        backgroundStrategy: 'sample',
        priority: 90,
        contentHint: 'text',
        ownerId,
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
        spanType: cell.spanType,
        role: cell.role,
        confidence: cell.confidence,
        sourceReferences: cell.sourceReferences
      }))
    }

    if (regionHasStructuredMasks) {
      regionIdsWithStructuredMasks.add(regionId)
    }
  }

  return { masks, regionIdsWithStructuredMasks }
}

function buildLegacyCellMasks(pageLayout, skipRegionIds = new Set()) {
  const masks = []

  for (const region of pageLayout.regions) {
    if (skipRegionIds.has(region.id)) continue
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

function buildStructuredRowMasks(pageLayout) {
  const structuredRegions = getStructuredRegions(pageLayout)
  const masks = []
  const regionIdsWithStructuredMasks = new Set()

  for (const region of structuredRegions) {
    if (!region || region.kind === 'unknown') continue

    const regionId = region.id || region.regionId || null
    if (!regionId) continue

    const cellMap = getStructuredRegionCellMap(region)
    let regionHasStructuredMasks = false

    for (const row of (Array.isArray(region.rows) ? region.rows : [])) {
      const rowCells = getStructuredRowCells(row, cellMap)
      if (!isStructuredRowMaskCandidate(region, row, rowCells)) continue

      const rowBoundingBox = isValidBoundingBox(row.boundingBox)
        ? clampBBox(row.boundingBox, pageLayout.pageSize)
        : clampBBox(unionBoundingBoxes(rowCells.map((cell) => cell.boundingBox)), pageLayout.pageSize)

      if (!rowBoundingBox) continue

      regionHasStructuredMasks = true
      masks.push(Object.freeze({
        id: `mask-${pageLayout.pageNumber}-${regionId}-row-${row.id || row.rowId || row.rowIndex}`,
        type: 'row',
        source: 'structured-row',
        boundingBox: rowBoundingBox,
        padding: capPadding(ROW_PADDING, rowBoundingBox.width, rowBoundingBox.height),
        backgroundStrategy: 'sample',
        priority: 80,
        contentHint: 'text',
        ownerId: row.id || row.rowId || `row-${row.rowIndex}`,
        rowIndex: row.rowIndex,
        cellIds: row.cellIds,
        sourceReferences: row.sourceReferences
      }))
    }

    if (regionHasStructuredMasks) {
      regionIdsWithStructuredMasks.add(regionId)
    }
  }

  return { masks, regionIdsWithStructuredMasks }
}

function getStructuredGroupMemberRegions(group = null, regionMap = null) {
  if (!group || !regionMap) return []

  const memberRegionIds = Array.isArray(group.regionIds) ? group.regionIds : []
  return memberRegionIds
    .map((regionId) => regionMap.get(regionId) || null)
    .filter(Boolean)
}

function getStructuredGroupBoundingBox(group = null, memberRegions = [], pageLayout = null) {
  const explicitBoundingBox = clampBBox(group?.boundingBox || null, pageLayout?.pageSize)
  if (isConservativeMaskBBoxSafe(explicitBoundingBox, pageLayout, STRUCTURED_GROUP_MAX_AREA_RATIO)) {
    return explicitBoundingBox
  }

  const memberBoundingBoxes = memberRegions
    .map((region) => region?.boundingBox || null)
    .filter((box) => isValidBoundingBox(box))

  if (memberBoundingBoxes.length < 2) {
    return null
  }

  const unionBoundingBox = clampBBox(unionBoundingBoxes(memberBoundingBoxes), pageLayout?.pageSize)
  if (!isConservativeMaskBBoxSafe(unionBoundingBox, pageLayout, STRUCTURED_GROUP_MAX_AREA_RATIO)) {
    return null
  }

  return unionBoundingBox
}

function isStructuredGroupMaskCandidate(group = null, memberRegions = [], bbox = null, pageLayout = null) {
  if (!group || group.kind !== 'grid') return false
  if (!Number.isFinite(group.confidence) || group.confidence < STRUCTURED_GROUP_MIN_CONFIDENCE) return false
  if (!bbox) return false
  if (!Number.isFinite(getPageArea(pageLayout)) || getPageArea(pageLayout) <= 0) return false
  if (memberRegions.length < 2 || memberRegions.length > STRUCTURED_GROUP_MAX_MEMBER_COUNT) return false

  return true
}

function buildStructuredGroupMasks(pageLayout) {
  const structuredRegions = getStructuredRegions(pageLayout)
  const structuredGroups = getStructuredGroups(pageLayout)
  const regionMap = new Map(structuredRegions.map((region) => [region?.id || region?.regionId || null, region]).filter(([id]) => !!id))
  const masks = []

  for (const group of structuredGroups) {
    const groupId = group?.id || group?.groupId || null
    if (!groupId) continue

    const memberRegions = getStructuredGroupMemberRegions(group, regionMap)
    const bbox = getStructuredGroupBoundingBox(group, memberRegions, pageLayout)
    if (!isStructuredGroupMaskCandidate(group, memberRegions, bbox, pageLayout)) continue

    masks.push(Object.freeze({
      id: `mask-${pageLayout.pageNumber}-structured-group-${groupId}`,
      type: 'group',
      source: 'structured-group',
      boundingBox: bbox,
      padding: capPadding(ROW_PADDING, bbox.width, bbox.height),
      backgroundStrategy: 'sample',
      priority: 60,
      contentHint: 'text',
      ownerId: `structured-group:${groupId}`,
      groupId,
      groupKind: group.kind,
      layout: group.layout || null,
      confidence: group.confidence,
      regionIds: group.regionIds,
      regionKinds: group.regionKinds,
      sourceReferences: group.sourceReferences,
      relationships: group.relationships,
      structureSignals: group.structureSignals
    }))
  }

  return masks
}

function buildLegacyRowMasks(pageLayout, skipRegionIds = new Set()) {
  const masks = []

  for (const region of pageLayout.regions) {
    if (skipRegionIds.has(region.id)) continue
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

  const structuredCellResult = buildStructuredCellMasks(pageLayout)
  const structuredRowResult = buildStructuredRowMasks(pageLayout)
  const structuredRegionMasks = buildStructuredRegionMasks(pageLayout)
  const structuredGroupMasks = buildStructuredGroupMasks(pageLayout)

  const tableRegionIds = new Set()
  for (const region of pageLayout.regions) {
    if (region.type === 'table') {
      tableRegionIds.add(region.id)
    }
  }

  const cellMasks = [
    ...structuredCellResult.masks,
    ...buildLegacyCellMasks(pageLayout, structuredCellResult.regionIdsWithStructuredMasks)
  ]
  const rowMasks = [
    ...structuredRowResult.masks,
    ...buildLegacyRowMasks(pageLayout, structuredRowResult.regionIdsWithStructuredMasks)
  ]
  const blockMasks = buildBlockMasks(pageLayout, tableRegionIds)
  const regionMasks = [
    ...structuredRegionMasks,
    ...structuredGroupMasks
  ]

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
