import { computed, unref } from 'vue'

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Format PDF metadata dates. PDF.js emits ISO strings, native Date objects,
 * or PDF-format strings like "D:20240115123000Z".
 * Falls back to the raw value if parsing fails.
 */
function formatDate(value) {
  if (!value) return ''
  const date = parsePdfDate(value)
  if (!date) return String(value)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
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
      { label: 'File Name', value: source.fileName || '' },
      { label: 'Pages', value: source.pageCount > 0 ? String(source.pageCount) : '' },
      { label: 'File Size', value: formatFileSize(source.fileSize) },
      { label: 'Fingerprint', value: source.pdfFingerprint || '' },
      { label: 'Title', value: m.title || '' },
      { label: 'Author', value: m.author || '' },
      { label: 'Subject', value: m.subject || '' },
      { label: 'Keywords', value: m.keywords || '' },
      { label: 'Creator', value: m.creator || '' },
      { label: 'Producer', value: m.producer || '' },
      { label: 'Creation Date', value: formatDate(m.creationDate) },
      { label: 'Modification Date', value: formatDate(m.modificationDate) },
      { label: 'PDF Version', value: m.pdfVersion || '' },
    ].filter(r => r.value)
  })

  return { rows }
}
