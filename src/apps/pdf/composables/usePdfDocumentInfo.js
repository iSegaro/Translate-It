import { computed, unref } from 'vue'

const PDF_METADATA_PLACEHOLDER = '—'
const PAGE_SIZE_VARIES = 'Varies'
const PAGE_SIZE_PORTRAIT = 'Portrait'
const PAGE_SIZE_LANDSCAPE = 'Landscape'
const PAGE_SIZE_SQUARE = 'Square'
const POINTS_PER_INCH = 72
const MILLIMETERS_PER_INCH = 25.4
const PAGE_SIZE_TOLERANCE = 1
const STANDARD_PAGE_SIZES = Object.freeze([
  { name: 'A0', width: 2383.94, height: 3370.39 },
  { name: 'A1', width: 1683.78, height: 2383.94 },
  { name: 'A2', width: 1190.55, height: 1683.78 },
  { name: 'A3', width: 841.89, height: 1190.55 },
  { name: 'A4', width: 595.28, height: 841.89 },
  { name: 'A5', width: 419.53, height: 595.28 },
  { name: 'A6', width: 297.64, height: 419.53 },
  { name: 'Letter', width: 612, height: 792 },
  { name: 'Legal', width: 612, height: 1008 },
  { name: 'Tabloid', width: 792, height: 1224 }
])

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return PDF_METADATA_PLACEHOLDER
  const readableSize = bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${readableSize} (${bytes.toLocaleString()} bytes)`
}

/**
 * Format PDF metadata dates. PDF.js emits ISO strings, native Date objects,
 * or PDF-format strings like "D:20240115123000Z".
 * Falls back to the raw value if parsing fails.
 */
function formatDate(value) {
  if (!value) return PDF_METADATA_PLACEHOLDER
  const date = parsePdfDate(value)
  if (!date) return String(value)
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  })
}

function formatValue(value) {
  return value ? String(value) : PDF_METADATA_PLACEHOLDER
}

function parsePdfDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value
  const str = String(value)
  const iso = new Date(str)
  if (!isNaN(iso.getTime())) return iso
  // PDF format: D:YYYYMMDDHHmmSS[...Z]
  const pdfMatch = str.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
  if (pdfMatch) {
    return new Date(
      Date.UTC(
        +pdfMatch[1], +pdfMatch[2] - 1, +pdfMatch[3],
        +pdfMatch[4], +pdfMatch[5], +pdfMatch[6]
      )
    )
  }
  return null
}

function isValidPageMetric(metric) {
  return Number.isFinite(metric?.naturalWidth) && metric.naturalWidth > 0 &&
    Number.isFinite(metric?.naturalHeight) && metric.naturalHeight > 0
}

function formatNumber(value, maximumFractionDigits) {
  return value.toLocaleString(undefined, { maximumFractionDigits })
}

function findStandardPageSize(width, height) {
  const shortSide = Math.min(width, height)
  const longSide = Math.max(width, height)
  let match = null

  for (const size of STANDARD_PAGE_SIZES) {
    const difference = Math.abs(shortSide - size.width) + Math.abs(longSide - size.height)
    if (Math.abs(shortSide - size.width) <= PAGE_SIZE_TOLERANCE &&
      Math.abs(longSide - size.height) <= PAGE_SIZE_TOLERANCE &&
      (!match || difference < match.difference)) {
      match = { size, difference }
    }
  }

  return match?.size || null
}

function resolvePageOrientation(width, height) {
  if (width === height) return PAGE_SIZE_SQUARE
  return width > height ? PAGE_SIZE_LANDSCAPE : PAGE_SIZE_PORTRAIT
}

function formatPageDimensions(width, height) {
  const millimeters = `${formatNumber(width * MILLIMETERS_PER_INCH / POINTS_PER_INCH, 1)} × ${formatNumber(height * MILLIMETERS_PER_INCH / POINTS_PER_INCH, 1)} mm`
  const inches = `${formatNumber(width / POINTS_PER_INCH, 2)} × ${formatNumber(height / POINTS_PER_INCH, 2)} in`
  return `${millimeters} (${inches})`
}

function formatPdfPageSize(naturalWidth, naturalHeight) {
  if (!Number.isFinite(naturalWidth) || naturalWidth <= 0 ||
    !Number.isFinite(naturalHeight) || naturalHeight <= 0) return null

  const standardSize = findStandardPageSize(naturalWidth, naturalHeight)
  const width = standardSize
    ? naturalWidth > naturalHeight ? standardSize.height : standardSize.width
    : naturalWidth
  const height = standardSize
    ? naturalWidth > naturalHeight ? standardSize.width : standardSize.height
    : naturalHeight
  const orientation = resolvePageOrientation(naturalWidth, naturalHeight)
  const dimensions = formatPageDimensions(width, height)

  if (standardSize) return `${standardSize.name} ${orientation} — ${dimensions}`
  return orientation === PAGE_SIZE_SQUARE ? `${PAGE_SIZE_SQUARE} — ${dimensions}` : dimensions
}

function resolvePageSize(pageMetrics) {
  const metrics = Array.isArray(pageMetrics) ? pageMetrics : []
  const validMetrics = metrics.filter(isValidPageMetric)
  if (validMetrics.length === 0) return PDF_METADATA_PLACEHOLDER
  if (validMetrics.length !== metrics.length) return PAGE_SIZE_VARIES

  const first = validMetrics[0]
  const varies = validMetrics.some(metric =>
    Math.abs(metric.naturalWidth - first.naturalWidth) > PAGE_SIZE_TOLERANCE ||
    Math.abs(metric.naturalHeight - first.naturalHeight) > PAGE_SIZE_TOLERANCE
  )
  if (varies) return PAGE_SIZE_VARIES

  return formatPdfPageSize(first.naturalWidth, first.naturalHeight) || PDF_METADATA_PLACEHOLDER
}

export function usePdfDocumentInfo(raw) {
  const rows = computed(() => {
    const source = unref(raw) || {}
    const m = source.documentMetadata || {}

    return [
      { label: 'File Name', value: formatValue(source.fileName) },
      { label: 'File Size', value: formatFileSize(source.fileSize) },
      { label: 'Pages', value: source.pageCount > 0 ? String(source.pageCount) : PDF_METADATA_PLACEHOLDER },
      { label: 'Page Size', value: resolvePageSize(source.pageMetrics) },
      { label: 'Title', value: formatValue(m.title) },
      { label: 'Author', value: formatValue(m.author) },
      { label: 'Subject', value: formatValue(m.subject) },
      { label: 'Keywords', value: formatValue(m.keywords) },
      { label: 'Creation Date', value: formatDate(m.creationDate) },
      { label: 'Modification Date', value: formatDate(m.modificationDate) },
      { label: 'Creator', value: formatValue(m.creator) },
      { label: 'Producer', value: formatValue(m.producer) },
      { label: 'PDF Version', value: formatValue(m.pdfVersion) },
    ]
  })

  return { rows }
}
