/**
 * PdfLoader — converts a PdfSource into a named buffer.
 * ADR-015: Single owner for PDF loading.
 */
const REMOTE_PDF_LOAD_TIMEOUT_MS = 30_000

/**
 * Strips path segments and surrounding quotes from a raw filename.
 * Returns null for empty or unusable values.
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function sanitizeFilename(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const basename = raw.replace(/[\\/]+/g, '/').split('/').pop()
  const name = basename.trim().replace(/^["']|["']$/g, '')
  const cleaned = name.replace(/[\u0000-\u001f\u007f]/g, '') // eslint-disable-line no-control-regex
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return null
  }
  return cleaned
}

/**
 * Percent-decodes a value. Returns null when malformed.
 * @param {string} value
 * @returns {string|null}
 */
function decodePercent(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/**
 * Extracts the filename from a Content-Disposition header.
 * Supports both `filename=` and RFC 5987 `filename*=charset'lang'<value>`.
 * @param {string|null|undefined} header
 * @returns {string|null}
 */
function parseContentDispositionFilename(header) {
  if (typeof header !== 'string' || header.trim() === '') return null

  const extended = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header)
  if (extended) {
    const decoded = decodePercent(extended[1])
    const sanitized = sanitizeFilename(decoded)
    if (sanitized) return sanitized
  }

  const plain = /filename\s*=\s*("([^"]*)"|([^;]*))/i.exec(header)
  if (plain) {
    return sanitizeFilename((plain[2] || plain[3] || '').trim())
  }

  return null
}

/**
 * Extracts the percent-decoded basename of a URL path.
 * Returns null for unparseable URLs or empty path segments.
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
function resolveUrlFilename(url) {
  if (!url) return null

  let parsed
  try {
    parsed = new URL(url, 'https://invalid.invalid')
  } catch {
    return null
  }

  const segment = (parsed.pathname || '').split('/').pop()
  if (!segment) return null

  return sanitizeFilename(decodePercent(segment))
}

export const PdfLoader = {
  /**
   * @param {{ type: string, file?: File, url?: string }} source
   * @returns {Promise<{ name: string, buffer: ArrayBuffer }>}
   */
  async load(source) {
    if (source.type === 'file') {
      const buffer = await source.file.arrayBuffer();
      return { name: source.file.name || 'document.pdf', buffer };
    }
    if (source.type === 'url') {
      const controller = new AbortController()
      const timeoutId = setTimeout(
        () => controller.abort(new DOMException('Opening the PDF link timed out.', 'TimeoutError')),
        REMOTE_PDF_LOAD_TIMEOUT_MS,
      )

      try {
        const response = await fetch(source.url, { signal: controller.signal })
        if (response.ok === false) {
          const error = new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`)
          error.name = 'PdfHttpError'
          error.status = response.status
          error.statusText = response.statusText
          error.url = response.url || source.url
          throw error
        }
        const buffer = await response.arrayBuffer()
        const dispositionName = response.headers && typeof response.headers.get === 'function'
          ? parseContentDispositionFilename(response.headers.get('content-disposition'))
          : null
        const name = dispositionName
          || resolveUrlFilename(response.url)
          || resolveUrlFilename(source.url)
          || 'document.pdf'
        return { name, buffer }
      } finally {
        clearTimeout(timeoutId)
      }
    }
    throw new Error(`Unsupported PdfSource type: ${source.type}`)
  },
}
