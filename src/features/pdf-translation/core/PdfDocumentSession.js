import ResourceTracker from '@/core/memory/ResourceTracker.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { ensurePdfJsConfigured, getPdfWorkerUrl, loadPdfDocumentFromFile } from './pdfjs.js'
import { PdfRenderer, PDF_RENDER_RESULT_STATUS, createPdfRenderResult } from './PdfRenderer.js'
import { PdfBitmapCache } from './PdfBitmapCache.js'
import { sha256HexFromArrayBuffer } from './PdfBlockIdentity.js'
import { PdfDestinationResolver } from './PdfDestinationResolver.js'
import { PdfOutlineRepository } from './PdfOutlineRepository.js'
import { PdfLinkAnnotationRepository } from './PdfLinkAnnotationRepository.js'
import { PdfPageContentRepository } from './PdfPageContentRepository.js'
import { PdfTranslationState } from './PdfTranslationState.js'
import { PDF_PAGE_BACKGROUND } from './pdfRenderingConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfDocumentSession')
const PAGE_MARGIN = 24
const MIN_SCALE = 0.4
const MAX_SCALE = 2.0

function normalizeLayoutRequest(layoutRequest = null) {
  if (typeof layoutRequest === 'number') {
    return {
      width: Number(layoutRequest) || 0,
      height: 0,
      availableCanvasWidth: 0,
      availableCanvasHeight: 0,
      zoomMode: 'fit-width',
      zoomPercent: 100
    }
  }

  return {
    width: Number(layoutRequest?.width) || 0,
    height: Number(layoutRequest?.height) || 0,
    availableCanvasWidth: Number(layoutRequest?.availableCanvasWidth) || 0,
    availableCanvasHeight: Number(layoutRequest?.availableCanvasHeight) || 0,
    zoomMode: layoutRequest?.zoomMode || 'fit-width',
    zoomPercent: Number(layoutRequest?.zoomPercent) || 100
  }
}

export class PdfDocumentSession extends ResourceTracker {
  constructor() {
    super('pdf-document-session')

    this.loadingTask = null
    this.pdfDocument = null
    this.objectUrl = null
    this.fileName = ''
    this.totalPages = 0
    this.pageMetrics = []
    this.pageScale = 1
    this.visiblePageNumbers = new Set()
    this.pdfFingerprint = ''
    this.documentIdentity = ''
    this.displayName = ''
    this._renderer = new PdfRenderer()
    this._bitmapCache = new PdfBitmapCache()
    this._resolver = new PdfDestinationResolver()
    this._outlineRepository = new PdfOutlineRepository()
    this._linkAnnotationRepository = new PdfLinkAnnotationRepository()
    this._pageContentRepository = new PdfPageContentRepository()
    this._translationState = new PdfTranslationState()
    this._naturalPageViewports = new Map()
  }

  get pageSessions() {
    return this._pageContentRepository.pageSessions
  }

  get _pendingHydrations() {
    return this._pageContentRepository.pendingHydrations
  }

  get _blockIndex() {
    return this._pageContentRepository.blockIndex
  }

  get translationStates() {
    return this._translationState.map
  }

  set translationStates(nextMap) {
    this._translationState.map = nextMap
  }

  get workerUrl() {
    return getPdfWorkerUrl()
  }

  async openFile(file, layoutRequest) {
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
    this._pageContentRepository.reset()
    this.resetTranslationStates()
    this._resolver.clearCaches()
    this._outlineRepository.clear()
    this._linkAnnotationRepository.clear()
    await this._buildPageMetrics(layoutRequest)

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

  async _resolveDisplayViewport(naturalViewport, pageNumber, scale) {
    if (typeof naturalViewport.clone === 'function') {
      return naturalViewport.clone({ scale })
    }

    const page = await this.pdfDocument.getPage(pageNumber)
    const displayViewport = page.getViewport({ scale })
    page.cleanup?.()
    return displayViewport
  }

  async _buildPageMetrics(layoutRequest) {
    const {
      width: viewerWidth,
      height: viewerHeight,
      availableCanvasWidth,
      availableCanvasHeight,
      zoomMode,
      zoomPercent
    } = normalizeLayoutRequest(layoutRequest)

    const usableWidth = availableCanvasWidth > 0
      ? availableCanvasWidth
      : Math.max(320, viewerWidth - PAGE_MARGIN * 2)
    const usableHeight = availableCanvasHeight > 0
      ? availableCanvasHeight
      : Math.max(0, viewerHeight - PAGE_MARGIN * 2)
    const BATCH_SIZE = 8
    const metrics = []

    for (let start = 1; start <= this.totalPages; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, this.totalPages)
      const batch = []

      for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
        if (!this._naturalPageViewports.has(pageNumber)) {
          batch.push(
            this.pdfDocument.getPage(pageNumber).then(page => {
              const viewport = page.getViewport({ scale: 1 })
              this._naturalPageViewports.set(pageNumber, viewport)
              page.cleanup?.()
            })
          )
        }
      }

      if (batch.length > 0) {
        await Promise.all(batch)
      }
    }

