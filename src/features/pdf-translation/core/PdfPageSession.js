import { PdfLogicalBlockBuilder } from './PdfLogicalBlockBuilder.js'
import { buildPdfTextLinesFromItems } from './PdfLayoutAnalyzer.js'
import { buildPageLayoutModel, createEmptyPageLayoutModel } from './PageLayoutModel.js'

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
    this.pageLayout = createEmptyPageLayoutModel(pageNumber)
    this.loaded = false
    this.loadedAt = 0
    this.displayScale = 1
    this.logicalBlockBuilder = new PdfLogicalBlockBuilder()
    this.ocrBlocks = []
    this.ocrLanguage = null
    this.ocrCompletedAt = 0
    this.ocrError = null
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

    if (this.loaded && !this.textContent) {
      return this
    }

    this.textContent = await page.getTextContent({
      includeMarkedContent: true,
      disableCombineTextItems: false
    })

    this.lines = buildPdfTextLinesFromItems(this.textContent?.items || [], this.pageSize, this.textContent?.styles || null)
    this.logicalBlocks = await this.logicalBlockBuilder.build({
      documentIdentity: this.documentIdentity,
      pageNumber: this.pageNumber,
      pageSize: this.pageSize,
      lines: this.lines
    })
    this.pageLayout = buildPageLayoutModel({
      pageNumber: this.pageNumber,
      pageSize: this.pageSize,
      lines: this.lines,
      blocks: this.logicalBlocks
    })
    this.loaded = true
    this.loadedAt = Date.now()

    return this
  }

  getLogicalBlocks() {
    if (this.logicalBlocks.length > 0) {
      return [...this.logicalBlocks]
    }

    if (this.ocrBlocks.length > 0) {
      return [...this.ocrBlocks]
    }

    return []
  }

  get allBlocks() {
    return [...this.logicalBlocks, ...this.ocrBlocks]
  }

  setOcrBlocks(blocks, language) {
    this.ocrBlocks = blocks || []
    this.ocrLanguage = language || null
    this.ocrCompletedAt = Date.now()
    this.ocrError = null
  }

  clearOcrBlocks() {
    this.ocrBlocks = []
    this.ocrLanguage = null
    this.ocrCompletedAt = 0
    this.ocrError = null
  }

  hasOcrForLanguage(language) {
    return this.ocrBlocks.length > 0 && this.ocrLanguage === language
  }

  getTextLines() {
    return [...this.lines]
  }

  getPageLayout() {
    return this.pageLayout
  }

  reset() {
    this.pageSize = null
    this.textContent = null
    this.lines = []
    this.logicalBlocks = []
    this.pageLayout = createEmptyPageLayoutModel(this.pageNumber)
    this.loaded = false
    this.loadedAt = 0
    this.displayScale = 1
    this.ocrBlocks = []
    this.ocrLanguage = null
    this.ocrCompletedAt = 0
    this.ocrError = null
  }
}
