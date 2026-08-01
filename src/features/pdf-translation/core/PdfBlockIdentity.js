const DEFAULT_PRECISION = 4
const textEncoder = new TextEncoder()

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function round(value, precision = DEFAULT_PRECISION) {
  const numeric = Number.isFinite(value) ? value : 0
  const factor = 10 ** precision
  return Math.round(numeric * factor) / factor
}

export function normalizePdfText(value) {
  return String(value ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\s\u200B-\u200D\uFEFF]+/gu, ' ')
    .trim()
}

function bufferToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function digestBytes(bytes) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable')
  }

  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return bufferToHex(digest)
}

export async function sha256HexFromText(value) {
  const normalized = normalizePdfText(value)
  return digestBytes(textEncoder.encode(normalized))
}

export async function sha256HexFromArrayBuffer(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw new Error('Expected an ArrayBuffer for SHA-256 hashing')
  }

  return digestBytes(arrayBuffer)
}

export function normalizePdfBoundingBox(box, pageSize = null, precision = DEFAULT_PRECISION) {
  const source = box || {}
  const normalized = {
    x: round(source.x, precision),
    y: round(source.y, precision),
    width: round(source.width, precision),
    height: round(source.height, precision)
  }

  if (!pageSize) {
    return normalized
  }

  const width = Number(pageSize.width) || 0
  const height = Number(pageSize.height) || 0

  if (width <= 0 || height <= 0) {
    return normalized
  }

  return {
    x: round(clamp(normalized.x / width, 0, 1), precision),
    y: round(clamp(normalized.y / height, 0, 1), precision),
    width: round(clamp(normalized.width / width, 0, 1), precision),
    height: round(clamp(normalized.height / height, 0, 1), precision)
  }
}

export function createPdfLogicalBlockIdentity({
  documentIdentity = '',
  pageNumber = 0,
  boundingBox = null,
  pageSize = null,
  sourceTextHash = '',
  role = 'paragraph'
}) {
  const normalizedDocumentIdentity = normalizePdfText(documentIdentity) || 'unknown-document'
  const normalizedBoundingBox = normalizePdfBoundingBox(boundingBox, pageSize)
  const textHash = normalizePdfText(sourceTextHash)
  const safeRole = normalizePdfText(role) || 'paragraph'

  return [
    normalizedDocumentIdentity,
    `p${pageNumber}`,
    `r:${safeRole}`,
    `x:${normalizedBoundingBox.x.toFixed(DEFAULT_PRECISION)}`,
    `y:${normalizedBoundingBox.y.toFixed(DEFAULT_PRECISION)}`,
    `w:${normalizedBoundingBox.width.toFixed(DEFAULT_PRECISION)}`,
    `h:${normalizedBoundingBox.height.toFixed(DEFAULT_PRECISION)}`,
    `t:${textHash}`
  ].join('|')
}
