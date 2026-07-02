import ResourceTracker from '@/core/memory/ResourceTracker.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { ensurePdfJsConfigured, getPdfWorkerUrl, loadPdfDocumentFromFile, AnnotationType } from './pdfjs.js'
import { PdfTextLayerRenderer } from './PdfTextLayerRenderer.js'
import { PdfPageSession } from './PdfPageSession.js'
import { sha256HexFromArrayBuffer } from './PdfBlockIdentity.js'
import { createPageTarget, createOutlineNode, createLinkAnnotation } from './NavigationModels.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfDocumentSession')
const PAGE_MARGIN = 24
const MIN_SCALE = 0.4
const MAX_SCALE = 2.0

function normalizeLayoutRequest(layoutRequest = null) {
  if (typeof layoutRequest === 'number') {
    return {
      width: Number(layoutRequest) || 0,
      height: 0,
      zoomMode: 'fit-width',
      zoomPercent: 100
    }
  }

  return {
    width: Number(layoutRequest?.width) || 0,
    height: Number(layoutRequest?.height) || 0,
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
    this._destinationCache = new Map()
    this._pageIndexCache = new Map()
    this._outline = null
    this._linkAnnotationCache = new Map()
    this._pendingHydrations = null
    this._blockIndex = new Map()
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
    this.pageSessions.clear()
    this.translationStates.clear()
    this.targetedBlockId = null
    this._destinationCache.clear()
    this._pageIndexCache.clear()
    this._outline = null
    this._linkAnnotationCache.clear()

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

  async _buildPageMetrics(layoutRequest) {
    const {
      width: viewerWidth,
      height: viewerHeight,
      zoomMode,
      zoomPercent
    } = normalizeLayoutRequest(layoutRequest)

    const usableWidth = Math.max(320, viewerWidth - PAGE_MARGIN * 2)
    const usableHeight = Math.max(0, viewerHeight - PAGE_MARGIN * 2)
    const metrics = []

    for (let pageNumber = 1; pageNumber <= this.totalPages; pageNumber += 1) {
      const page = await this.pdfDocument.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const widthScale = usableWidth / viewport.width
      const heightScale = usableHeight > 0 ? usableHeight / viewport.height : widthScale
      const percentScale = widthScale * (zoomPercent / 100)

      let scale = widthScale
      if (zoomMode === 'fit-page') {
        scale = Math.min(widthScale, heightScale)
      } else if (zoomMode === 'percent') {
        scale = percentScale
      }

      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
      const displayViewport = page.getViewport({ scale })

      metrics.push({
        pageNumber,
        width: displayViewport.width,
        height: displayViewport.height,
        naturalWidth: viewport.width,
        naturalHeight: viewport.height,
        scale,
        viewport: displayViewport
      })

      page.cleanup?.()
    }

    this.pageMetrics = metrics
    this.pageScale = metrics[0]?.scale || 1
  }

  async rebuildPageMetrics(layoutRequest) {
    if (!this.pdfDocument) {
      return this.getState()
    }

    this._cancelAllRenders()
    await this._buildPageMetrics(layoutRequest)

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

    // 1. Fast path: already hydrated and stored
    const existingSession = this.pageSessions.get(pageNumber)
    if (existingSession) {
      existingSession.updateDocumentIdentity(this.documentIdentity)
      if (existingSession.loaded && existingSession.getLogicalBlocks().length > 0) {
        return existingSession
      }
    }

    // 2. In-flight dedup: another call is already hydrating this page
    if (this._pendingHydrations?.has(pageNumber)) {
      return this._pendingHydrations.get(pageNumber)
    }

    // 3. Start new hydration and cache its promise
    if (!this._pendingHydrations) {
      this._pendingHydrations = new Map()
    }

    const promise = this._hydratePageSession(pageNumber, metric)
    this._pendingHydrations.set(pageNumber, promise)

    return promise
  }

  async _hydratePageSession(pageNumber, metric) {
    try {
      const existingSession = this.pageSessions.get(pageNumber)
      const pageSession = existingSession || new PdfPageSession({
        documentIdentity: this.documentIdentity,
        pageNumber
      })
      pageSession.updateDocumentIdentity(this.documentIdentity)

      // Re-check: a previous call may have completed while this one waited
      if (pageSession.loaded && pageSession.getLogicalBlocks().length > 0) {
        this.pageSessions.set(pageNumber, pageSession)
        return pageSession
      }

      const page = await this.pdfDocument.getPage(pageNumber)
      await pageSession.hydrate(page, metric)
      this.pageSessions.set(pageNumber, pageSession)
      this._indexPageSession(pageSession)
      return pageSession
    } finally {
      this._pendingHydrations?.delete(pageNumber)
    }
  }

  async getVisiblePageSessions() {
    if (!this.pdfDocument || this.visiblePageNumbers.size === 0) {
      return []
    }

    const pageNumbers = [...this.visiblePageNumbers].sort((a, b) => a - b)
    const sessionMap = new Map()

    const results = await Promise.allSettled(
      pageNumbers.map(async (pageNumber) => {
        const session = await this._getPageSession(pageNumber)
        if (session) {
          sessionMap.set(pageNumber, session)
        }
      })
    )

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        logger.warn('Failed to hydrate page session:', {
          pageNumber: pageNumbers[i],
          reason: results[i].reason
        })
      }
    }

    return pageNumbers.map((pageNumber) => sessionMap.get(pageNumber)).filter(Boolean)
  }

  async getVisibleLogicalBlocks() {
    const pageSessions = await this.getVisiblePageSessions()
    return pageSessions.flatMap((pageSession) => pageSession.getLogicalBlocks())
  }

  getBlockTranslationState(blockId) {
    return this.translationStates.get(blockId) || {
      blockId,
      translatedText: '',
      translatedCells: null,
      status: 'idle',
      provider: '',
      sourceLanguage: '',
      targetLanguage: '',
      sourceTextHash: '',
      translationSettingsHash: '',
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

  // ── Source Block Index ────────────────────────────────────
  //
  // Invariant:
  //   Every source block currently reachable through pageSessions
  //   is indexed exactly once in _blockIndex.
  //
  // Maintenance points (keep in sync when modifying this class):
  //   - _hydratePageSession    → _indexPageSession
  //   - setPageOcrBlocks       → _indexPageSession
  //   - cleanupDocument         → _blockIndex.clear

  _indexPageSession(pageSession) {
    for (const block of pageSession.allBlocks) {
      this._blockIndex.set(block.id, block)
    }
  }

  setPageOcrBlocks(pageNumber, blocks, language) {
    const pageSession = this.pageSessions.get(pageNumber)
    if (!pageSession) return

    pageSession.setOcrBlocks(blocks, language)
    this._indexPageSession(pageSession)
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
    if (!blockId) return null
    return this._blockIndex.get(blockId) ?? null
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
  async resolveDestination(dest) {
    if (!this.pdfDocument) {
      return null
    }

    try {
      if (typeof dest === 'number') {
        return this._resolvePageNumber(dest)
      }

      if (typeof dest === 'string') {
        return this._resolveNamedDestination(dest)
      }

      if (Array.isArray(dest)) {
        return this._resolveExplicitDestination(dest)
      }

      return null
    } catch (error) {
      logger.warn('Failed to resolve destination:', error)
      return null
    }
  }

  /**
   * Resolve a direct page number into a NavigationTarget.
   *
   * @param {number} pageNumber - 1-based page number
   * @returns {object|null} PageTarget or null if out of range
   * @private
   */
  _resolvePageNumber(pageNumber) {
    if (!Number.isInteger(pageNumber)) {
      return null
    }

    if (pageNumber < 1 || pageNumber > this.totalPages) {
      return null
    }

    return createPageTarget({ pageNumber })
  }

  /**
   * Resolve a named destination string into a NavigationTarget.
   *
   * Looks up the named destination via pdfDocument.getDestination(),
   * then recursively resolves the resulting explicit destination array.
   *
   * @param {string} name - The named destination identifier
   * @returns {Promise<object|null>} NavigationTarget or null
   * @private
   */
  async _resolveNamedDestination(name) {
    if (!name || typeof name !== 'string') {
      return null
    }

    const cacheKey = `named:${name}`
    if (this._destinationCache.has(cacheKey)) {
      return this._destinationCache.get(cacheKey)
    }

    const explicitDest = await this.pdfDocument.getDestination(name)
    if (!explicitDest) {
      this._destinationCache.set(cacheKey, null)
      return null
    }

    const target = await this._resolveExplicitDestination(explicitDest)
    this._destinationCache.set(cacheKey, target)
    return target
  }

  /**
   * Resolve an explicit destination array into a NavigationTarget.
   *
   * Destination array format (PDF spec):
   *   [0] page reference (RefProxy object)
   *   [1] zoom type: 'XYZ' | 'Fit' | 'FitH' | 'FitV' | 'FitBH' | 'FitBV'
   *   [2] top (for FitH, XYZ)
   *   [3] left (for FitV, XYZ)
   *   [4] zoom (for XYZ)
   *
   * @param {Array} destArray - The explicit destination array
   * @returns {Promise<object|null>} NavigationTarget or null
   * @private
   */
  async _resolveExplicitDestination(destArray) {
    if (!Array.isArray(destArray) || destArray.length < 1) {
      return null
    }

    const pageRef = destArray[0]
    const pageNumber = await this._getPageNumberFromRef(pageRef)

    if (pageNumber === null) {
      return null
    }

    const params = this._extractDestinationParams(destArray)
    return createPageTarget({ pageNumber, ...params })
  }

  /**
   * Convert a pdf.js page reference (RefProxy) to a 1-based page number.
   *
   * Uses pdfDocument.getPageIndex() with caching to avoid repeated worker calls.
   *
   * @param {*} pageRef - The page reference from a destination array
   * @returns {Promise<number|null>} 1-based page number or null
   * @private
   */
  async _getPageNumberFromRef(pageRef) {
    if (!pageRef) {
      return null
    }

    const cacheKey = `${pageRef.num}:${pageRef.gen}`
    if (this._pageIndexCache.has(cacheKey)) {
      return this._pageIndexCache.get(cacheKey)
    }

    try {
      const pageIndex = await this.pdfDocument.getPageIndex(pageRef)
      const pageNumber = pageIndex + 1

      if (pageNumber < 1 || pageNumber > this.totalPages) {
        this._pageIndexCache.set(cacheKey, null)
        return null
      }

      this._pageIndexCache.set(cacheKey, pageNumber)
      return pageNumber
    } catch (error) {
      logger.warn('Failed to resolve page index from ref:', error)
      this._pageIndexCache.set(cacheKey, null)
      return null
    }
  }

  /**
   * Extract top, left, and zoom parameters from a destination array.
   *
   * Handles all PDF destination zoom types:
   *   - XYZ:  [ref, 'XYZ', left, top, zoom]
   *   - FitH: [ref, 'FitH', top]
   *   - FitV: [ref, 'FitV', left]
   *   - Fit:  [ref, 'Fit']  (no params)
   *   - FitBH: [ref, 'FitBH', top]
   *   - FitBV: [ref, 'FitBV', left]
   *
   * @param {Array} destArray - The explicit destination array
   * @returns {object} { top, left, zoom }
   * @private
   */
  _extractDestinationParams(destArray) {
    const zoomType = destArray[1]?.name ?? (typeof destArray[1] === 'string' ? destArray[1] : '')

    let top = null
    let left = null
    let zoom = null

    switch (zoomType) {
      case 'XYZ': {
        const rawLeft = Number(destArray[2])
        const rawTop = Number(destArray[3])
        const rawZoom = Number(destArray[4])
        left = Number.isFinite(rawLeft) ? rawLeft : null
        top = Number.isFinite(rawTop) ? rawTop : null
        zoom = Number.isFinite(rawZoom) ? rawZoom : null
        break
      }

      case 'FitH':
      case 'FitBH': {
        const rawTop = Number(destArray[2])
        top = Number.isFinite(rawTop) ? rawTop : null
        break
      }

      case 'FitV':
      case 'FitBV': {
        const rawLeft = Number(destArray[2])
        left = Number.isFinite(rawLeft) ? rawLeft : null
        break
      }

      case 'Fit':
      case 'FitR':
      default:
        break
    }

    return { top, left, zoom }
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
    if (!this.pdfDocument) {
      return null
    }

    if (this._outline !== null) {
      return this._outline
    }

    try {
      const rawOutline = await this.pdfDocument.getOutline()

      if (!rawOutline || !Array.isArray(rawOutline) || rawOutline.length === 0) {
        this._outline = null
        return null
      }

      const outline = rawOutline
        .map(createOutlineNode)
        .filter(Boolean)

      this._outline = outline.length > 0 ? outline : null
      return this._outline
    } catch (error) {
      logger.warn('Failed to load PDF outline:', error)
      this._outline = null
      return null
    }
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
    return this._outline
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
    if (!this.pdfDocument) {
      return []
    }

    if (this._linkAnnotationCache.has(pageNumber)) {
      return this._linkAnnotationCache.get(pageNumber)
    }

    const metric = this.pageMetrics[pageNumber - 1]
    if (!metric) {
      this._linkAnnotationCache.set(pageNumber, [])
      return []
    }

    try {
      const page = await this.pdfDocument.getPage(pageNumber)
      const rawAnnotations = await page.getAnnotations({ intent: 'display' })

      const linkAnnotations = rawAnnotations
        .filter((a) => a.annotationType === AnnotationType.LINK)
        .map(createLinkAnnotation)
        .filter(Boolean)

      this._linkAnnotationCache.set(pageNumber, linkAnnotations)
      return linkAnnotations
    } catch (error) {
      logger.warn(`Failed to load annotations for page ${pageNumber}:`, error)
      this._linkAnnotationCache.set(pageNumber, [])
      return []
    }
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
    this._destinationCache.clear()
    this._pageIndexCache.clear()
    this._outline = null
    this._linkAnnotationCache.clear()
    this._pendingHydrations = null
    this._blockIndex.clear()
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