    for (let pageNumber = 1; pageNumber <= this.totalPages; pageNumber += 1) {
      const naturalViewport = this._naturalPageViewports.get(pageNumber)
      if (!naturalViewport) continue

      const widthScale = usableWidth / naturalViewport.width
      const heightScale = usableHeight > 0 ? usableHeight / naturalViewport.height : widthScale
      const percentScale = zoomPercent / 100

      let scale = widthScale
      if (zoomMode === 'fit-page') {
        scale = Math.min(widthScale, heightScale)
      } else if (zoomMode === 'percent') {
        scale = percentScale
      }

      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

      const displayViewport = await this._resolveDisplayViewport(naturalViewport, pageNumber, scale)

      metrics.push({
        pageNumber,
        width: displayViewport.width,
        height: displayViewport.height,
        naturalWidth: naturalViewport.width,
        naturalHeight: naturalViewport.height,
        scale,
        viewport: displayViewport
      })
    }

    this.pageMetrics = metrics
    this.pageScale = metrics[0]?.scale || 1
  }

  async rebuildPageMetrics(layoutRequest) {
    if (!this.pdfDocument) {
      return this.getState()
    }

    this._renderer.cancelAll()
    this._bitmapCache.clear()
    await this._buildPageMetrics(layoutRequest)

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
  }

  async getPageSession(pageNumber) {
    return this._pageContentRepository.getPageSession({
      pdfDocument: this.pdfDocument,
      pageMetrics: this.pageMetrics,
      documentIdentity: this.documentIdentity,
      pageNumber
    })
  }

  async getVisiblePageSessions() {
    return this._pageContentRepository.getVisiblePageSessions({
      pdfDocument: this.pdfDocument,
      pageMetrics: this.pageMetrics,
      documentIdentity: this.documentIdentity,
      visiblePageNumbers: this.visiblePageNumbers
    })
  }

  async getVisibleLogicalBlocks() {
    return this._pageContentRepository.getVisibleLogicalBlocks({
      pdfDocument: this.pdfDocument,
      pageMetrics: this.pageMetrics,
      documentIdentity: this.documentIdentity,
      visiblePageNumbers: this.visiblePageNumbers
    })
  }

  getBlockTranslationState(blockId) {
    return this._translationState.getBlockTranslationState(blockId)
  }

  setBlockTranslationState(blockId, patch = {}) {
    return this._translationState.setBlockTranslationState(blockId, patch)
  }

  updateBlockTranslationStates(blockStates = []) {
    return this._translationState.updateBlockTranslationStates(blockStates)
  }

  resetTranslationStates() {
    this._translationState.resetTranslationStates()
  }

  getVisibleTranslationStates() {
    const visibleBlocks = []
    for (const pageNumber of this.visiblePageNumbers) {
      const pageSession = this.pageSessions.get(pageNumber)
      if (!pageSession) continue
      visibleBlocks.push(...pageSession.getLogicalBlocks())
    }

    return visibleBlocks.map((block) => ({
      ...block,
      translationState: this.getBlockTranslationState(block.id)
    }))
  }

  _indexPageSession(pageSession) {
    this._pageContentRepository._indexPageSession(pageSession)
  }

  setPageOcrBlocks(pageNumber, blocks, language) {
    this._pageContentRepository.setPageOcrBlocks(pageNumber, blocks, language)
  }

  /**
   * Find a source block by ID.
   *
   * Pure O(1) lookup against the canonical _blockIndex.
   * Relies on callers maintaining the invariant.
   *
   * @param {string} blockId
   * @returns {object|null}
   */
  findSourceBlock(blockId) {
    return this._pageContentRepository.findSourceBlock(blockId)
  }

  // ── Destination Resolution ─────────────────────────────────

  /**
   * Resolve a PDF destination into a NavigationTarget.
   *
   * Accepts:
   *   - string:   Named destination (e.g., 'chapter1')
   *   - Array:    Explicit destination array (e.g., [pageRef, 'XYZ', top, left, zoom])
   *   - number:   Direct page number (1-based)
   *
   * @param {string|Array|number|null} dest - The destination to resolve
   * @returns {Promise<object|null>} NavigationTarget or null when resolution fails
   */
  resolveDestination(dest) {
    return this._resolver.resolveDestination({
      pdfDocument: this.pdfDocument,
      totalPages: this.totalPages,
      destination: dest
    })
  }

  // ── Outline Loading ────────────────────────────────────────

  /**
   * Load the PDF outline (bookmarks) tree.
   *
   * Uses pdfDocument.getOutline() and normalizes the result
   * via createOutlineNode(). The outline is cached — subsequent
   * calls return the cached value without re-fetching.
   *
   * @returns {Promise<Array<object>|null>} Normalized outline tree, or null if none
   */
  async loadOutline() {
    return this._outlineRepository.load({ pdfDocument: this.pdfDocument })
  }

  /**
   * Get the cached outline tree.
   *
   * Returns null if outline has not been loaded yet.
   * Does not trigger loading — use loadOutline() first.
   *
   * @returns {Array<object>|null} Cached outline, or null if not loaded
   */
  getOutline() {
    return this._outlineRepository.get()
  }

  // ── Viewport ────────────────────────────────────────────────

  /**
   * Get the viewport for a specific page.
   *
   * Returns the cached viewport from page metrics, which was created
   * during layout computation using the page's display scale.
   *
   * @param {number} pageNumber - 1-based page number
   * @returns {object|null} The pdf.js viewport object, or null if unavailable
   */
  getPageViewport(pageNumber) {
    const metric = this.pageMetrics[pageNumber - 1]
    return metric?.viewport || null
  }

  // ── Link Annotations ──────────────────────────────────────

  /**
   * Get link annotations for a specific page.
   *
   * Fetches annotations via pdfPage.getAnnotations(), filters for
   * LINK type, and normalizes them via createLinkAnnotation().
   * Results are cached per page.
   *
   * @param {number} pageNumber - 1-based page number
   * @returns {Promise<Array<object>>} Array of normalized link annotations
   */
  async getLinkAnnotations(pageNumber) {
    const metric = this.pageMetrics[pageNumber - 1]
    return this._linkAnnotationRepository.getAnnotations({
      pdfDocument: this.pdfDocument,
      metric,
      pageNumber
    })
  }

  async renderPage(pageNumber, canvasEl, textLayerRenderer) {
    const metric = this.pageMetrics[pageNumber - 1]
    if (!metric) return createPdfRenderResult(PDF_RENDER_RESULT_STATUS.FAILED)

    const cacheKey = PdfBitmapCache.buildKey(this.documentIdentity, pageNumber, metric.scale)

    // Cache hit: draw bitmap and render text layer without pdf.js render
    const cachedBitmap = this._bitmapCache.get(cacheKey)
    if (cachedBitmap) {
      canvasEl.width = cachedBitmap.width
      canvasEl.height = cachedBitmap.height
      canvasEl.style.width = `${cachedBitmap.width}px`
      canvasEl.style.height = `${cachedBitmap.height}px`
      const ctx = canvasEl.getContext('2d', { alpha: false })
      ctx.fillStyle = PDF_PAGE_BACKGROUND
      ctx.fillRect(0, 0, cachedBitmap.width, cachedBitmap.height)
      ctx.drawImage(cachedBitmap, 0, 0)

      // Render text layer without pdf.js page retrieval
      if (textLayerRenderer) {
        try {
          const pageSession = this.pageSessions.get(pageNumber) || null
          const cw = Math.floor(cachedBitmap.width)
          const ch = Math.floor(cachedBitmap.height)
          const textContent = pageSession?.textContent ?? null
          await textLayerRenderer.render({
            pageNumber,
            viewport: metric.viewport,
            containerWidth: cw,
            containerHeight: ch,
            textContent
          })
        } catch {
          // Text layer render failed — canvas is still valid
        }
      }

      return createPdfRenderResult(PDF_RENDER_RESULT_STATUS.SUCCESS)
    }

    // Cache miss: render via PdfRenderer
    const pageSession = this.pageSessions.get(pageNumber) || null
    const result = await this._renderer.renderPage({
      pdfDocument: this.pdfDocument,
      metric,
      pageNumber,
      canvas: canvasEl,
      textLayerRenderer,
      pageSession
    })

    // Cache bitmap only on successful render
    if (result.status === PDF_RENDER_RESULT_STATUS.SUCCESS && result.bitmap) {
      this._bitmapCache.set(cacheKey, result.bitmap, {
        width: result.bitmap.width,
        height: result.bitmap.height
      })
    }

    return result
  }

  cancelRenderPage(pageNumber, canvasEl) {
    return this._renderer.cancelRender(pageNumber, canvasEl)
  }

  clearPage(pageNumber, canvasEl, textLayerRenderer) {
    this._renderer.clearPage(pageNumber, canvasEl, textLayerRenderer)
  }

  _cancelAllRenders() {
    this._renderer.cancelAll()
  }

  async cleanupDocument() {
    this._cancelAllRenders()
    this.visiblePageNumbers.clear()
    this._pageContentRepository.reset()
    this.resetTranslationStates()
    this._resolver.clearCaches()
    this._outlineRepository.clear()
    this._linkAnnotationRepository.clear()
    this._naturalPageViewports.clear()
    this._bitmapCache.clear()
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
    this._bitmapCache.clear()
    this._renderer.destroy()
    super.destroy()
  }
}

export const pdfDocumentSession = new PdfDocumentSession()
