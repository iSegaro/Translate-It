import { PdfOcrDetector } from './PdfOcrDetector.js'

export class PdfOcrRecommendationEngine {
  constructor(pdfDocumentSession) {
    this._detector = new PdfOcrDetector(pdfDocumentSession)
  }

  getRecommendations() {
    return this._detector.detectScannedPages()
      .filter((p) => !p.alreadyOcrd)
      .map((p) => p.pageNumber)
      .sort((a, b) => a - b)
  }
}
