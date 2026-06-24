import { normalizePdfBoundingBox, normalizePdfText } from './PdfBlockIdentity.js'

const VIRTUAL_WHITESPACE_PATTERN = /\s{2,}/
const MIN_VIRTUAL_TEXT_GROUPS = 3

function getNumeric(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function getItemDirection(item) {
  return String(item?.dir || '').toLowerCase()
}

function getItemFontSize(item) {
  const transform = item?.transform || []
  const candidate = Math.abs(getNumeric(transform[3], 0)) || Math.abs(getNumeric(item?.height, 0))
  return candidate > 0 ? candidate : 12
}

function getItemGeometry(item, pageHeight) {
  const width = Math.max(0, getNumeric(item?.width, 0))
  const height = Math.max(0, getNumeric(item?.height, 0) || getItemFontSize(item))
  const left = getNumeric(item?.transform?.[4], 0)
  const baseline = getNumeric(item?.transform?.[5], 0)
  const top = pageHeight > 0 ? Math.max(0, pageHeight - baseline - height) : Math.max(0, baseline)

  return {
    x: left,
    y: top,
    width,
    height,
    right: left + width,
    bottom: top + height
  }
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function medianValue(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function mostFrequentValue(values) {
  if (!values.length) return null
  const counts = new Map()
  for (const v of values) {
    counts.set(v, (counts.get(v) || 0) + 1)
  }
  let best = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

function buildLineText(items, rtl = false) {
  const orderedItems = rtl ? [...items].sort((a, b) => b.x - a.x || a.index - b.index) : [...items].sort((a, b) => a.x - b.x || a.index - b.index)
  let text = ''
  let previous = null

  for (const item of orderedItems) {
    if (item.text.length === 0) continue
    if (previous) {
      const gap = item.x - previous.right
      if (!rtl && gap > Math.max(previous.height * 0.25, 1.5)) {
        text += ' '
      }
      if (rtl && previous.x - item.right > Math.max(previous.height * 0.25, 1.5)) {
        text += ' '
      }
    }
    text += item.text
    previous = item
  }

  return normalizePdfText(text)
}

function buildLineBoundingBox(items) {
  const x = Math.min(...items.map((item) => item.x))
  const y = Math.min(...items.map((item) => item.y))
  const right = Math.max(...items.map((item) => item.right))
  const bottom = Math.max(...items.map((item) => item.bottom))

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y)
  }
}

function inferLineDirection(items) {
  const rtlCount = items.reduce((count, item) => count + (getItemDirection(item.raw) === 'rtl' ? 1 : 0), 0)
  return rtlCount > items.length / 2 ? 'rtl' : 'ltr'
}

function buildVirtualItemsFromWhitespace(item) {
  const rawStr = item.raw?.str
  if (!rawStr || !VIRTUAL_WHITESPACE_PATTERN.test(rawStr)) return null

  const groups = rawStr.split(VIRTUAL_WHITESPACE_PATTERN)
  const textGroups = groups.filter((g) => g.trim().length > 0)

  if (textGroups.length < MIN_VIRTUAL_TEXT_GROUPS) return null

  const bboxWidth = getNumeric(item.width, 0)
  if (bboxWidth <= 0) return null

  const totalChars = rawStr.length
  if (totalChars <= 0) return null

  const charWidth = bboxWidth / totalChars
  let charOffset = 0

  return textGroups.map((rawGroup, i) => {
    const groupStart = rawStr.indexOf(rawGroup, charOffset)
    charOffset = groupStart >= 0 ? groupStart + rawGroup.length : charOffset + rawGroup.length
    const startOffset = groupStart >= 0 ? groupStart : 0
    const text = normalizePdfText(rawGroup)
    const width = text.length * charWidth
    const x = item.x + startOffset * charWidth

    return {
      index: i,
      raw: item.raw,
      text,
      x,
      y: item.y,
      right: x + width,
      bottom: item.bottom,
      width,
      height: item.height,
      fontSize: item.fontSize,
      fontFamily: item.fontFamily,
      ascent: item.ascent,
      descent: item.descent,
      vertical: item.vertical,
      virtualFromWhitespace: true
    }
  })
}

function buildLineFromBucket(bucket, pageSize, styles = null) {
  const pageHeight = getNumeric(pageSize?.height, 0)
  const items = bucket
    .map((item, index) => {
      const geometry = getItemGeometry(item, pageHeight)
      const fontName = item?.fontName || item?.raw?.fontName || null
      const fontStyle = fontName && styles ? styles[fontName] : null

      return {
        index,
        raw: item,
        text: normalizePdfText(item?.str),
        ...geometry,
        fontSize: getItemFontSize(item),
        fontFamily: fontStyle?.fontFamily || null,
        ascent: fontStyle?.ascent != null ? getNumeric(fontStyle.ascent) : null,
        descent: fontStyle?.descent != null ? getNumeric(fontStyle.descent) : null,
        vertical: fontStyle?.vertical === true
      }
    })
    .filter((item) => item.text.length > 0)

  if (!items.length) return null

  const direction = inferLineDirection(items)
  const text = buildLineText(items, direction === 'rtl')
  const boundingBox = buildLineBoundingBox(items)
  const fontSize = median(items.map((item) => item.fontSize)) || items[0].fontSize || 12

  let detectionItems = items
  if (items.length === 1) {
    const virtualItems = buildVirtualItemsFromWhitespace(items[0])
    if (virtualItems) {
      detectionItems = virtualItems
    }
  }

  const dominantFontFamily = mostFrequentValue(detectionItems.map((item) => item.fontFamily).filter(Boolean))
  const medianAscent = medianValue(detectionItems.map((item) => item.ascent).filter((v) => v != null))
  const medianDescent = medianValue(detectionItems.map((item) => item.descent).filter((v) => v != null))
  const hasVertical = detectionItems.some((item) => item.vertical)

  return {
    text,
    direction,
    items: detectionItems,
    boundingBox,
    normalizedBoundingBox: normalizePdfBoundingBox(boundingBox, pageSize),
    fontSize,
    averageItemCount: detectionItems.length,
    role: 'paragraph',
    roleMetadata: {
      direction,
      fontSize,
      itemCount: detectionItems.length,
      ...(dominantFontFamily ? { fontFamily: dominantFontFamily } : {}),
      ...(medianAscent != null ? { ascent: medianAscent } : {}),
      ...(medianDescent != null ? { descent: medianDescent } : {}),
      ...(hasVertical ? { vertical: true } : {})
    }
  }
}

export function buildPdfTextLinesFromItems(textItems = [], pageSize = null, styles = null) {
  const filteredItems = textItems.filter((item) => normalizePdfText(item?.str).length > 0)
  if (!filteredItems.length) return []

  const pageHeight = getNumeric(pageSize?.height, 0)
  const heights = filteredItems.map((item) => getItemFontSize(item) || getNumeric(item?.height, 0))
  const lineTolerance = Math.max(2, median(heights) * 0.75)
  const buckets = new Map()

  filteredItems.forEach((item) => {
    const geometry = getItemGeometry(item, pageHeight)
    const key = Math.round(geometry.y / lineTolerance)
    if (!buckets.has(key)) {
      buckets.set(key, [])
    }
    buckets.get(key).push(item)
  })

  return [...buckets.values()]
    .map((bucket) => buildLineFromBucket(bucket, pageSize, styles))
    .filter(Boolean)
    .sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x)
    .map((line, index) => ({
      ...line,
      index,
      normalizedBoundingBox: normalizePdfBoundingBox(line.boundingBox, pageSize)
    }))
}

function detectColumnClusters(lines, pageSize) {
  const pageWidth = getNumeric(pageSize?.width, 0)
  if (!pageWidth || lines.length < 4) {
    return [lines.map((line) => ({ ...line, columnIndex: 0 }))]
  }

  const sortedByX = [...lines].sort((a, b) => a.boundingBox.x - b.boundingBox.x || a.boundingBox.y - b.boundingBox.y)
  const gaps = []

  for (let index = 0; index < sortedByX.length - 1; index += 1) {
    const current = sortedByX[index]
    const next = sortedByX[index + 1]
    gaps.push({
      gap: next.boundingBox.x - current.boundingBox.x,
      index
    })
  }

  const widestGap = gaps.sort((a, b) => b.gap - a.gap)[0]
  const threshold = Math.max(pageWidth * 0.18, 48)

  if (!widestGap || widestGap.gap < threshold) {
    return [lines.map((line) => ({ ...line, columnIndex: 0 }))]
  }

  const leftCluster = sortedByX.slice(0, widestGap.index + 1)
  const rightCluster = sortedByX.slice(widestGap.index + 1)

  if (leftCluster.length < 2 || rightCluster.length < 2) {
    return [lines.map((line) => ({ ...line, columnIndex: 0 }))]
  }

  return [
    leftCluster.map((line) => ({ ...line, columnIndex: 0 })),
    rightCluster.map((line) => ({ ...line, columnIndex: 1 }))
  ]
}

function sortClusterReadingOrder(cluster) {
  return [...cluster].sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x)
}

