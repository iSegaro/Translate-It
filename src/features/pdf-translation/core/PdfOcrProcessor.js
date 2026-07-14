import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { recognizeStructured } from '@/features/screen-capture/services/ocrEngine.js'
import { toTesseractLanguageCode } from '@/features/screen-capture/utils/ocrLanguageMap.js'
import { createPdfLogicalBlock } from './PdfLogicalBlock.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfOcrProcessor')

export class PdfOcrProcessor {
  constructor(session) {
    this.session = session
    this.isProcessing = false
    this._cancelled = false
  }

  async processPage(pageNumber, { language = 'eng', onProgress } = {}) {
    if (!this.session.pdfDocument) {
      throw new Error('No PDF document loaded')
    }

    const tesseractLang = toTesseractLanguageCode(language)
    const pageSession = this.session.pageSessions.get(pageNumber)

    if (pageSession?.hasOcrForLanguage(tesseractLang)) {
      logger.info('Page already OCR processed for language:', { pageNumber, language: tesseractLang })
      return pageSession.ocrBlocks
    }

    const page = await this.session.pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)

    const context = canvas.getContext('2d', { alpha: false })
    if (!context) {
      throw new Error('Canvas 2D context not available')
    }

    try {
      await page.render({
        canvasContext: context,
        viewport,
        intent: 'display'
      }).promise

      if (this._cancelled) return []

      onProgress?.({ pageNumber, status: 'recognizing' })

      const result = await recognizeStructured(canvas, tesseractLang)

      if (this._cancelled) return []

      const blocks = await this._createBlocksFromResult(result, {
        pageNumber,
        language: tesseractLang,
        pageWidth: viewport.width,
        pageHeight: viewport.height
      })

      this.session.setPageOcrBlocks(pageNumber, blocks, tesseractLang)

      logger.info('OCR completed for page:', {
        pageNumber,
        language: tesseractLang,
        blockCount: blocks.length,
        hasStructuredLines: result.lines.length > 0
      })

      return blocks
    } catch (error) {
      logger.error('OCR failed for page:', { pageNumber, error })

      if (pageSession) {
        pageSession.ocrError = error?.message || 'OCR failed'
      }

      throw error
    } finally {
      page.cleanup?.()
      canvas.width = 0
      canvas.height = 0
    }
  }

  async processPages(pageNumbers, { language = 'eng', onProgress, onPageComplete } = {}) {
    this.isProcessing = true
    this._cancelled = false

    const results = []

    try {
      for (let i = 0; i < pageNumbers.length; i++) {
        if (this._cancelled) break

        const pageNumber = pageNumbers[i]
        onProgress?.({ pageNumber, current: i + 1, total: pageNumbers.length })

        try {
          const blocks = await this.processPage(pageNumber, { language })
          results.push({ pageNumber, blocks, success: true })
          onPageComplete?.({ pageNumber, success: true })
        } catch (error) {
          results.push({ pageNumber, blocks: [], success: false, error: error?.message })
          onPageComplete?.({ pageNumber, success: false, error: error?.message })
        }
      }

      return results
    } finally {
      this.isProcessing = false
    }
  }

  cancel() {
    this._cancelled = true
  }

  /**
   * Creates PdfLogicalBlock objects from Tesseract recognition result.
   * Uses structured line data when available (each line gets its own bounding box).
   * Falls back to splitting plain text by newlines with synthetic bounding boxes.
   */
  async _createBlocksFromResult(result, { pageNumber, language, pageWidth, pageHeight }) {
    if (result.lines.length > 0) {
      return this._createBlocksFromLines(result.lines, {
        pageNumber,
        language,
        pageWidth,
        pageHeight
      })
    }

    return this._createBlocksFromPlainText(result.text, {
      pageNumber,
      language,
      pageWidth,
      pageHeight
    })
  }

  async _createBlocksFromLines(tesseractLines, { pageNumber, language, pageWidth, pageHeight }) {
    const blocks = []
    const scaleX = pageWidth / Math.max(...tesseractLines.map((l) => l.bbox?.x1 || pageWidth), 1)
    const scaleY = pageHeight / Math.max(...tesseractLines.map((l) => l.bbox?.y1 || pageHeight), 1)

    for (let i = 0; i < tesseractLines.length; i++) {
      const line = tesseractLines[i]
      const lineText = line.text?.trim()
      if (!lineText) continue

      const bbox = line.bbox || {}
      const block = await createPdfLogicalBlock({
        documentIdentity: this.session.documentIdentity,
        pageNumber,
        role: 'paragraph',
        boundingBox: {
          x: (bbox.x0 || 0) * scaleX,
          y: (bbox.y0 || 0) * scaleY,
          width: ((bbox.x1 || 0) - (bbox.x0 || 0)) * scaleX,
          height: ((bbox.y1 || 0) - (bbox.y0 || 0)) * scaleY
        },
        pageSize: { width: pageWidth, height: pageHeight },
        text: lineText,
        lines: [],
        readingOrderIndex: i,
        roleMetadata: {
          ocrConfidence: (line.confidence || 0) / 100,
          ocrLanguage: language,
          ocrLineIndex: i
        },
        source: 'ocr'
      })

      blocks.push(block)
    }

    return blocks
  }

  /**
   * Fallback: creates blocks from plain OCR text by splitting on newlines.
   * Produces synthetic bounding boxes distributed evenly across the page.
   * Used only when Tesseract structured line data is unavailable.
   */
  async _createBlocksFromPlainText(text, { pageNumber, language, pageWidth, pageHeight }) {
    if (!text || !text.trim()) return []

    const lines = text.split('\n').filter((line) => line.trim().length > 0)

    const blocks = []
    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i].trim()
      if (!lineText) continue

      const block = await createPdfLogicalBlock({
        documentIdentity: this.session.documentIdentity,
        pageNumber,
        role: 'paragraph',
        boundingBox: {
          x: 0,
          y: (i / Math.max(lines.length, 1)) * pageHeight,
          width: pageWidth,
          height: pageHeight / Math.max(lines.length, 1)
        },
        pageSize: { width: pageWidth, height: pageHeight },
        text: lineText,
        lines: [],
        readingOrderIndex: i,
        roleMetadata: {
          ocrConfidence: 1,
          ocrLanguage: language,
          ocrLineIndex: i
        },
        source: 'ocr'
      })

      blocks.push(block)
    }

    return blocks
  }
}
