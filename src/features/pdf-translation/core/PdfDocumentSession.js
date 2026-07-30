import ResourceTracker from '@/core/memory/ResourceTracker.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { ensurePdfJsConfigured, getPdfWorkerUrl, loadPdfDocumentFromBuffer } from './pdfjs.js'
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
import { PAGE_CONTENT_SOURCE } from './PdfPageSession.js'
import { resolvePdfCanvasSlot } from '@/apps/pdf/utils/pdfFitPageFootprint.js'
import { isCompatibleCachedOcrEntry } from './PdfOcrCompatibility.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfDocumentSession')
const MIN_SCALE = 0.4
const PERCENT_MAX_SCALE = 4.0
const FIT_PAGE_MAX_SCALE = 2.0
// Fit Width is a layout policy, not a user zoom policy.
// It intentionally remains uncapped so the page can fill the available pane.
// Resource limits (bitmap size, memory, cache) are not enforced by this policy.
const FIT_WIDTH_MAX_SCALE = Number.POSITIVE_INFINITY

function createEmptyDocumentMetadata() {
  return {
    title: '',
    author: '',
    subject: '',
    keywords: '',
    creator: '',
    producer: '',
    creationDate: '',
    modificationDate: '',
    pdfVersion: '',
  }
}

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

function cloneTranslationPersistenceValue(value) {
  if (value == null) return value

  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value))
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
    this.documentMetadata = createEmptyDocumentMetadata()
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
    this._documentCacheSnapshotEpoch = 0
    this._documentCachePromise = Promise.resolve({ ocr: {} })
    this._documentCacheSnapshot = { ocr: {} }
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
    return { ocr: {} }
  }

  invalidateDocumentCacheSnapshot(generation = this._documentGeneration) {
    const emptyCache = this._emptyDocumentCache()
    this._documentCacheSnapshotEpoch += 1
    this._documentCacheGeneration = generation
    this._documentCacheSnapshot = emptyCache
    this._documentCachePromise = Promise.resolve(emptyCache)
    return emptyCache
  }

  _startDocumentCacheLoad(documentIdentity, generation = this._documentGeneration) {
    const emptyCache = this.invalidateDocumentCacheSnapshot(generation)
    const snapshotEpoch = this._documentCacheSnapshotEpoch

    if (!documentIdentity) {
      return this._documentCachePromise
    }

    this._documentCachePromise = pdfCacheManager.loadDocument(documentIdentity)
      .then((cache) => {
        if (!this._isDocumentGenerationCurrent(generation) || snapshotEpoch !== this._documentCacheSnapshotEpoch) {
          return emptyCache
        }

        const snapshot = {
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
    const snapshotEpoch = this._documentCacheSnapshotEpoch
    if (generation !== this._documentCacheGeneration) {
      return this._emptyDocumentCache()
    }

    const cache = await this._documentCachePromise
    if (!this._isDocumentGenerationCurrent(generation) || snapshotEpoch !== this._documentCacheSnapshotEpoch) {
      return this._emptyDocumentCache()
    }

    return cache || this._emptyDocumentCache()
  }

  async getDocumentCacheSnapshot() {
    return this._getDocumentCacheSnapshot(this._documentGeneration)
  }

  async _restorePersistedPageData(pageSession, generation) {
    if (!pageSession || !this._isDocumentGenerationCurrent(generation)) return

    try {
      const cache = await this._getDocumentCacheSnapshot(generation)
      if (!this._isDocumentGenerationCurrent(generation)) return

      const ocrEntry = cache.ocr?.[pageSession.pageNumber]
      if (!ocrEntry) return

      if (!isCompatibleCachedOcrEntry(ocrEntry)) {
        logger.warn('Skipped invalid cached OCR entry:', { pageNumber: pageSession.pageNumber })
        return
      }

      if (pageSession.hasOcrForLanguage(ocrEntry.ocrLanguage)) return

      const ocrCompletedAt = Number(ocrEntry.ocrCompletedAt)
      pageSession.setOcrBlocks(
        ocrEntry.ocrBlocks,
        ocrEntry.ocrLanguage,
        Number.isFinite(ocrCompletedAt) ? ocrCompletedAt : undefined
      )
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

  async openFile({ name, buffer }, layoutRequest) {
    if (!buffer) throw new Error('No PDF buffer provided')

    await this.cleanupDocument()
    ensurePdfJsConfigured()

    this.fileName = name || 'document.pdf'
    const { document, loadingTask, objectUrl } = await loadPdfDocumentFromBuffer({ buffer })

    this.loadingTask = loadingTask
    this.pdfDocument = document
    this.objectUrl = objectUrl
    this.totalPages = document.numPages
    this.pdfFingerprint = document.fingerprint || ''
    try {
      const { info } = await this.pdfDocument.getMetadata()
      this.displayName = (info?.Title || '').trim() || this.fileName
      this.documentMetadata = {
        title: info?.Title || '',
        author: info?.Author || '',
        subject: info?.Subject || '',
        keywords: info?.Keywords || '',
        creator: info?.Creator || '',
        producer: info?.Producer || '',
        creationDate: info?.CreationDate || '',
        modificationDate: info?.ModDate || '',
        pdfVersion: info?.PDFFormatVersion || '',
      }
    } catch (error) {
      logger.debug('Failed to read PDF metadata', error)
      this.displayName = this.fileName
    }
    this.documentIdentity = await this._resolveDocumentIdentity(buffer, document)
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

  async _resolveDocumentIdentity(buffer, document) {
    if (document?.fingerprint) {
      return document.fingerprint
    }

    try {
      const fileHash = await sha256HexFromArrayBuffer(buffer)
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

    const fallbackFootprint = availableCanvasWidth > 0 && availableCanvasHeight > 0
      ? null
      : resolvePdfCanvasSlot({ width: viewerWidth, height: viewerHeight })
    const usableWidth = availableCanvasWidth > 0 ? availableCanvasWidth : fallbackFootprint.availableCanvasWidth
    const usableHeight = availableCanvasHeight > 0
      ? availableCanvasHeight
      : fallbackFootprint.availableCanvasHeight
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

      let maxScale = PERCENT_MAX_SCALE
      if (zoomMode === 'fit-page') {
        maxScale = FIT_PAGE_MAX_SCALE
      } else if (zoomMode === 'fit-width') {
        maxScale = FIT_WIDTH_MAX_SCALE
      }
      scale = Math.min(maxScale, Math.max(MIN_SCALE, scale))

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
    this.clearRenderedPageCache()
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

    this.visiblePageNumbers = nextVisible
    this._notifyVisiblePagesChanged()
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

  _hydrateRenderedPageInBackground(pageNumber) {
    const context = this._createHydrationContext()

    this._pageContentRepository.getPageSession({
      ...context,
      pageNumber
    }).catch((error) => {
      if (this._isDocumentGenerationCurrent(context.documentGeneration)) {
        logger.warn('Failed to hydrate rendered page session:', { pageNumber, error })
      }
    })
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

  hasAnyTranslatedBlocks() {
    return this._translationState.hasAnyTranslated()
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

  getPageContentSource(pageNumber) {
    const normalizedPageNumber = Number(pageNumber)
    if (!Number.isInteger(normalizedPageNumber) || normalizedPageNumber <= 0) return PAGE_CONTENT_SOURCE.NONE

    return this.pageSessions.get(normalizedPageNumber)?.getPageContentSource?.() || PAGE_CONTENT_SOURCE.NONE
  }

  getCommittedTextContent(pageNumber) {
    const normalizedPageNumber = Number(pageNumber)
    if (!Number.isInteger(normalizedPageNumber) || normalizedPageNumber <= 0) return null

    const pageSession = this.pageSessions.get(normalizedPageNumber)
    return pageSession?.loaded ? pageSession.textContent ?? null : null
  }

  getCommittedOcrState(pageNumber) {
    const normalizedPageNumber = Number(pageNumber)
    if (!Number.isInteger(normalizedPageNumber) || normalizedPageNumber <= 0) return null

    const pageSession = this.pageSessions.get(normalizedPageNumber)
    if (!pageSession?.loaded) return null

    return pageSession.getCommittedOcrState()
  }

  getLoadedVisibleOcrCandidates() {
    const candidates = []

    for (const pageNumber of [...this.visiblePageNumbers].sort((a, b) => a - b)) {
      const pageSession = this.pageSessions.get(pageNumber)
      if (!pageSession?.loaded) continue

      const textItems = pageSession.textContent?.items || []
      let textCharCount = 0
      for (const item of textItems) {
        textCharCount += (item?.str || '').replace(/\s/g, '').length
      }

      candidates.push({
        pageNumber,
        logicalBlockCount: pageSession.logicalBlocks.length,
        textItemCount: textItems.length,
        textCharCount,
        hasOcrBlocks: pageSession.ocrBlocks.length > 0,
        ocrLanguage: pageSession.ocrLanguage || null
      })
    }

    return candidates
  }

  recordPageOcrError(pageNumber, error) {
    const normalizedPageNumber = Number(pageNumber)
    if (!Number.isInteger(normalizedPageNumber) || normalizedPageNumber <= 0) return false

    const pageSession = this.pageSessions.get(normalizedPageNumber)
    if (!pageSession?.loaded) return false

    pageSession.setOcrError(error?.message || 'OCR failed')
    return true
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

  getTranslatedBlockPersistenceRecords() {
    const records = []
    for (const state of this._translationState.values()) {
      if (state.status !== 'translated') continue

      records.push(Object.freeze({
        blockId: state.blockId,
        pageNumber: state.pageNumber || 0,
        translatedText: state.translatedText || '',
        translatedCells: cloneTranslationPersistenceValue(state.translatedCells),
        status: 'translated',
        provider: state.provider || '',
        sourceLanguage: state.sourceLanguage || '',
        targetLanguage: state.targetLanguage || '',
        sourceTextHash: state.sourceTextHash || '',
        updatedAt: state.updatedAt || 0
      }))
    }

    return Object.freeze(records)
  }

  getTranslationHistoryMetadata() {
    let translatedBlockCount = 0
    const translatedPages = new Set()
    let provider = ''
    let sourceLanguage = ''
    let targetLanguage = ''

    for (const state of this._translationState.values()) {
      if (state.status !== 'translated') continue

      translatedBlockCount += 1
      if (state.pageNumber > 0) translatedPages.add(state.pageNumber)
      if (!provider && state.provider) provider = state.provider
      if (!sourceLanguage && state.sourceLanguage) sourceLanguage = state.sourceLanguage
      if (!targetLanguage && state.targetLanguage) targetLanguage = state.targetLanguage
    }

    return Object.freeze({
      translatedBlockCount,
      translatedPageCount: translatedPages.size,
      provider,
      sourceLanguage,
      targetLanguage
    })
  }

  getTranslationExportStats() {
    const {
      totalCount,
      translatedCount,
      failedCount,
      hasTranslatedBlocks
    } = this._translationState.getStats()

    return Object.freeze({
      totalBlocks: totalCount,
      translatedCount,
      failedCount,
      totalPages: this.totalPages,
      isPartial: translatedCount < totalCount && totalCount > 0,
      hasTranslatedBlocks
    })
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
    const documentGeneration = this.documentGeneration
    return this._resolver.resolveDestination({
      pdfDocument: this.pdfDocument,
      totalPages: this.totalPages,
      destination: dest,
      documentGeneration,
      isDocumentGenerationCurrent: generation => this._isDocumentGenerationCurrent(generation)
    })
  }

  // ── Outline Loading ────────────────────────────────────────

  /**
   * Load the PDF outline (bookmarks) tree.
   *
   * Uses pdfDocument.getOutline() and normalizes the result
   * via createOutlineNode(). Results are cached only while their
   * document generation remains current.
   *
   * @returns {Promise<Array<object>|null>} Normalized outline tree, or null if none
   */
  async loadOutline() {
    const documentGeneration = this.documentGeneration
    return this._outlineRepository.load({
      pdfDocument: this.pdfDocument,
      documentGeneration,
      isDocumentGenerationCurrent: generation => this._isDocumentGenerationCurrent(generation)
    })
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

  async renderPage(pageNumber, canvasEl) {
    const metric = this.pageMetrics[pageNumber - 1]
    if (!metric) return createPdfRenderResult(PDF_RENDER_RESULT_STATUS.FAILED)

    this._hydrateRenderedPageInBackground(pageNumber)

    const cacheKey = PdfBitmapCache.buildKey(this.documentIdentity, pageNumber, metric.scale)

    // Cache hit: draw bitmap and render text layer without pdf.js render
    const cachedEntry = this._bitmapCache.get(cacheKey)
    if (cachedEntry) {
      canvasEl.width = cachedEntry.backingWidth
      canvasEl.height = cachedEntry.backingHeight
      canvasEl.style.width = `${cachedEntry.logicalWidth}px`
      canvasEl.style.height = `${cachedEntry.logicalHeight}px`
      const ctx = canvasEl.getContext('2d', { alpha: false })
      ctx.fillStyle = PDF_PAGE_BACKGROUND
      ctx.fillRect(0, 0, cachedEntry.backingWidth, cachedEntry.backingHeight)
      ctx.drawImage(cachedEntry.bitmap, 0, 0)

      return createPdfRenderResult(PDF_RENDER_RESULT_STATUS.SUCCESS)
    }

    // Cache miss: render via PdfRenderer
    const result = await this._renderer.renderPage({
      pdfDocument: this.pdfDocument,
      metric,
      pageNumber,
      canvas: canvasEl
    })

    // Cache bitmap only on successful render
    if (result.status === PDF_RENDER_RESULT_STATUS.SUCCESS) {
      if (result.bitmap) {
        const candidateBitmap = result.bitmap
        const estimatedBytes = candidateBitmap.width * candidateBitmap.height * 4
        const presentation = result.raster ? {
          logicalWidth: result.raster.logicalWidth,
          logicalHeight: result.raster.logicalHeight,
          backingWidth: result.raster.backingWidth,
          backingHeight: result.raster.backingHeight
        } : null
        const admitted = this._bitmapCache.tryAdmit(cacheKey, candidateBitmap, estimatedBytes, presentation)
        if (!admitted) {
          candidateBitmap.close?.()
        }
        result.bitmap = null
      }
    }

    // RasterPlan must never leak past the renderer boundary
    result.raster = null

    return result
  }

  cancelRenderPage(pageNumber, canvasEl) {
    return this._renderer.cancelRender(pageNumber, canvasEl)
  }

  clearPage(pageNumber, canvasEl, textLayerRenderer) {
    this._renderer.clearPage(pageNumber, canvasEl, textLayerRenderer)
  }

  clearRenderedPageCache() {
    this._bitmapCache.clear()
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
    this.clearRenderedPageCache()
    this.pdfFingerprint = ''
    this.documentIdentity = ''
    this.displayName = ''
    this.invalidateDocumentCacheSnapshot()

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
    this.documentMetadata = createEmptyDocumentMetadata()
  }

  async destroy() {
    await this.cleanupDocument()
    this._pageSessionCommittedListeners.clear()
    this._visiblePagesChangedListeners.clear()
    this.clearRenderedPageCache()
    this._renderer.destroy()
    super.destroy()
  }
}

export { PAGE_CONTENT_SOURCE }
export const pdfDocumentSession = new PdfDocumentSession()
