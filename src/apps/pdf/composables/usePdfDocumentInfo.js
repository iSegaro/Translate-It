import { computed, unref } from 'vue'

const PDF_METADATA_PLACEHOLDER = '—'

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

export function usePdfDocumentInfo(raw) {
  const rows = computed(() => {
    const source = unref(raw) || {}
    const m = source.documentMetadata || {}

    return [
      { label: 'File Name', value: formatValue(source.fileName) },
      { label: 'File Size', value: formatFileSize(source.fileSize) },
      { label: 'Pages', value: source.pageCount > 0 ? String(source.pageCount) : PDF_METADATA_PLACEHOLDER },
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
