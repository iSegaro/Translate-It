import ResourceTracker from '@/core/memory/ResourceTracker.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { ensurePdfJsConfigured, getPdfWorkerUrl, loadPdfDocumentFromFile } from './pdfjs.js'
import { PdfRenderer } from './PdfRenderer.js'
import { PdfPageSession } from './PdfPageSession.js'
import { sha256HexFromArrayBuffer } from './PdfBlockIdentity.js'
import { PdfDestinationResolver } from './PdfDestinationResolver.js'
import { PdfOutlineRepository } from './PdfOutlineRepository.js'
import { PdfLinkAnnotationRepository } from './PdfLinkAnnotationRepository.js'

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
    this._renderCandidatePageNumbers = new Set()
    this.pageSessions = new Map()
    this.pdfFingerprint = ''
    this.documentIdentity = ''
    this.displayName = ''
    this.translationStates = new Map()
    this.targetedBlockId = null
    this._renderer = new PdfRenderer({
      scheduleTimeout: (fn, ms) => this.trackTimeout(fn, ms),
      cancelTimeout: (id) => this.clearTimer(id)
    })
    this._resolver = new PdfDestinationResolver()
    this._outlineRepository = new PdfOutlineRepository()
    this._linkAnnotationRepository = new PdfLinkAnnotationRepository()
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

    this._renderer.cancelAll()
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

  updateRenderCandidates(pageNumbers) {
    this._renderCandidatePageNumbers = new Set(pageNumbers)
    this._scheduleCleanup()
  }

  async getPageSession(pageNumber) {
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
        const session = await this.getPageSession(pageNumber)
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

  // ── Source Block Index ────────────────────────────────────
  //
  // Invariant:
  //   Every source block currently reachable through pageSessions
  //   is indexed exactly once in _blockIndex.
  //
  // Maintenance points (keep in sync when modifying this class):
  //   - _hydratePageSession     → _indexPageSession
  //   - setPageOcrBlocks        → _indexPageSession
  //   - unindexPageSession       → _blockIndex.delete (per-block)
  //   - releasePageSession       → unindexPageSession + pageSession.release
  //   - cleanupDocument          → _blockIndex.clear

  _indexPageSession(pageSession) {
    for (const block of pageSession.allBlocks) {
      this._blockIndex.set(block.id, block)
    }
  }

  unindexPageSession(pageNumber) {
    const pageSession = this.pageSessions.get(pageNumber)
    if (!pageSession) return

    for (const block of pageSession.allBlocks) {
      this._blockIndex.delete(block.id)
    }
  }

  releasePageSession(pageNumber) {
    const pageSession = this.pageSessions.get(pageNumber)
    if (!pageSession) return

    this.unindexPageSession(pageNumber)
    pageSession.release()
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
    if (!metric) return false
    const pageSession = this.pageSessions.get(pageNumber) || null
    return this._renderer.renderPage({
      pdfDocument: this.pdfDocument,
      metric,
      pageNumber,
      canvas: canvasEl,
      textLayerRenderer,
      pageSession
    })
  }

  clearPage(pageNumber, canvasEl, textLayerRenderer) {
    this._renderer.clearPage(pageNumber, canvasEl, textLayerRenderer)
  }

  _cancelAllRenders() {
    this._renderer.cancelAll()
  }

  _scheduleCleanup() {
    const merged = new Set([
      ...this.visiblePageNumbers,
      ...this._renderCandidatePageNumbers
    ])
    this._renderer.scheduleCleanup(merged, () => {
      for (const [pageNumber] of this.pageSessions) {
        if (!merged.has(pageNumber)) {
          this.releasePageSession(pageNumber)
        }
      }
    })
  }

  async cleanupDocument() {
    this._renderer.cancelScheduledCleanup()
    this._cancelAllRenders()
    this.visiblePageNumbers.clear()
    this._renderCandidatePageNumbers.clear()
    this.pageSessions.clear()
    this.translationStates.clear()
    this.targetedBlockId = null
    this._resolver.clearCaches()
    this._outlineRepository.clear()
    this._linkAnnotationRepository.clear()
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
    this._renderer.destroy()
    super.destroy()
  }
}

export const pdfDocumentSession = new PdfDocumentSession()
