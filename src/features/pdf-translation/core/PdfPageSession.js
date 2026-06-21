import { PdfLogicalBlockBuilder } from './PdfLogicalBlockBuilder.js'
import { buildPdfTextLinesFromItems } from './PdfLayoutAnalyzer.js'

function normalizePageSize(pageMetric = null) {
  return {
    width: Number(pageMetric?.naturalWidth || pageMetric?.width) || 0,
    height: Number(pageMetric?.naturalHeight || pageMetric?.height) || 0
  }
}

export class PdfPageSession {
  constructor({
    documentIdentity = '',
    pageNumber = 0
  } = {}) {
    this.documentIdentity = documentIdentity
    this.pageNumber = pageNumber
    this.pageSize = null
    this.textContent = null
    this.lines = []
    this.logicalBlocks = []
    this.loaded = false
    this.loadedAt = 0
    this.displayScale = 1
    this.logicalBlockBuilder = new PdfLogicalBlockBuilder()
  }

  updateDocumentIdentity(documentIdentity) {
    this.documentIdentity = documentIdentity || this.documentIdentity
  }

  async hydrate(page, pageMetric = null) {
    if (!page) {
      return this
    }

    this.pageNumber = page.pageNumber || this.pageNumber
    this.pageSize = normalizePageSize(pageMetric)
    this.displayScale = Number(pageMetric?.scale) || this.displayScale || 1

    if (this.loaded && this.textContent && this.logicalBlocks.length) {
      return this
    }

    this.textContent = await page.getTextContent({
      includeMarkedContent: true,
      disableCombineTextItems: false
    })

    this.lines = buildPdfTextLinesFromItems(this.textContent?.items || [], this.pageSize)
    this.logicalBlocks = await this.logicalBlockBuilder.build({
      documentIdentity: this.documentIdentity,
      pageNumber: this.pageNumber,
      pageSize: this.pageSize,
      lines: this.lines
    })
    this.loaded = true
    this.loadedAt = Date.now()

    return this
  }

  getLogicalBlocks() {
    return [...this.logicalBlocks]
  }

  getTextLines() {
    return [...this.lines]
  }

  reset() {
    this.pageSize = null
    this.textContent = null
    this.lines = []
    this.logicalBlocks = []
    this.loaded = false
    this.loadedAt = 0
    this.displayScale = 1
  }
}
