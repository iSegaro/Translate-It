import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { PdfPageSession } from './PdfPageSession.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfPageContentRepository')

export class PdfPageContentRepository {
  constructor() {
    this.pageSessions = new Map()
    this._pendingHydrations = null
    this._blockIndex = new Map()
  }

  get blockIndex() {
    return this._blockIndex
  }

  get pendingHydrations() {
    return this._pendingHydrations
  }

  async getPageSession({ pdfDocument, pageMetrics, documentIdentity, pageNumber }) {
    if (!pdfDocument) return null

    const metric = pageMetrics[pageNumber - 1]
    if (!metric) return null

    // 1. Fast path: already hydrated and stored
    const existingSession = this.pageSessions.get(pageNumber)
    if (existingSession) {
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
      metric
    })
    this._pendingHydrations.set(pageNumber, promise)

    return promise
  }

  async _hydratePageSession({ pdfDocument, documentIdentity, pageNumber, metric }) {
    try {
      const existingSession = this.pageSessions.get(pageNumber)
      const pageSession = existingSession || new PdfPageSession({
        documentIdentity,
        pageNumber
      })
      pageSession.updateDocumentIdentity(documentIdentity)

      // Re-check: a previous call may have completed while this one waited
      if (pageSession.loaded && pageSession.getLogicalBlocks().length > 0) {
        this.pageSessions.set(pageNumber, pageSession)
        return pageSession
      }

      const page = await pdfDocument.getPage(pageNumber)
      await pageSession.hydrate(page, metric)
      this.pageSessions.set(pageNumber, pageSession)
      this._indexPageSession(pageSession)
      return pageSession
    } finally {
      this._pendingHydrations?.delete(pageNumber)
    }
  }

  async getVisiblePageSessions({ pdfDocument, pageMetrics, documentIdentity, visiblePageNumbers }) {
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

  async getVisibleLogicalBlocks({ pdfDocument, pageMetrics, documentIdentity, visiblePageNumbers }) {
    const pageSessions = await this.getVisiblePageSessions({
      pdfDocument,
      pageMetrics,
      documentIdentity,
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