export function resolvePdfReadingOrder(lines = [], pageSize = null) {
  if (lines.length <= 1) {
    return lines.map((line, index) => ({ ...line, readingOrderIndex: index, columnIndex: 0 }))
  }

  const direction = lines.reduce((accumulator, line) => {
    return accumulator + (line.direction === 'rtl' ? -1 : 1)
  }, 0) < 0 ? 'rtl' : 'ltr'

  const clusters = detectColumnClusters(lines, pageSize)
  const orderedClusters = direction === 'rtl' ? [...clusters].reverse() : clusters

  return orderedClusters.flatMap((cluster, columnIndex) => {
    return sortClusterReadingOrder(cluster).map((line, lineIndex) => ({
      ...line,
      columnIndex,
      readingOrderIndex: lineIndex
    }))
  })
}

function isListItemText(text) {
  return /^(?:[•‣◦·*-]|\(?\d+(?:\.\d+)*[.)]?|[a-zA-Z][.)])\s+\S/.test(text)
}

function isCaptionText(text) {
  return /^(?:figure|fig\.|table|caption)\b/i.test(text)
}

function isHeadingLikeLine(line, context) {
  const medianFontSize = getNumeric(context?.medianFontSize, 0)
  const pageHeight = getNumeric(context?.pageSize?.height, 0)
  const fontRatio = medianFontSize > 0 ? line.fontSize / medianFontSize : 1
  const isShort = line.text.length <= Math.max(60, getNumeric(context?.averageLineLength, 0) * 0.75 || 60)
  const inTopBand = pageHeight > 0 ? line.boundingBox.y <= pageHeight * 0.25 : true

  return line.fontSize >= 13 && fontRatio >= 1.25 && (isShort || inTopBand)
}

