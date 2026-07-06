export class PdfExportCollector {
  constructor(session) {
    this.session = session
  }

  async collectTranslatedBlocks() {
    const allBlocks = []
    const sortedPageNumbers = [...this.session.pageSessions.keys()].sort((a, b) => a - b)

    for (const pageNumber of sortedPageNumbers) {
      const pageSession = await this.session.getPageSession(pageNumber)
      if (!pageSession) continue

      const blocks = pageSession.getLogicalBlocks()
      for (const block of blocks) {
        const state = this.session.getBlockTranslationState(block.id)

        if (state.status === 'translated' && state.translatedText) {
          allBlocks.push({
            pageNumber,
            blockId: block.id,
            role: block.role || 'paragraph',
            readingOrderIndex: block.readingOrderIndex ?? 0,
            sourceText: block.text,
            translatedText: state.translatedText,
            status: 'translated'
          })
        }
      }
    }

    allBlocks.sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber
      return a.readingOrderIndex - b.readingOrderIndex
    })

    return allBlocks
  }

  async collectAllBlocks() {
    const allBlocks = []
    const sortedPageNumbers = [...this.session.pageSessions.keys()].sort((a, b) => a - b)

    for (const pageNumber of sortedPageNumbers) {
      const pageSession = await this.session.getPageSession(pageNumber)
      if (!pageSession) continue

      const blocks = pageSession.getLogicalBlocks()
      for (const block of blocks) {
        const state = this.session.getBlockTranslationState(block.id)

        allBlocks.push({
          pageNumber,
          blockId: block.id,
          role: block.role || 'paragraph',
          readingOrderIndex: block.readingOrderIndex ?? 0,
          sourceText: block.text,
          translatedText: state.translatedText || '',
          status: state.status || 'idle'
        })
      }
    }

    allBlocks.sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber
      return a.readingOrderIndex - b.readingOrderIndex
    })

    return allBlocks
  }

  getExportStats() {
    let translatedCount = 0
    let failedCount = 0
    let totalCount = 0

    for (const state of this.session.translationStates.values()) {
      totalCount++
      if (state.status === 'translated') translatedCount++
      if (state.status === 'error') failedCount++
    }

    return {
      totalBlocks: totalCount,
      translatedCount,
      failedCount,
      totalPages: this.session.totalPages,
      isPartial: translatedCount < totalCount && totalCount > 0,
      hasTranslatedBlocks: translatedCount > 0
    }
  }

  async collectSpatialBlocks(canvasDataUrls = new Map()) {
    const pages = []
    const sortedPageNumbers = [...this.session.pageSessions.keys()].sort((a, b) => a - b)

    for (const pageNumber of sortedPageNumbers) {
      const pageSession = await this.session.getPageSession(pageNumber)
      if (!pageSession) continue

      const metric = this.session.pageMetrics?.find((m) => m.pageNumber === pageNumber)
      const blocks = []
      const logicalBlocks = pageSession.getLogicalBlocks()

      for (const block of logicalBlocks) {
        const state = this.session.getBlockTranslationState(block.id)

        if (state.status !== 'translated' || !state.translatedText) continue

        blocks.push({
          blockId: block.id,
          role: block.role || 'paragraph',
          readingOrderIndex: block.readingOrderIndex ?? 0,
          boundingBox: block.boundingBox || null,
          fontSize: block.roleMetadata?.fontSize || 12,
          fontFamily: block.roleMetadata?.fontFamily || null,
          translatedText: state.translatedText
        })
      }

      blocks.sort((a, b) => a.readingOrderIndex - b.readingOrderIndex)

      if (blocks.length === 0) continue

      pages.push({
        pageNumber,
        width: metric?.naturalWidth || 0,
        height: metric?.naturalHeight || 0,
        displayWidth: metric?.width || 0,
        displayHeight: metric?.height || 0,
        scale: metric?.scale || 1,
        canvasDataUrl: canvasDataUrls.get(pageNumber) || null,
        blocks
      })
    }

    return pages
  }

  getDocumentTitle() {
    return this.session.displayName || this.session.fileName || 'document'
  }
}
