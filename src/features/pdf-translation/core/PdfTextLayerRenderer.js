import { TextLayerBuilder } from 'pdfjs-dist/web/pdf_viewer.mjs'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfTextLayerRenderer')

export class PdfTextLayerRenderer {
  constructor(container) {
    this.container = container
    this.builder = null
  }

  async render(page, viewport) {
    if (!this.container || !page || !viewport) return

    this.clear()

    this.builder = new TextLayerBuilder({
      pdfPage: page,
      onAppend: (div) => {
        this.container.replaceChildren(div)
      }
    })

    try {
      await this.builder.render({ viewport })
    } catch (error) {
      logger.warn('Failed to render PDF text layer:', error)
      throw error
    }
  }

  clear() {
    this.builder?.cancel()
    this.builder = null

    if (this.container) {
      this.container.replaceChildren()
    }
  }

  destroy() {
    this.clear()
    this.container = null
  }
}
