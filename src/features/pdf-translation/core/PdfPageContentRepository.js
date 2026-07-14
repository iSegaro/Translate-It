import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { PdfPageSession } from './PdfPageSession.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfPageContentRepository')

export class PdfPageContentRepository {
  constructor({ onPageSessionCommitted = null } = {}) {
    this.pageSessions = new Map()
    this._pendingHydrations = null
    this._blockIndex = new Map()
    this._onPageSessionCommitted = typeof onPageSessionCommitted === 'function'
      ? onPageSessionCommitted
      : null
  }

  get blockIndex() {
    return this._blockIndex
  }

  get pendingHydrations() {
    return this._pendingHydrations
  }

  _isHydrationCurrent({ documentGeneration, isDocumentGenerationCurrent } = {}) {
    if (typeof isDocumentGenerationCurrent !== 'function') return true
    return isDocumentGenerationCurrent(documentGeneration)
  }

  async getPageSession({
    pdfDocument,
    pageMetrics,
    documentIdentity,
    pageNumber,
    documentGeneration,
    isDocumentGenerationCurrent
  }) {
    if (!pdfDocument) return null

    const metric = pageMetrics[pageNumber - 1]
    if (!metric) return null

    const lifecycle = { documentGeneration, isDocumentGenerationCurrent }

    // 1. Fast path: already hydrated and stored
    const existingSession = this.pageSessions.get(pageNumber)
    if (existingSession) {
      if (!this._isHydrationCurrent(lifecycle)) return null
      existingSession.updateDocumentIdentity(documentIdentity)
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

    const promise = this._hydratePageSession({
      pdfDocument,
      documentIdentity,
      pageNumber,
      metric,
      documentGeneration,
      isDocumentGenerationCurrent
    })
    this._pendingHydrations.set(pageNumber, promise)

    const clearPending = () => {
      if (this._pendingHydrations?.get(pageNumber) === promise) {
        this._pendingHydrations.delete(pageNumber)
      }
    }
    promise.then(clearPending, clearPending)

    return promise
  }

  async _hydratePageSession({
    pdfDocument,
    documentIdentity,
    pageNumber,
    metric,
    documentGeneration,
    isDocumentGenerationCurrent
  }) {
    const lifecycle = { documentGeneration, isDocumentGenerationCurrent }
    const existingSession = this.pageSessions.get(pageNumber)

    if (!this._isHydrationCurrent(lifecycle)) return null

    // Re-check: a previous call may have completed while this one waited
    if (existingSession?.loaded && existingSession.getLogicalBlocks().length > 0) {
      if (!this._isHydrationCurrent(lifecycle)) return null
      existingSession.updateDocumentIdentity(documentIdentity)
      this.pageSessions.set(pageNumber, existingSession)
      return existingSession
    }

    const page = await pdfDocument.getPage(pageNumber)
    if (!this._isHydrationCurrent(lifecycle)) return null

    const pageSession = new PdfPageSession({
      documentIdentity,
      pageNumber
    })
    await pageSession.hydrate(page, metric)
    if (!this._isHydrationCurrent(lifecycle)) return null

    this.pageSessions.set(pageNumber, pageSession)
    this._indexPageSession(pageSession)
    this._onPageSessionCommitted?.(pageSession)
    return pageSession
  }

  async getVisiblePageSessions({
    pdfDocument,
    pageMetrics,
    documentIdentity,
    visiblePageNumbers,
    documentGeneration,
    isDocumentGenerationCurrent
  }) {
    if (!pdfDocument || visiblePageNumbers.size === 0) {
      return []
    }

    const pageNumbers = [...visiblePageNumbers].sort((a, b) => a - b)
    const sessionMap = new Map()

    const results = await Promise.allSettled(
      pageNumbers.map(async (pageNumber) => {
        const session = await this.getPageSession({
          pdfDocument,
          pageMetrics,
          documentIdentity,
          documentGeneration,
          isDocumentGenerationCurrent,
          pageNumber
        })
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

  async getVisibleLogicalBlocks({
    pdfDocument,
    pageMetrics,
    documentIdentity,
    visiblePageNumbers,
    documentGeneration,
    isDocumentGenerationCurrent
  }) {
    const pageSessions = await this.getVisiblePageSessions({
      pdfDocument,
      pageMetrics,
      documentIdentity,
      documentGeneration,
      isDocumentGenerationCurrent,
      visiblePageNumbers
    })
    return pageSessions.flatMap((pageSession) => pageSession.getLogicalBlocks())
  }

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

  findSourceBlock(blockId) {
    if (!blockId) return null
    return this._blockIndex.get(blockId) ?? null
  }

  reset() {
    this.pageSessions.clear()
    this._pendingHydrations = null
    this._blockIndex.clear()
  }
}
