const OCR_MIN_TEXT_ITEMS = 5
const OCR_MIN_TEXT_CHARS = 20

export class PdfOcrDetector {
  constructor(session, options = {}) {
    this.session = session
    this.minTextItems = options.minTextItems ?? OCR_MIN_TEXT_ITEMS
    this.minTextChars = options.minTextChars ?? OCR_MIN_TEXT_CHARS
  }

  isScannedCandidate(candidate) {
    if (!candidate) return false
    if (candidate.logicalBlockCount > 0) return false
    if (candidate.textItemCount > this.minTextItems) return false
    if (candidate.textCharCount > this.minTextChars) return false

    return true
  }

  detectScannedPages() {
    const results = []

    for (const candidate of this.session?.getLoadedVisibleOcrCandidates?.() || []) {
      if (this.isScannedCandidate(candidate)) {
        results.push({
          pageNumber: candidate.pageNumber,
          isScannedCandidate: true,
          alreadyOcrd: candidate.hasOcrBlocks,
          ocrLanguage: candidate.ocrLanguage
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
