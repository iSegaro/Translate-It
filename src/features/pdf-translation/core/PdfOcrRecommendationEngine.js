import { PdfOcrDetector } from './PdfOcrDetector.js'

export class PdfOcrRecommendationEngine {
  constructor() {
    this._detector = new PdfOcrDetector()
  }

  getRecommendations(candidates = []) {
    const recommendations = []

    for (const candidate of candidates) {
      if (!candidate) continue
      if (!this._detector.isScannedCandidate(candidate)) continue
      if (candidate.hasOcrBlocks) continue
      recommendations.push(candidate.pageNumber)
    }

    recommendations.sort((a, b) => a - b)
    return recommendations
  }
}
