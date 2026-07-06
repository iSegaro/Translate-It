import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./pdfjs.js', () => ({
  ensurePdfJsConfigured: vi.fn(() => ({})),
  getPdfWorkerUrl: vi.fn(() => 'blob:worker-url'),
  loadPdfDocumentFromFile: vi.fn()
}))

vi.mock('./PdfTextLayerRenderer.js', () => ({
  PdfTextLayerRenderer: class PdfTextLayerRenderer {}
}))

const { PdfDocumentSession } = await import('./PdfDocumentSession.js')

describe('PdfDocumentSession', () => {
  let session
  let pdfDocument
  let loadingTask

  beforeEach(() => {
    session = new PdfDocumentSession()
    loadingTask = {
      destroy: vi.fn().mockResolvedValue(undefined)
    }

    pdfDocument = {
      numPages: 2,
      getPage: vi.fn(async (pageNumber) => ({
        pageNumber,
        cleanup: vi.fn(),
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            {
              str: `Page ${pageNumber} text`,
              transform: [1, 0, 0, 14, 40, 650],
              width: 100,
              height: 14,
              dir: 'ltr'
            }
          ]
        }),
        getViewport: ({ scale }) => ({
          width: 100 * pageNumber * scale,
          height: 200 * pageNumber * scale
        })
      })),
      destroy: vi.fn().mockResolvedValue(undefined)
    }

    session.loadingTask = loadingTask
    session.pdfDocument = pdfDocument
    session.objectUrl = 'blob:pdf-object-url'
    session.fileName = 'sample.pdf'
    session.totalPages = 2
  })

  it('rebuildPageMetrics recomputes layout without reopening or destroying the document', async () => {
    const state = await session.rebuildPageMetrics(640)

    expect(pdfDocument.getPage).toHaveBeenCalledTimes(2)
    expect(loadingTask.destroy).not.toHaveBeenCalled()
    expect(pdfDocument.destroy).not.toHaveBeenCalled()
    expect(session.objectUrl).toBe('blob:pdf-object-url')
    expect(state.fileName).toBe('sample.pdf')
    expect(state.totalPages).toBe(2)
    expect(state.pageMetrics).toHaveLength(2)
    expect(state.pageMetrics[0].pageNumber).toBe(1)
    expect(state.pageMetrics[1].pageNumber).toBe(2)
  })

  it('rebuildPageMetrics uses the smaller width or height scale for fit-page', async () => {
    session.totalPages = 1
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        pageNumber: 1,
        cleanup: vi.fn(),
        getTextContent: vi.fn().mockResolvedValue({
          items: []
        }),
        getViewport: ({ scale }) => ({
          width: 500 * scale,
          height: 600 * scale
        })
      }))
    }

    const state = await session.rebuildPageMetrics({
      width: 400,
      height: 400,
      availableCanvasWidth: 352,
      availableCanvasHeight: 300,
      zoomMode: 'fit-page',
      zoomPercent: 100
    })

    expect(state.pageMetrics).toHaveLength(1)
    expect(state.pageMetrics[0].scale).toBeCloseTo(300 / 600, 6)
    expect(state.pageMetrics[0].height).toBeCloseTo(300, 6)
  })

  it('keeps fit-width scale compatible when an explicit canvas slot is provided', async () => {
    session.totalPages = 1
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        pageNumber: 1,
        cleanup: vi.fn(),
        getTextContent: vi.fn().mockResolvedValue({
          items: []
        }),
        getViewport: ({ scale }) => ({
          width: 500 * scale,
          height: 600 * scale
        })
      }))
    }

    const state = await session.rebuildPageMetrics({
      width: 400,
      height: 400,
      availableCanvasWidth: 352,
      availableCanvasHeight: 300,
      zoomMode: 'fit-width',
      zoomPercent: 100
    })

    expect(state.pageMetrics).toHaveLength(1)
    expect(state.pageMetrics[0].scale).toBeCloseTo(352 / 500, 6)
  })

  it('rebuildPageMetrics applies percent zoom on top of fit-width scale', async () => {
    session.totalPages = 1
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        pageNumber: 1,
        cleanup: vi.fn(),
        getTextContent: vi.fn().mockResolvedValue({
          items: []
        }),
        getViewport: ({ scale }) => ({
          width: 500 * scale,
          height: 600 * scale
        })
      }))
    }

    const state = await session.rebuildPageMetrics({
      width: 400,
      height: 400,
      zoomMode: 'percent',
      zoomPercent: 125
    })

    expect(state.pageMetrics).toHaveLength(1)
    expect(state.pageMetrics[0].scale).toBeCloseTo((352 / 500) * 1.25, 6)
  })

  it('keeps visible logical block identity stable across page metric rebuilds', async () => {
    session.pageMetrics = [
      {
        pageNumber: 1,
        width: 100,
        height: 200,
        naturalWidth: 100,
        naturalHeight: 200,
        scale: 1
      }
    ]
    session.totalPages = 1
    session.documentIdentity = 'fingerprint-1'
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        pageNumber: 1,
        cleanup: vi.fn(),
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            {
              str: 'Stable page text',
              transform: [1, 0, 0, 14, 40, 650],
              width: 120,
              height: 14,
              dir: 'ltr'
            }
          ]
        }),
        getViewport: ({ scale }) => ({
          width: 100 * scale,
          height: 200 * scale
        })
      }))
    }

    session.updateVisiblePages([1])

    const firstBlocks = await session.getVisibleLogicalBlocks()
    await session.rebuildPageMetrics(900)
    const secondBlocks = await session.getVisibleLogicalBlocks()

    expect(firstBlocks).toHaveLength(1)
    expect(secondBlocks).toHaveLength(1)
    expect(firstBlocks[0].id).toBe(secondBlocks[0].id)
    expect(firstBlocks[0].sourceTextHash).toHaveLength(64)
    expect(session.pageSessions.get(1)?.loaded).toBe(true)
  })

  it('unindexPageSession removes blocks from _blockIndex', async () => {
    session.documentIdentity = 'fingerprint-1'
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 },
      { pageNumber: 2, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.updateVisiblePages([1, 2])
    const sessions = await session.getVisiblePageSessions()

    expect(session._blockIndex.size).toBe(2)
    expect(session.findSourceBlock(sessions[0].logicalBlocks[0].id)).toBeTruthy()

    session.unindexPageSession(1)

    expect(session.findSourceBlock(sessions[0].logicalBlocks[0].id)).toBeNull()
    expect(session._blockIndex.size).toBe(1)
  })

  it('unindexPageSession is a no-op for missing page', () => {
    expect(() => session.unindexPageSession(99)).not.toThrow()
  })

  it('releasePageSession releases session and cleans block index', async () => {
    session.documentIdentity = 'fingerprint-1'
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.updateVisiblePages([1])
    await session.getVisiblePageSessions()

    const pageSession = session.pageSessions.get(1)
    expect(pageSession.loaded).toBe(true)
    expect(session._blockIndex.size).toBeGreaterThan(0)

    session.releasePageSession(1)

    expect(pageSession.loaded).toBe(false)
    expect(pageSession.textContent).toBeNull()
    expect(pageSession.logicalBlocks).toEqual([])
    expect(session._blockIndex.size).toBe(0)
  })

  it('releasePageSession is a no-op for missing page', () => {
    expect(() => session.releasePageSession(99)).not.toThrow()
  })

  it('releasePageSession followed by getVisiblePageSessions re-hydrates the page', async () => {
    session.documentIdentity = 'fingerprint-1'
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 },
      { pageNumber: 2, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.updateVisiblePages([1, 2])
    await session.getVisiblePageSessions()

    const initialCallCount = pdfDocument.getPage.mock.calls.length

    session.releasePageSession(1)
    expect(session.pageSessions.get(1).loaded).toBe(false)

    await session.getVisiblePageSessions()

    expect(session.pageSessions.get(1).loaded).toBe(true)
    expect(session.pageSessions.get(1).getLogicalBlocks()).toHaveLength(1)
    expect(session._blockIndex.size).toBe(2)
    expect(pdfDocument.getPage).toHaveBeenCalledTimes(initialCallCount + 1)
  })

  describe('automatic page session release via _scheduleCleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('releases sessions outside the merged keep set after cleanup delay', async () => {
      session.documentIdentity = 'fingerprint-1'
      session.pageMetrics = [
        { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 },
        { pageNumber: 2, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 },
        { pageNumber: 3, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
      ]
      session.totalPages = 3

      session.updateVisiblePages([1, 2, 3])
      await session.getVisiblePageSessions()

      expect(session.pageSessions.get(1).loaded).toBe(true)
      expect(session.pageSessions.get(2).loaded).toBe(true)
      expect(session.pageSessions.get(3).loaded).toBe(true)

      session.updateVisiblePages([1, 2])
      session.updateRenderCandidates(new Set([1, 2]))

      vi.advanceTimersByTime(200)

      expect(session.pageSessions.get(1).loaded).toBe(true)
      expect(session.pageSessions.get(2).loaded).toBe(true)
      expect(session.pageSessions.get(3).loaded).toBe(false)
    })

    it('preserves sessions in the render candidate set', async () => {
      session.documentIdentity = 'fingerprint-1'
      session.pageMetrics = [
        { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 },
        { pageNumber: 2, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
      ]
      session.totalPages = 2

      session.updateVisiblePages([1, 2])
      await session.getVisiblePageSessions()
      expect(session.pageSessions.get(1).loaded).toBe(true)
      expect(session.pageSessions.get(2).loaded).toBe(true)

      session.updateVisiblePages([1])
      session.updateRenderCandidates(new Set([1, 2]))

      vi.advanceTimersByTime(200)

      expect(session.pageSessions.get(1).loaded).toBe(true)
      expect(session.pageSessions.get(2).loaded).toBe(true)
    })

    it('does not release sessions when rescheduled before timeout fires', async () => {
      session.documentIdentity = 'fingerprint-1'
      session.pageMetrics = [
        { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
      ]
      session.totalPages = 1

      session.updateVisiblePages([1])
      await session.getVisiblePageSessions()
      expect(session.pageSessions.get(1).loaded).toBe(true)

      session.updateVisiblePages([])
      session.updateRenderCandidates(new Set())

      session.updateVisiblePages([1])
      session.updateRenderCandidates(new Set([1]))

      vi.advanceTimersByTime(200)

      expect(session.pageSessions.get(1).loaded).toBe(true)
    })
  })
})
