import ResourceTracker from '@/core/memory/ResourceTracker.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { ensurePdfJsConfigured, getPdfWorkerUrl, loadPdfDocumentFromFile } from './pdfjs.js'
import { PdfTextLayerRenderer } from './PdfTextLayerRenderer.js'
import { PdfPageSession } from './PdfPageSession.js'
import { sha256HexFromArrayBuffer } from './PdfBlockIdentity.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfDocumentSession')
const PAGE_MARGIN = 24
const MIN_SCALE = 0.4
const MAX_SCALE = 2.0

export class PdfDocumentSession extends ResourceTracker {
  constructor() {
    super('pdf-document-session')

    this.loadingTask = null
    this.pdfDocument = null
    this.objectUrl = null
    this.fileName = ''
    this.totalPages = 0
    this.pageMetrics = []
    this.renderTasks = new Map()
    this.pageScale = 1
    this.visiblePageNumbers = new Set()
    this.pageSessions = new Map()
    this.pdfFingerprint = ''
    this.documentIdentity = ''
    this.displayName = ''
    this.translationStates = new Map()
    this.targetedBlockId = null
    this._pendingCleanup = null
  }

  get workerUrl() {
    return getPdfWorkerUrl()
  }

  async openFile(file, viewerWidth) {
    if (!file) throw new Error('No PDF file provided')

    await this.cleanupDocument()
    ensurePdfJsConfigured()

    this.fileName = file.name || 'document.pdf'
    const { document, loadingTask, objectUrl } = await loadPdfDocumentFromFile(file)

    this.loadingTask = loadingTask
    this.pdfDocument = document
    this.objectUrl = objectUrl
    this.totalPages = document.numPages
    this.pdfFingerprint = document.fingerprint || ''
    this.displayName = this.fileName
    this.documentIdentity = await this._resolveDocumentIdentity(file, document)
    this.pageSessions.clear()
    this.translationStates.clear()
    this.targetedBlockId = null

    await this._buildPageMetrics(viewerWidth)

    logger.info('PDF document opened:', {
      fileName: this.fileName,
      totalPages: this.totalPages,
      workerUrl: this.workerUrl
    })

    return this.getState()
  }

  async _resolveDocumentIdentity(file, document) {
    if (document?.fingerprint) {
      return document.fingerprint
    }

    try {
      const fileBytes = await file.arrayBuffer()
      const fileHash = await sha256HexFromArrayBuffer(fileBytes)
      if (fileHash) {
        return fileHash
      }
    } catch (error) {
      logger.warn('Failed to compute PDF file hash for document identity:', error)
    }

    return ''
  }

  async _buildPageMetrics(viewerWidth) {
    const usableWidth = Math.max(320, (viewerWidth || 0) - PAGE_MARGIN * 2)
    const metrics = []

    for (let pageNumber = 1; pageNumber <= this.totalPages; pageNumber += 1) {
      const page = await this.pdfDocument.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, usableWidth / viewport.width))
      const displayViewport = page.getViewport({ scale })

      metrics.push({
        pageNumber,
        width: displayViewport.width,
        height: displayViewport.height,
        naturalWidth: viewport.width,
        naturalHeight: viewport.height,
        scale
      })