function isTableLikeLine(line) {
  if (line.items.length < 2) return false

  const gaps = [...line.items]
    .sort((a, b) => a.x - b.x || a.index - b.index)
    .map((item, index, items) => {
      if (index === items.length - 1) return 0
      const next = items[index + 1]
      return next.x - item.right
    })

  const widestGap = Math.max(...gaps, 0)
  return widestGap >= Math.max(line.fontSize * 1.5, 24) || /\s{3,}/.test(line.text)
}

export function detectPdfLineRole(line, context = {}) {
  const text = normalizePdfText(line?.text)
  if (!text) return 'paragraph'

  if (isTableLikeLine(line, context)) return 'table-cell'
  if (isListItemText(text)) return 'list-item'
  if (isCaptionText(text)) return 'caption'
  if (isHeadingLikeLine(line, context)) return 'heading'

  return 'paragraph'
}

function canAppendLineToBlock(block, line, role, context) {
  if (!block) return false

  if (block.role === 'heading' || block.role === 'caption' || block.role === 'list-item') {
    return false
  }

  if (role === 'heading' || role === 'caption' || role === 'list-item') {
    return false
  }

  if (block.columnIndex !== line.columnIndex) {
    return false
  }

  const blockBottom = block.boundingBox.y + block.boundingBox.height
  const gap = line.boundingBox.y - blockBottom

  if (role === 'table-cell' || block.role === 'table-cell' || block.role === 'table-region') {
    const xDelta = Math.abs(line.boundingBox.x - block.boundingBox.x)
    return gap <= Math.max(block.roleMetadata?.fontSize * 1.25 || 12, 14) && xDelta <= Math.max(getNumeric(context?.pageSize?.width, 0) * 0.05, 24)
  }

  return gap <= Math.max(block.roleMetadata?.fontSize * 1.1 || 10, 10)
}

