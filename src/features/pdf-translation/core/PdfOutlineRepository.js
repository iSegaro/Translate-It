import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { createOutlineNode } from './NavigationModels.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfOutlineRepository')

export class PdfOutlineRepository {
  constructor() {
    this._outline = null
    this._outlineGeneration = null
  }

  async load({ pdfDocument, documentGeneration, isDocumentGenerationCurrent } = {}) {
    if (!pdfDocument) {
      return null
    }

    if (this._outline !== null) {
      if (documentGeneration === undefined || this._outlineGeneration === documentGeneration) {
        return this._outline
      }
      this.clear()
    }

    try {
      const rawOutline = await pdfDocument.getOutline()

      if (isDocumentGenerationCurrent && !isDocumentGenerationCurrent(documentGeneration)) {
        return null
      }

      if (!rawOutline || !Array.isArray(rawOutline) || rawOutline.length === 0) {
        this._outline = null
        this._outlineGeneration = documentGeneration ?? null
        return null
      }

      const outline = rawOutline
        .map(createOutlineNode)
        .filter(Boolean)

      this._outline = outline.length > 0 ? outline : null
      this._outlineGeneration = documentGeneration ?? null
      return this._outline
    } catch (error) {
      if (isDocumentGenerationCurrent && !isDocumentGenerationCurrent(documentGeneration)) {
        return null
      }
      logger.warn('Failed to load PDF outline:', error)
      this._outline = null
      this._outlineGeneration = documentGeneration ?? null
      return null
    }
  }

  get() {
    return this._outline
  }

  clear() {
    this._outline = null
    this._outlineGeneration = null
  }
}
