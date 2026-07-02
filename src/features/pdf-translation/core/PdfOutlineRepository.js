import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { createOutlineNode } from './NavigationModels.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfOutlineRepository')

export class PdfOutlineRepository {
  constructor() {
    this._outline = null
  }

  async load({ pdfDocument }) {
    if (!pdfDocument) {
      return null
    }

    if (this._outline !== null) {
      return this._outline
    }

    try {
      const rawOutline = await pdfDocument.getOutline()

      if (!rawOutline || !Array.isArray(rawOutline) || rawOutline.length === 0) {
        this._outline = null
        return null
      }

      const outline = rawOutline
        .map(createOutlineNode)
        .filter(Boolean)

      this._outline = outline.length > 0 ? outline : null
      return this._outline
    } catch (error) {
      logger.warn('Failed to load PDF outline:', error)
      this._outline = null
      return null
    }
  }

  get() {
    return this._outline
  }

  clear() {
    this._outline = null
  }
}