function mergeBoundingBoxes(current, next) {
  const x = Math.min(current.x, next.x)
  const y = Math.min(current.y, next.y)
  const right = Math.max(current.x + current.width, next.x + next.width)
  const bottom = Math.max(current.y + current.height, next.y + next.height)

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y)
  }
}

function isScheduleLikeBlock(block) {
  if (!block || block.lines.length < 2) return false

  const linesWithItems = block.lines.filter((line) => line.items && line.items.length >= 2)
  if (linesWithItems.length < 2) return false

  const xPositions = linesWithItems.map((line) => {
    const sorted = [...line.items].sort((a, b) => a.x - b.x)
    return sorted.map((item) => Math.round(item.x))
  })

  if (xPositions.length < 2) return false

  const firstPositions = xPositions[0]
  if (firstPositions.length < 2) return false

  const tolerance = 8
  const allAligned = xPositions.every((positions) => {
    if (positions.length !== firstPositions.length) return false
    return positions.every((x, i) => Math.abs(x - firstPositions[i]) <= tolerance)
  })

  if (!allAligned) return false

  const fontSizes = linesWithItems.map((line) => line.fontSize)
  const minFontSize = Math.min(...fontSizes)
  const maxFontSize = Math.max(...fontSizes)
  if (maxFontSize - minFontSize > 3) return false

  return true
}

function startBlockFromLine(line, context, blockIndex) {
  const role = detectPdfLineRole(line, context)
  return {
    blockIndex,
    role,
    lines: [line],
    text: line.text,
    boundingBox: { ...line.boundingBox },
    columnIndex: line.columnIndex,
    readingOrderIndex: line.readingOrderIndex,
    roleMetadata: {
      ...line.roleMetadata,
      inferredRole: role,
      sourceLineRoles: [role],
      lineCount: 1,
      isStructured: role === 'table-cell'
    }
  }
}

function appendLineToBlock(block, line, role) {
  const separator = block.role === 'table-cell' || block.role === 'table-region' || role === 'table-cell' ? '\n' : ' '
  const nextLines = [...block.lines, line]
  const nextRole = block.role === 'table-cell' || role === 'table-cell' ? 'table-region' : block.role
  const nextBlock = {
    ...block,
    role: nextRole,
    lines: nextLines,
    text: normalizePdfText([block.text, line.text].filter(Boolean).join(separator)),
    boundingBox: mergeBoundingBoxes(block.boundingBox, line.boundingBox),
    readingOrderIndex: Math.min(block.readingOrderIndex, line.readingOrderIndex),
    roleMetadata: {
      ...block.roleMetadata,
      inferredRole: nextRole,
      sourceLineRoles: [...(block.roleMetadata?.sourceLineRoles || []), role],
      lineCount: nextLines.length,
      isMultiLine: nextLines.length > 1,
      isStructured: nextRole === 'table-region' || nextRole === 'table-cell'
    }
  }

  if (!nextBlock.roleMetadata.isStructured && isScheduleLikeBlock(nextBlock)) {
    nextBlock.roleMetadata.isStructured = true
  }

  return nextBlock
}

export function buildPdfLogicalBlocksFromLines(lines = [], context = {}) {
  if (!lines.length) return []

  const orderedLines = resolvePdfReadingOrder(lines, context.pageSize)
  const enrichedContext = {
    ...context,
    medianFontSize: median(orderedLines.map((line) => line.fontSize)),
    averageLineLength: orderedLines.length ? orderedLines.reduce((sum, line) => sum + line.text.length, 0) / orderedLines.length : 0
  }

  const blocks = []
  let activeBlock = null

  orderedLines.forEach((line, blockIndex) => {
    const role = detectPdfLineRole(line, enrichedContext)
    const lineWithRole = {
      ...line,
      role,
      roleMetadata: {
        ...line.roleMetadata,
        inferredRole: role
      }
    }

    if (canAppendLineToBlock(activeBlock, lineWithRole, role, enrichedContext)) {
      activeBlock = appendLineToBlock(activeBlock, lineWithRole, role)
      return
    }

    if (activeBlock) {
      blocks.push(activeBlock)
    }

    activeBlock = startBlockFromLine(lineWithRole, enrichedContext, blockIndex)
  })

  if (activeBlock) {
    blocks.push(activeBlock)
  }

  return blocks
}
