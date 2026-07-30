/**
 * PdfLoader — converts a PdfSource into a named buffer.
 * ADR-015: Single owner for PDF loading.
 */
const REMOTE_PDF_LOAD_TIMEOUT_MS = 30_000

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
        () => controller.abort(new DOMException('Remote PDF load timed out.', 'TimeoutError')),
        REMOTE_PDF_LOAD_TIMEOUT_MS,
      )

      try {
        const response = await fetch(source.url, { signal: controller.signal })
        const buffer = await response.arrayBuffer()
        return { name: 'document.pdf', buffer }
      } finally {
        clearTimeout(timeoutId)
      }
    }
    throw new Error(`Unsupported PdfSource type: ${source.type}`)
  },
}
