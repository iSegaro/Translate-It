import { PdfOcrDetector } from './PdfOcrDetector.js'

export class PdfOcrRecommendationEngine {
  constructor() {
    this._detector = new PdfOcrDetector()
  }

  getRecommendations(pageSessions = []) {
    const recommendations = []

    for (const pageSession of pageSessions) {
      if (!pageSession) continue
      if (!this._detector.isScannedCandidate(pageSession)) continue
      if (pageSession?.ocrBlocks?.length > 0) continue
      recommendations.push(pageSession.pageNumber)
    }

    recommendations.sort((a, b) => a - b)
    return recommendations
  }
}
