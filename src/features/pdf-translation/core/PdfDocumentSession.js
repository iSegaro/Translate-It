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
import { pdfCacheManager } from './PdfCacheManager.js'
import { PDF_PAGE_BACKGROUND } from './pdfRenderingConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfDocumentSession')
const PAGE_MARGIN = 24
const MIN_SCALE = 0.4
const MAX_SCALE = 2.0

function normalizePageNumberSet(pageNumbers = []) {
  const normalized = new Set()

  if (!pageNumbers || typeof pageNumbers[Symbol.iterator] !== 'function') {
    return normalized
  }

  for (const value of pageNumbers) {
    const pageNumber = Number(value)
    if (Number.isInteger(pageNumber) && pageNumber > 0) {
      normalized.add(pageNumber)
    }
  }

  return normalized
}

function arePageSetsEqual(first, second) {
  if (first.size !== second.size) return false
  for (const pageNumber of first) {
    if (!second.has(pageNumber)) return false
  }
  return true
}

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
    this.visiblePageNumbers = new Set()
    this.pdfFingerprint = ''
    this.documentIdentity = ''
    this.displayName = ''
    this._renderer = new PdfRenderer()
    this._bitmapCache = new PdfBitmapCache()
    this._resolver = new PdfDestinationResolver()
    this._outlineRepository = new PdfOutlineRepository()
    this._linkAnnotationRepository = new PdfLinkAnnotationRepository()
    this._pageSessionCommittedListeners = new Set()
    this._visiblePagesChangedListeners = new Set()
    this._pageContentRepository = new PdfPageContentRepository({
      onPageSessionCommitted: (pageSession) => this._notifyPageSessionCommitted(pageSession),
      restorePersistedPageData: (pageSession, generation) => this._restorePersistedPageData(pageSession, generation)
    })
    this._translationState = new PdfTranslationState()
    this._naturalPageViewports = new Map()
    this._documentGeneration = 0
    this._documentCacheGeneration = 0
    this._documentCachePromise = Promise.resolve({ translations: {}, ocr: {} })
    this._documentCacheSnapshot = { translations: {}, ocr: {} }
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

  get documentGeneration() {
    return this._documentGeneration
  }

  _advanceDocumentGeneration() {
    this._documentGeneration += 1
    return this._documentGeneration
  }

  _isDocumentGenerationCurrent = (generation) => generation === this._documentGeneration

  _emptyDocumentCache() {
    return { translations: {}, ocr: {} }
  }

  _startDocumentCacheLoad(documentIdentity, generation = this._documentGeneration) {
    const emptyCache = this._emptyDocumentCache()
    this._documentCacheGeneration = generation
    this._documentCacheSnapshot = emptyCache

    if (!documentIdentity) {
      this._documentCachePromise = Promise.resolve(emptyCache)
      return this._documentCachePromise
    }

    this._documentCachePromise = pdfCacheManager.loadDocument(documentIdentity)
      .then((cache) => {
        if (!this._isDocumentGenerationCurrent(generation)) {
          return emptyCache
        }

        const snapshot = {
          translations: cache?.translations || {},
          ocr: cache?.ocr || {}
        }
        this._documentCacheSnapshot = snapshot
        return snapshot
      })
      .catch((error) => {
        if (this._isDocumentGenerationCurrent(generation)) {
          logger.warn('Failed to load PDF document cache:', error)
        }
        return emptyCache
      })

    return this._documentCachePromise
  }

  async _getDocumentCacheSnapshot(generation) {
    if (generation !== this._documentCacheGeneration) {
      return this._emptyDocumentCache()
    }

    const cache = await this._documentCachePromise
    if (!this._isDocumentGenerationCurrent(generation)) {
      return this._emptyDocumentCache()
    }

    return cache || this._emptyDocumentCache()
  }

  async getDocumentCacheSnapshot() {
    return this._getDocumentCacheSnapshot(this._documentGeneration)
  }

  _isCachedOcrEntryValid(entry) {
    return !!entry &&
      typeof entry === 'object' &&
      Array.isArray(entry.ocrBlocks) &&
      typeof entry.ocrLanguage === 'string' &&
      entry.ocrLanguage.length > 0
  }

  async _restorePersistedPageData(pageSession, generation) {
    if (!pageSession || !this._isDocumentGenerationCurrent(generation)) return

    try {
      const cache = await this._getDocumentCacheSnapshot(generation)
      if (!this._isDocumentGenerationCurrent(generation)) return

      const ocrEntry = cache.ocr?.[pageSession.pageNumber]
      if (!ocrEntry) return

      if (!this._isCachedOcrEntryValid(ocrEntry)) {
        logger.warn('Skipped invalid cached OCR entry:', { pageNumber: pageSession.pageNumber })
        return
      }

      if (pageSession.hasOcrForLanguage(ocrEntry.ocrLanguage)) return

      pageSession.setOcrBlocks(ocrEntry.ocrBlocks, ocrEntry.ocrLanguage)
      if (Number.isFinite(Number(ocrEntry.ocrCompletedAt))) {
        pageSession.ocrCompletedAt = Number(ocrEntry.ocrCompletedAt)
      }
    } catch (error) {
      if (this._isDocumentGenerationCurrent(generation)) {
        logger.warn('Failed to restore persisted page data:', { pageNumber: pageSession.pageNumber, error })
      }
    }
  }

  onPageSessionCommitted(listener) {
    if (typeof listener !== 'function') {
      return () => {}
    }

    this._pageSessionCommittedListeners.add(listener)
    return () => {
      this._pageSessionCommittedListeners.delete(listener)
    }
  }

  _notifyPageSessionCommitted(pageSession) {
    if (!pageSession) return

    const event = {
      pageNumber: pageSession.pageNumber
    }

    for (const listener of this._pageSessionCommittedListeners) {
      try {
        listener(event)
      } catch (error) {
        logger.warn('Page session commit listener failed:', { pageNumber: event.pageNumber, error })
      }
    }
  }

  onVisiblePagesChanged(listener) {
    if (typeof listener !== 'function') {
      return () => {}
    }

    this._visiblePagesChangedListeners.add(listener)
    return () => {
      this._visiblePagesChangedListeners.delete(listener)
    }
  }

  _notifyVisiblePagesChanged() {
    const event = {
      pages: [...this.visiblePageNumbers].sort((a, b) => a - b)
    }

    for (const listener of this._visiblePagesChangedListeners) {
      try {
        listener(event)
      } catch (error) {
        logger.warn('Visible pages listener failed:', { pages: event.pages, error })
      }
    }
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
    this._startDocumentCacheLoad(this.documentIdentity, this._documentGeneration)
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
      workerUrl: this.workerUrl,
      documentIdentity: this.documentIdentity,
      pdfFingerprint: this.pdfFingerprint
    }
  }

  updateVisiblePages(pageNumbers) {
    const nextVisible = normalizePageNumberSet(pageNumbers)
    if (arePageSetsEqual(this.visiblePageNumbers, nextVisible)) return

    const newlyVisible = [...nextVisible].filter((pageNumber) => !this.visiblePageNumbers.has(pageNumber))
    this.visiblePageNumbers = nextVisible
    this._notifyVisiblePagesChanged()

    if (newlyVisible.length > 0) {
      this._hydrateVisiblePagesInBackground(newlyVisible)
    }
  }

  _createHydrationContext() {
    return {
      pdfDocument: this.pdfDocument,
      pageMetrics: this.pageMetrics,
      documentIdentity: this.documentIdentity,
      documentGeneration: this._documentGeneration,
      isDocumentGenerationCurrent: this._isDocumentGenerationCurrent
    }
  }

  _hydrateVisiblePagesInBackground(pageNumbers) {
    const context = this._createHydrationContext()

    for (const pageNumber of pageNumbers) {
      this._pageContentRepository.getPageSession({
        ...context,
        pageNumber
      }).catch((error) => {
        if (this._isDocumentGenerationCurrent(context.documentGeneration)) {
          logger.warn('Failed to hydrate visible page session:', { pageNumber, error })
        }
      })
    }
  }

  async getPageSession(pageNumber) {
    return this._pageContentRepository.getPageSession({
      ...this._createHydrationContext(),
      pageNumber
    })
  }

  async getVisiblePageSessions() {
    return this._pageContentRepository.getVisiblePageSessions({
      ...this._createHydrationContext(),
      visiblePageNumbers: this.visiblePageNumbers
    })
  }

  async getVisibleLogicalBlocks() {
    return this._pageContentRepository.getVisibleLogicalBlocks({
      ...this._createHydrationContext(),
      visiblePageNumbers: this.visiblePageNumbers
    })
  }

  getBlockTranslationState(blockId) {
    return this._translationState.getBlockTranslationState(blockId)
  }

  forEachCommittedPage(callback) {
    if (typeof callback !== 'function') return

    const pageNumbers = [...this.pageSessions.keys()].sort((a, b) => a - b)
    for (const pageNumber of pageNumbers) {
      callback(pageNumber)
    }
  }

  getPageSourceBlocks(pageNumber) {
    const normalizedPageNumber = Number(pageNumber)
    if (!Number.isInteger(normalizedPageNumber) || normalizedPageNumber <= 0) return []

    return this.pageSessions.get(normalizedPageNumber)?.getLogicalBlocks?.() || []
  }

  getLoadedVisiblePageSessions() {
    const pageSessions = []

    for (const pageNumber of this.visiblePageNumbers) {
      const pageSession = this.pageSessions.get(pageNumber)
      if (!pageSession?.loaded) continue
      pageSessions.push(pageSession)
    }

    return pageSessions
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
    this._advanceDocumentGeneration()
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
    this._documentCacheGeneration = this._documentGeneration
    this._documentCacheSnapshot = this._emptyDocumentCache()
    this._documentCachePromise = Promise.resolve(this._documentCacheSnapshot)

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
    this._pageSessionCommittedListeners.clear()
    this._visiblePagesChangedListeners.clear()
    this._bitmapCache.clear()
    this._renderer.destroy()
    super.destroy()
  }
}

export const pdfDocumentSession = new PdfDocumentSession()
