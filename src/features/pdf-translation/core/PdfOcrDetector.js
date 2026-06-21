const OCR_MIN_TEXT_ITEMS = 5
const OCR_MIN_TEXT_CHARS = 20

function countTextChars(textContent) {
  if (!textContent?.items) return 0

  let count = 0
  for (const item of textContent.items) {
    const str = item?.str || ''
    count += str.replace(/\s/g, '').length
  }

  return count
}

export class PdfOcrDetector {
  constructor(session, options = {}) {
    this.session = session
    this.minTextItems = options.minTextItems ?? OCR_MIN_TEXT_ITEMS
    this.minTextChars = options.minTextChars ?? OCR_MIN_TEXT_CHARS
  }

  isScannedCandidate(pageSession) {
    if (!pageSession?.loaded) return false
    if (pageSession.logicalBlocks.length > 0) return false

    const itemCount = pageSession.textContent?.items?.length ?? 0
    if (itemCount > this.minTextItems) return false

    const charCount = countTextChars(pageSession.textContent)
    if (charCount > this.minTextChars) return false

    return true
  }

  detectScannedPages() {
    const results = []

    for (const [pageNumber, pageSession] of this.session.pageSessions) {
      if (!this.session.visiblePageNumbers.has(pageNumber)) continue

      if (this.isScannedCandidate(pageSession)) {
        const alreadyOcrd = pageSession.ocrBlocks.length > 0
        results.push({
          pageNumber,
          isScannedCandidate: true,
          alreadyOcrd,
          ocrLanguage: pageSession.ocrLanguage || null
        })
      }
    }

    results.sort((a, b) => a.pageNumber - b.pageNumber)
    return results
  }

  getScannedPageCount() {
    return this.detectScannedPages().filter((p) => !p.alreadyOcrd).length
  }

  hasScannedPages() {
    return this.getScannedPageCount() > 0
  }
}
