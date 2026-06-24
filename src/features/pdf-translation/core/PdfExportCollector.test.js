import { beforeEach, describe, expect, it, vi } from 'vitest'

const { PdfExportCollector } = await import('./PdfExportCollector.js')

describe('PdfExportCollector', () => {
  let session

  beforeEach(() => {
    session = {
      displayName: 'test-doc.pdf',
      fileName: 'test-doc.pdf',
      totalPages: 3,
      pageSessions: new Map(),
      translationStates: new Map(),
      getBlockTranslationState: vi.fn((blockId) => {
        return session.translationStates.get(blockId) || {
          blockId,
          translatedText: '',
          status: 'idle',
          provider: '',
          sourceLanguage: '',
          targetLanguage: '',
          sourceTextHash: '',
          updatedAt: 0,
          error: null
        }
      })
    }
  })

  function setupPageSession(pageNumber, blocks) {
    const pageSession = {
      getLogicalBlocks: () => blocks
    }
    session.pageSessions.set(pageNumber, pageSession)
  }

  function setTranslated(blockId, translatedText) {
    session.translationStates.set(blockId, {
      blockId,
      translatedText,
      status: 'translated',
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es',
      sourceTextHash: 'abc',
      updatedAt: Date.now(),
      error: null
    })
  }

  function setError(blockId) {
    session.translationStates.set(blockId, {
      blockId,
      translatedText: '',
      status: 'error',
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es',
      sourceTextHash: 'abc',
      updatedAt: Date.now(),
      error: 'Failed'
    })
  }

  it('collects only translated blocks', () => {
    setupPageSession(1, [
      { id: 'b1', text: 'Hello', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0 },
      { id: 'b2', text: 'World', role: 'paragraph', pageNumber: 1, readingOrderIndex: 1 }
    ])
    setTranslated('b1', 'Hola')

    const collector = new PdfExportCollector(session)
    const blocks = collector.collectTranslatedBlocks()

    expect(blocks).toHaveLength(1)
    expect(blocks[0].blockId).toBe('b1')
    expect(blocks[0].translatedText).toBe('Hola')
  })

  it('sorts blocks by page then reading order', () => {
    setupPageSession(2, [
      { id: 'b3', text: 'P2 second', role: 'paragraph', pageNumber: 2, readingOrderIndex: 1 },
      { id: 'b4', text: 'P2 first', role: 'heading', pageNumber: 2, readingOrderIndex: 0 }
    ])
    setupPageSession(1, [
      { id: 'b1', text: 'P1', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0 }
    ])
    setTranslated('b3', 'P2 segundo')
    setTranslated('b4', 'P2 primero')
    setTranslated('b1', 'P1')

    const collector = new PdfExportCollector(session)
    const blocks = collector.collectTranslatedBlocks()

    expect(blocks[0].blockId).toBe('b1')
    expect(blocks[1].blockId).toBe('b4')
    expect(blocks[2].blockId).toBe('b3')
  })

  it('returns empty array when no translations', () => {
    setupPageSession(1, [
      { id: 'b1', text: 'Hello', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0 }
    ])

    const collector = new PdfExportCollector(session)
    const blocks = collector.collectTranslatedBlocks()

    expect(blocks).toHaveLength(0)
  })

  it('getExportStats computes correct metrics', () => {
    setupPageSession(1, [
      { id: 'b1', text: 'Hello', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0 },
      { id: 'b2', text: 'World', role: 'paragraph', pageNumber: 1, readingOrderIndex: 1 }
    ])
    setupPageSession(2, [
      { id: 'b3', text: 'Foo', role: 'paragraph', pageNumber: 2, readingOrderIndex: 0 }
    ])
    setTranslated('b1', 'Hola')
    setError('b3')

    const collector = new PdfExportCollector(session)
    const stats = collector.getExportStats()

    expect(stats.totalBlocks).toBe(3)
    expect(stats.translatedCount).toBe(1)
    expect(stats.failedCount).toBe(1)
    expect(stats.totalPages).toBe(3)
    expect(stats.translatedPageCount).toBe(1)
    expect(stats.isPartial).toBe(true)
    expect(stats.hasTranslatedBlocks).toBe(true)
  })

  it('getExportStats returns isPartial false when all blocks translated', () => {
    setupPageSession(1, [
      { id: 'b1', text: 'Hello', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0 }
    ])
    setTranslated('b1', 'Hola')

    const collector = new PdfExportCollector(session)
    const stats = collector.getExportStats()

    expect(stats.isPartial).toBe(false)
    expect(stats.hasTranslatedBlocks).toBe(true)
  })

  it('getDocumentTitle returns displayName', () => {
    const collector = new PdfExportCollector(session)
    expect(collector.getDocumentTitle()).toBe('test-doc.pdf')
  })

  it('getDocumentTitle falls back to fileName', () => {
    session.displayName = ''
    const collector = new PdfExportCollector(session)
    expect(collector.getDocumentTitle()).toBe('test-doc.pdf')
  })

  describe('collectSpatialBlocks', () => {
    it('includes geometry and skips untranslated blocks', () => {
      session.pageMetrics = [
        { pageNumber: 1, naturalWidth: 612, naturalHeight: 792, width: 600, height: 774, scale: 0.98 }
      ]
      setupPageSession(1, [
        {
          id: 'b1', text: 'Hello', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0,
          boundingBox: { x: 72, y: 100, width: 400, height: 20 },
          roleMetadata: { fontSize: 12, fontFamily: 'serif' }
        },
        {
          id: 'b2', text: 'World', role: 'heading', pageNumber: 1, readingOrderIndex: 1,
          boundingBox: { x: 72, y: 140, width: 300, height: 16 },
          roleMetadata: { fontSize: 14 }
        }
      ])
      setTranslated('b1', 'Hola')
      // b2 is NOT translated

      const collector = new PdfExportCollector(session)
      const pages = collector.collectSpatialBlocks()

      expect(pages).toHaveLength(1)
      expect(pages[0].pageNumber).toBe(1)
      expect(pages[0].width).toBe(612)
      expect(pages[0].height).toBe(792)
      expect(pages[0].scale).toBe(0.98)
      expect(pages[0].blocks).toHaveLength(1)
      expect(pages[0].blocks[0].blockId).toBe('b1')
      expect(pages[0].blocks[0].boundingBox).toEqual({ x: 72, y: 100, width: 400, height: 20 })
      expect(pages[0].blocks[0].fontSize).toBe(12)
      expect(pages[0].blocks[0].fontFamily).toBe('serif')
      expect(pages[0].blocks[0].translatedText).toBe('Hola')
    })

    it('includes canvasDataUrl when provided', () => {
      session.pageMetrics = [
        { pageNumber: 1, naturalWidth: 612, naturalHeight: 792, width: 600, height: 774, scale: 1 }
      ]
      setupPageSession(1, [
        { id: 'b1', text: 'Hello', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0, boundingBox: { x: 72, y: 100, width: 400, height: 20 }, roleMetadata: { fontSize: 12 } }
      ])
      setTranslated('b1', 'Hola')

      const canvasUrls = new Map([[1, 'data:image/jpeg;base64,abc123']])
      const collector = new PdfExportCollector(session)
      const pages = collector.collectSpatialBlocks(canvasUrls)

      expect(pages[0].canvasDataUrl).toBe('data:image/jpeg;base64,abc123')
    })

    it('returns empty array when no translations', () => {
      session.pageMetrics = [{ pageNumber: 1, naturalWidth: 612, naturalHeight: 792, width: 600, height: 774, scale: 1 }]
      setupPageSession(1, [
        { id: 'b1', text: 'Hello', role: 'paragraph', pageNumber: 1, readingOrderIndex: 0, boundingBox: null, roleMetadata: { fontSize: 12 } }
      ])

      const collector = new PdfExportCollector(session)
      const pages = collector.collectSpatialBlocks()
      expect(pages).toHaveLength(0)
    })
  })
})
