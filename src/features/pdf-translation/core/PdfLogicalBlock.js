import {
  createPdfLogicalBlockIdentity,
  normalizePdfBoundingBox,
  normalizePdfText,
  sha256HexFromText
} from './PdfBlockIdentity.js'

function normalizePageSize(pageSize) {
  if (!pageSize) return null

  return {
    width: Number(pageSize.width) || 0,
    height: Number(pageSize.height) || 0
  }
}

function normalizeLine(line, pageSize) {
  if (!line) return null

  return {
    ...line,
    boundingBox: normalizePdfBoundingBox(line.boundingBox),
    normalizedBoundingBox: normalizePdfBoundingBox(line.boundingBox, pageSize),
    text: normalizePdfText(line.text),
    sourceTextHash: line.sourceTextHash || ''
  }
}

export async function createPdfLogicalBlock({
  documentIdentity = '',
  pageNumber = 0,
  role = 'paragraph',
  boundingBox = null,
  pageSize = null,
  text = '',
  lines = [],
  columnIndex = 0,
  readingOrderIndex = 0,
  roleMetadata = {},
  source = 'text-content'
}) {
  const normalizedPageSize = normalizePageSize(pageSize)
  const normalizedText = normalizePdfText(text)
  const normalizedBoundingBox = normalizePdfBoundingBox(boundingBox)
  const normalizedLines = await Promise.all(lines.map(async (line) => {
    const normalizedLine = normalizeLine(line, normalizedPageSize)
    if (!normalizedLine) return null

    const sourceTextHash = normalizedLine.sourceTextHash || await sha256HexFromText(normalizedLine.text)
    return {
      ...normalizedLine,
      sourceTextHash
    }
  }))
  const resolvedLines = normalizedLines.filter(Boolean)
  const sourceTextHash = await sha256HexFromText(normalizedText)

  return {
    id: createPdfLogicalBlockIdentity({
      documentIdentity,
      pageNumber,
      boundingBox: normalizedBoundingBox,
      pageSize: normalizedPageSize,
      text: normalizedText,
      sourceTextHash,
      role
    }),
    documentIdentity: normalizePdfText(documentIdentity) || 'unknown-document',
    pageNumber,
    role,
    text: normalizedText,
    sourceTextHash,
    textHash: sourceTextHash,
    boundingBox: normalizedBoundingBox,
    normalizedBoundingBox: normalizePdfBoundingBox(boundingBox, normalizedPageSize),
    pageSize: normalizedPageSize,
    lines: resolvedLines,
    lineCount: resolvedLines.length,
    columnIndex,
    readingOrderIndex,
    roleMetadata: {
      ...roleMetadata,
      lineCount: resolvedLines.length,
      isMultiLine: resolvedLines.length > 1
    },
    source
  }
}
