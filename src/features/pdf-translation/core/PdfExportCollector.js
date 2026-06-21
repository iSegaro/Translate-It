export class PdfExportCollector {
  constructor(session) {
    this.session = session
  }

  collectTranslatedBlocks() {
    const allBlocks = []
    const pageSessions = this.session.pageSessions

    const sortedPageNumbers = [...pageSessions.keys()].sort((a, b) => a - b)

    for (const pageNumber of sortedPageNumbers) {
      const pageSession = pageSessions.get(pageNumber)
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

  collectAllBlocks() {
    const allBlocks = []
    const pageSessions = this.session.pageSessions

    const sortedPageNumbers = [...pageSessions.keys()].sort((a, b) => a - b)

    for (const pageNumber of sortedPageNumbers) {
      const pageSession = pageSessions.get(pageNumber)
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
    const allBlocks = this.collectAllBlocks()
    const translatedBlocks = this.collectTranslatedBlocks()
    const totalPages = this.session.totalPages
    const pagesWithTranslations = new Set(translatedBlocks.map((b) => b.pageNumber))

    return {
      totalBlocks: allBlocks.length,
      translatedCount: translatedBlocks.length,
      failedCount: allBlocks.filter((b) => b.status === 'error').length,
      totalPages,
      translatedPageCount: pagesWithTranslations.size,
      isPartial: translatedBlocks.length < allBlocks.length && allBlocks.length > 0,
      hasTranslatedBlocks: translatedBlocks.length > 0
    }
  }

  getDocumentTitle() {
    return this.session.displayName || this.session.fileName || 'document'
  }
}
