import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { AnnotationType } from './pdfjs.js'
import { createLinkAnnotation } from './NavigationModels.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfLinkAnnotationRepository')

export class PdfLinkAnnotationRepository {
  constructor() {
    this._cache = new Map()
  }

  async getAnnotations({ pdfDocument, metric, pageNumber }) {
    if (!pdfDocument) {
      return []
    }

    if (this._cache.has(pageNumber)) {
      return this._cache.get(pageNumber)
    }

    if (!metric) {
      this._cache.set(pageNumber, [])
      return []
    }

    try {
      const page = await pdfDocument.getPage(pageNumber)
      const rawAnnotations = await page.getAnnotations({ intent: 'display' })

      const linkAnnotations = rawAnnotations
        .filter((a) => a.annotationType === AnnotationType.LINK)
        .map(createLinkAnnotation)
        .filter(Boolean)

      this._cache.set(pageNumber, linkAnnotations)
      return linkAnnotations
    } catch (error) {
      logger.warn(`Failed to load annotations for page ${pageNumber}:`, error)
      this._cache.set(pageNumber, [])
      return []
    }
  }

  clear() {
    this._cache.clear()
  }
}