      page.cleanup?.()
    }

    this.pageMetrics = metrics
    this.pageScale = metrics[0]?.scale || 1
  }

  async rebuildPageMetrics(viewerWidth) {
    if (!this.pdfDocument) {
      return this.getState()
    }

    this._cancelAllRenders()
    await this._buildPageMetrics(viewerWidth)

    logger.info('PDF page metrics rebuilt:', {
      fileName: this.fileName,
      totalPages: this.totalPages,
      pageScale: this.pageScale
    })

    return this.getState()
  }

  getState() {
    return {
      fileName: this.fileName,
      displayName: this.displayName,
      totalPages: this.totalPages,
      pageMetrics: this.pageMetrics,
      pageScale: this.pageScale,
      workerUrl: this.workerUrl,
      documentIdentity: this.documentIdentity,
      pdfFingerprint: this.pdfFingerprint
    }
  }

  updateVisiblePages(pageNumbers) {
    this.visiblePageNumbers = new Set(pageNumbers)
    this._scheduleCleanup()
  }

  async _getPageSession(pageNumber) {
    if (!this.pdfDocument) return null

    const metric = this.pageMetrics[pageNumber - 1]
    if (!metric) return null

    const existingSession = this.pageSessions.get(pageNumber)
    const pageSession = existingSession || new PdfPageSession({
      documentIdentity: this.documentIdentity,
      pageNumber
    })

    pageSession.updateDocumentIdentity(this.documentIdentity)

    if (pageSession.loaded && pageSession.getLogicalBlocks().length > 0) {
      this.pageSessions.set(pageNumber, pageSession)
      return pageSession
    }

    const page = await this.pdfDocument.getPage(pageNumber)
    await pageSession.hydrate(page, metric)
    this.pageSessions.set(pageNumber, pageSession)
    return pageSession
  }

  async getVisiblePageSessions() {
    if (!this.pdfDocument || this.visiblePageNumbers.size === 0) {
      return []
    }

    const pageNumbers = [...this.visiblePageNumbers].sort((a, b) => a - b)
    const sessions = []

    for (const pageNumber of pageNumbers) {
      const pageSession = await this._getPageSession(pageNumber)
      if (pageSession) {
        sessions.push(pageSession)
      }
    }

    return sessions
  }

  async getVisibleLogicalBlocks() {
    const pageSessions = await this.getVisiblePageSessions()
    return pageSessions.flatMap((pageSession) => pageSession.getLogicalBlocks())
  }

  getBlockTranslationState(blockId) {
    return this.translationStates.get(blockId) || {
      blockId,
      translatedText: '',
      status: 'idle',
      provider: '',
      sourceLanguage: '',
      targetLanguage: '',
      sourceTextHash: '',
      updatedAt: 0,
      error: null
    }
  }

  setBlockTranslationState(blockId, patch = {}) {
    if (!blockId) return null

    const current = this.getBlockTranslationState(blockId)
    const next = {
      ...current,
      ...patch,
      blockId,
      updatedAt: patch.updatedAt || Date.now()
    }

    this.translationStates.set(blockId, next)
    return next
  }

  updateBlockTranslationStates(blockStates = []) {
    const updatedStates = []
    for (const blockState of blockStates) {
      if (!blockState?.blockId) continue
      updatedStates.push(this.setBlockTranslationState(blockState.blockId, blockState))
    }
    return updatedStates
  }

  resetTranslationStates() {
    this.translationStates.clear()
  }

  setTargetedBlock(blockId) {
    this.targetedBlockId = blockId || null
  }

  clearTargetedBlock() {
    this.targetedBlockId = null
  }

  getVisibleTranslationStates() {
    const visibleBlocks = []
    for (const pageSession of this.pageSessions.values()) {
      visibleBlocks.push(...pageSession.getLogicalBlocks())
    }

    return visibleBlocks.map((block) => ({
      ...block,
      translationState: this.getBlockTranslationState(block.id)
    }))
  }

  async renderPage(pageNumber, canvasEl, textLayerRenderer) {
    if (!this.pdfDocument || !canvasEl) return false

    const metric = this.pageMetrics[pageNumber - 1]
    if (!metric) return false

    const previous = this.renderTasks.get(pageNumber)
    previous?.cancel?.()

    const page = await this.pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: metric.scale })

    canvasEl.width = Math.floor(viewport.width)
    canvasEl.height = Math.floor(viewport.height)
    canvasEl.style.width = `${Math.floor(viewport.width)}px`
    canvasEl.style.height = `${Math.floor(viewport.height)}px`

    const context = canvasEl.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!context) {
      throw new Error('Canvas 2D context not available')
    }

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      intent: 'display'
    })

    this.renderTasks.set(pageNumber, renderTask)

    try {
      await renderTask.promise
      if (textLayerRenderer instanceof PdfTextLayerRenderer) {
        const cw = Math.floor(viewport.width)
        const ch = Math.floor(viewport.height)
        await textLayerRenderer.render(page, viewport, cw, ch)
      }
      return true
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') {
        logger.warn(`Failed to render page ${pageNumber}:`, error)
      }
      return false
    } finally {
      if (this.renderTasks.get(pageNumber) === renderTask) {
        this.renderTasks.delete(pageNumber)
      }
      page.cleanup?.()
    }
  }

  clearPage(pageNumber, canvasEl, textLayerRenderer) {
    this.renderTasks.get(pageNumber)?.cancel?.()
    this.renderTasks.delete(pageNumber)

    if (canvasEl) {
      const context = canvasEl.getContext('2d')
      context?.clearRect(0, 0, canvasEl.width, canvasEl.height)
      canvasEl.width = 0
      canvasEl.height = 0
    }

    if (textLayerRenderer instanceof PdfTextLayerRenderer) {
      textLayerRenderer.clear()
    }
  }

  _cancelAllRenders() {
    for (const renderTask of this.renderTasks.values()) {
      renderTask.cancel?.()
    }
    this.renderTasks.clear()
  }

  _scheduleCleanup() {
    if (this._pendingCleanup) {
      clearTimeout(this._pendingCleanup)
    }

    this._pendingCleanup = this.trackTimeout(() => {
      this._pendingCleanup = null
      for (const [pageNumber, renderTask] of this.renderTasks.entries()) {
        if (!this.visiblePageNumbers.has(pageNumber)) {
          renderTask.cancel?.()
        }
      }
    }, 200)
  }

  async cleanupDocument() {
    if (this._pendingCleanup) {
      this.clearTimeout(this._pendingCleanup)
      this._pendingCleanup = null
    }

    this._cancelAllRenders()
    this.visiblePageNumbers.clear()
    this.pageSessions.clear()
    this.translationStates.clear()
    this.targetedBlockId = null
    this.pdfFingerprint = ''
    this.documentIdentity = ''
    this.displayName = ''

    try {
      await this.loadingTask?.destroy?.()
    } catch (error) {
      logger.warn('Failed to destroy PDF loading task:', error)
    }

    try {
      await this.pdfDocument?.destroy?.()
    } catch (error) {
      logger.warn('Failed to destroy PDF document:', error)
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }

    this.loadingTask = null
    this.pdfDocument = null
    this.totalPages = 0
    this.pageMetrics = []
    this.fileName = ''
  }

  async destroy() {
    await this.cleanupDocument()
    super.destroy()
  }
}

export const pdfDocumentSession = new PdfDocumentSession()
