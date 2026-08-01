import { PdfOcrDetector } from './PdfOcrDetector.js'

export class PdfOcrRecommendationEngine {
  constructor() {
    this._detector = new PdfOcrDetector()
  }

  getRecommendations(candidates = [], currentLanguage = null) {
    const recommendations = []

    for (const candidate of candidates) {
      if (!candidate) continue
      if (!this._detector.isScannedCandidate(candidate)) continue
      if (candidate.hasOcrBlocks && candidate.ocrLanguage === currentLanguage) continue
      recommendations.push(candidate.pageNumber)
    }

    recommendations.sort((a, b) => a - b)
    return recommendations
  }
}
