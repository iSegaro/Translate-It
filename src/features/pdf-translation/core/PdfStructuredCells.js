function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoundingBoxLike(value) {
  return !!value && typeof value === 'object' &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
}

function isSourceReferencesLike(value) {
  return !!value && typeof value === 'object' &&
    Array.isArray(value.blockIds) &&
    Array.isArray(value.lineIds) &&
    Array.isArray(value.sourceLineIndices) &&
    Array.isArray(value.sourceItemIndices) &&
    Array.isArray(value.groupRegionIds)
}

function isStructuredCellLike(value) {
  return !!value && typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.regionId === 'string' &&
    isFiniteNumber(value.rowIndex) &&
    isFiniteNumber(value.columnIndex) &&
    isFiniteNumber(value.rowSpan) &&
    isFiniteNumber(value.colSpan) &&
    typeof value.spanType === 'string' &&
    typeof value.role === 'string' &&
    typeof value.text === 'string' &&
    (value.boundingBox == null || isBoundingBoxLike(value.boundingBox)) &&
    isSourceReferencesLike(value.sourceReferences) &&
    typeof value.spanCandidate === 'boolean' &&
    isFiniteNumber(value.estimatedRowSpan) &&
    isFiniteNumber(value.estimatedColSpan) &&
    isFiniteNumber(value.confidence)
}

function cloneSerializable(value) {
  if (value == null) return value

  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value))
}

export function normalizeStructuredCells(translatedCells = []) {
  if (!Array.isArray(translatedCells) || translatedCells.length === 0) return null

  const normalized = []
  for (const line of translatedCells) {
    if (!line || typeof line !== 'object') return null
    if (!isFiniteNumber(line.lineIndex) || !Array.isArray(line.cells)) return null
    if (!line.cells.every((cell) => typeof cell === 'string')) return null

    const nextLine = {
      lineIndex: line.lineIndex,
      cells: cloneSerializable(line.cells)
    }

    const metadataKeys = ['cellIds', 'columnIndices', 'rowIndices', 'colSpanCandidates', 'estimatedColSpans']
    for (const key of metadataKeys) {
      if (line[key] == null) continue
      if (!Array.isArray(line[key])) return null
      nextLine[key] = cloneSerializable(line[key])
    }

    if (line.structuredCells != null) {
      if (!Array.isArray(line.structuredCells)) return null
      if (!line.structuredCells.every((cell) => cell == null || isStructuredCellLike(cell))) return null
      nextLine.structuredCells = cloneSerializable(line.structuredCells)
    }

    normalized.push(nextLine)
  }

  return normalized
}
