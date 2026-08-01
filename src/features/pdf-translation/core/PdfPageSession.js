import { PdfLogicalBlockBuilder } from './PdfLogicalBlockBuilder.js'
import { buildPdfTextLinesFromItems } from './PdfLayoutAnalyzer.js'
import { detectLayoutRegions } from './LayoutRegionDetector.js'
import { buildPageLayoutModel, createEmptyPageLayoutModel } from './PageLayoutModel.js'
import { buildPageMaskModel } from './PageMaskModelBuilder.js'

export const PAGE_CONTENT_SOURCE = Object.freeze({
  PDF_TEXT: 'pdf-text',
  OCR: 'ocr',
  NONE: 'none',
  MIXED: 'mixed'
})

function normalizePageSize(pageMetric = null) {
  return {
    width: Number(pageMetric?.naturalWidth || pageMetric?.width) || 0,
    height: Number(pageMetric?.naturalHeight || pageMetric?.height) || 0
  }
}

function createCommittedOcrState({
  ocrBlocks = [],
  ocrLanguage = null,
  ocrCompletedAt = 0,
  ocrError = null
} = {}) {
  return { ocrBlocks, ocrLanguage, ocrCompletedAt, ocrError }
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
    this.pageMaskModel = null
    this.loaded = false
    this.displayScale = 1
    this.logicalBlockBuilder = new PdfLogicalBlockBuilder()
    this.committedOcrState = createCommittedOcrState()
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

    // `loaded` marks completed extraction, including image-only pages with no blocks.
    if (this.loaded) {
      return this
    }

    this.textContent = await page.getTextContent({
      includeMarkedContent: true,
      disableCombineTextItems: false,
      disableNormalization: true
    })

    this.lines = buildPdfTextLinesFromItems(this.textContent?.items || [], this.pageSize, this.textContent?.styles || null)
    const detectedRegions = detectLayoutRegions(this.lines, this.pageNumber)
    this.logicalBlocks = await this.logicalBlockBuilder.build({
      documentIdentity: this.documentIdentity,
      pageNumber: this.pageNumber,
      pageSize: this.pageSize,
      lines: this.lines,
      regions: detectedRegions
    })
    this.pageLayout = buildPageLayoutModel({
      pageNumber: this.pageNumber,
      pageSize: this.pageSize,
      lines: this.lines,
      blocks: this.logicalBlocks,
      regions: detectedRegions
    })
    this.pageMaskModel = null
    this.loaded = true

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

  getPageContentSource() {
    if (this.logicalBlocks.length > 0) return PAGE_CONTENT_SOURCE.PDF_TEXT
    if (this.ocrBlocks.length > 0) return PAGE_CONTENT_SOURCE.OCR
    return PAGE_CONTENT_SOURCE.NONE
  }

  get allBlocks() {
    return [...this.logicalBlocks, ...this.ocrBlocks]
  }

  get ocrBlocks() {
    return this.committedOcrState.ocrBlocks
  }

  get ocrLanguage() {
    return this.committedOcrState.ocrLanguage
  }

  get ocrCompletedAt() {
    return this.committedOcrState.ocrCompletedAt
  }

  get ocrError() {
    return this.committedOcrState.ocrError
  }

  getCommittedOcrState() {
    return this.committedOcrState
  }

  setOcrBlocks(blocks, language, ocrCompletedAt = Date.now()) {
    this.committedOcrState = createCommittedOcrState({
      ocrBlocks: blocks || [],
      ocrLanguage: language || null,
      ocrCompletedAt,
      ocrError: null
    })
  }

  clearOcrBlocks() {
    this.committedOcrState = createCommittedOcrState()
  }

  setOcrError(error) {
    this.committedOcrState = createCommittedOcrState({
      ...this.committedOcrState,
      ocrError: error || 'OCR failed'
    })
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

  getPageMaskModel() {
    if (this.pageMaskModel) {
      return this.pageMaskModel
    }

    this.pageMaskModel = buildPageMaskModel(this.pageLayout)
    return this.pageMaskModel
  }
}
