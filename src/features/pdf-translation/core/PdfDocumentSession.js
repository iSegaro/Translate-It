import ResourceTracker from '@/core/memory/ResourceTracker.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { ensurePdfJsConfigured, getPdfWorkerUrl, loadPdfDocumentFromFile } from './pdfjs.js'
import { PdfTextLayerRenderer } from './PdfTextLayerRenderer.js'

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

    await this._buildPageMetrics(viewerWidth)

    logger.info('PDF document opened:', {
      fileName: this.fileName,
      totalPages: this.totalPages,
      workerUrl: this.workerUrl
    })

    return this.getState()
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
      totalPages: this.totalPages,
      pageMetrics: this.pageMetrics,
      pageScale: this.pageScale,
      workerUrl: this.workerUrl
    }
  }

  updateVisiblePages(pageNumbers) {
    this.visiblePageNumbers = new Set(pageNumbers)
    this._scheduleCleanup()
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

    const context = canvasEl.getContext('2d', { alpha: false })
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
        await textLayerRenderer.render(page, viewport)
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
      this.clearTimeout(this._pendingCleanup)
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
