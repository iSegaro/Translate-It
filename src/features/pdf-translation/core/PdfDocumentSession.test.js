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
        getViewport: ({ scale }) => {
          const vp = {
            width: 100 * pageNumber * scale,
            height: 200 * pageNumber * scale
          }
          vp.clone = ({ scale: s }) => ({
            width: vp.width * s,
            height: vp.height * s
          })
          return vp
        }
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

  describe('batched metrics building', () => {
    const BATCH_SIZE = 8

    it('fetches all pages across multiple batches with correct call count', async () => {
      const PAGE_COUNT = 25
      session.totalPages = PAGE_COUNT
      session.pdfDocument.numPages = PAGE_COUNT

      const state = await session.rebuildPageMetrics(640)

      expect(pdfDocument.getPage).toHaveBeenCalledTimes(PAGE_COUNT)
      expect(state.pageMetrics).toHaveLength(PAGE_COUNT)
    })

    it('preserves pageNumber order across batches', async () => {
      const PAGE_COUNT = 25
      session.totalPages = PAGE_COUNT
      session.pdfDocument.numPages = PAGE_COUNT

      const state = await session.rebuildPageMetrics(640)

      for (let i = 0; i < PAGE_COUNT; i++) {
        expect(state.pageMetrics[i].pageNumber).toBe(i + 1)
      }
    })

    it('produces correct metric shape for every page after batched fetch', async () => {
      const PAGE_COUNT = 25
      session.totalPages = PAGE_COUNT
      session.pdfDocument.numPages = PAGE_COUNT

      const state = await session.rebuildPageMetrics(640)

      for (let i = 0; i < PAGE_COUNT; i++) {
        const metric = state.pageMetrics[i]
        expect(metric).toHaveProperty('pageNumber', i + 1)
        expect(metric).toHaveProperty('width')
        expect(metric).toHaveProperty('height')
        expect(metric).toHaveProperty('naturalWidth')
        expect(metric).toHaveProperty('naturalHeight')
        expect(metric).toHaveProperty('scale')
        expect(metric).toHaveProperty('viewport')
        expect(metric.viewport).toHaveProperty('width')
        expect(metric.viewport).toHaveProperty('height')
        expect(metric.width).toBeGreaterThan(0)
        expect(metric.height).toBeGreaterThan(0)
        expect(metric.scale).toBeGreaterThan(0)
      }
    })

    it('skips getPage entirely on cached rebuild after batched first open', async () => {
      const PAGE_COUNT = 25
      session.totalPages = PAGE_COUNT
      session.pdfDocument.numPages = PAGE_COUNT

      await session.rebuildPageMetrics(640)
      pdfDocument.getPage.mockClear()
      await session.rebuildPageMetrics(800)

      expect(pdfDocument.getPage).not.toHaveBeenCalled()
    })

    it('produces identical metrics between uncached and cached rebuild for 25 pages', async () => {
      const PAGE_COUNT = 25
      session.totalPages = PAGE_COUNT
      session.pdfDocument.numPages = PAGE_COUNT
      session._naturalPageViewports.clear()

      const uncachedState = await session.rebuildPageMetrics(640)
      const cachedState = await session.rebuildPageMetrics(640)

      for (let i = 0; i < PAGE_COUNT; i++) {
        const uncached = uncachedState.pageMetrics[i]
        const cached = cachedState.pageMetrics[i]
        expect(cached.pageNumber).toBe(uncached.pageNumber)
        expect(cached.width).toBe(uncached.width)
        expect(cached.height).toBe(uncached.height)
        expect(cached.scale).toBe(uncached.scale)
        expect(cached.naturalWidth).toBe(uncached.naturalWidth)
        expect(cached.naturalHeight).toBe(uncached.naturalHeight)
        expect(cached.viewport.width).toBe(uncached.viewport.width)
        expect(cached.viewport.height).toBe(uncached.viewport.height)
      }
    })
  })

  describe('natural viewport cache', () => {
    it('populates cache on first rebuild', async () => {
      await session.rebuildPageMetrics(640)
      expect(session._naturalPageViewports.size).toBe(2)
      expect(session._naturalPageViewports.get(1)).toBeDefined()
      expect(session._naturalPageViewports.get(1).width).toBe(100)
    })

    it('reuses cache and avoids getPage on subsequent rebuild', async () => {
      await session.rebuildPageMetrics(640)
      pdfDocument.getPage.mockClear()
      await session.rebuildPageMetrics(800)
      expect(pdfDocument.getPage).not.toHaveBeenCalled()
    })

    it('preserves natural dimensions across rebuilds with different zoom', async () => {
      await session.rebuildPageMetrics(640)
      const naturalWidth1 = session.pageMetrics[0].naturalWidth
      const naturalHeight1 = session.pageMetrics[0].naturalHeight

      await session.rebuildPageMetrics(1200)

      expect(session.pageMetrics[0].naturalWidth).toBe(naturalWidth1)
      expect(session.pageMetrics[0].naturalHeight).toBe(naturalHeight1)
      expect(session.pageMetrics[0].width).not.toBe(100)
    })

    it('clears cache on cleanupDocument', async () => {
      await session.rebuildPageMetrics(640)
      expect(session._naturalPageViewports.size).toBe(2)
      await session.cleanupDocument()
      expect(session._naturalPageViewports.size).toBe(0)
    })

    it('produces identical metrics between cached and uncached rebuilds with same layout', async () => {
      const layout = 640

      session._naturalPageViewports.clear()
      const uncachedState = await session.rebuildPageMetrics(layout)

      const cachedState = await session.rebuildPageMetrics(layout)

      for (let i = 0; i < uncachedState.pageMetrics.length; i++) {
        const uncached = uncachedState.pageMetrics[i]
        const cached = cachedState.pageMetrics[i]
        expect(cached.pageNumber).toBe(uncached.pageNumber)
        expect(cached.width).toBe(uncached.width)
        expect(cached.height).toBe(uncached.height)
        expect(cached.scale).toBe(uncached.scale)
        expect(cached.naturalWidth).toBe(uncached.naturalWidth)
        expect(cached.naturalHeight).toBe(uncached.naturalHeight)
         expect(cached.viewport.width).toBe(uncached.viewport.width)
         expect(cached.viewport.height).toBe(uncached.viewport.height)
       }
     })
   })
 })

 describe('bitmap cache integration', () => {
   let cacheSession
   let mockRenderer
   let mockBitmap
   let mockPdfDocument

   beforeEach(() => {
     cacheSession = new PdfDocumentSession()
     mockBitmap = { width: 600, height: 800, close: vi.fn() }
     mockRenderer = {
       renderPage: vi.fn().mockResolvedValue({
         status: 'success',
         bitmap: mockBitmap
       }),
       cancelRender: vi.fn().mockReturnValue(false),
       clearPage: vi.fn(),
       cancelAll: vi.fn(),
       scheduleCleanup: vi.fn(),
       cancelScheduledCleanup: vi.fn(),
       destroy: vi.fn()
     }
     mockPdfDocument = {
       getPage: vi.fn().mockResolvedValue({
         pageNumber: 1,
         cleanup: vi.fn(),
         getTextContent: vi.fn().mockResolvedValue({ items: [] }),
         getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale })
       })
     }
     cacheSession._renderer = mockRenderer
     cacheSession.pdfDocument = mockPdfDocument
     cacheSession.documentIdentity = 'test-doc'
     cacheSession.pageMetrics = [
       { pageNumber: 1, width: 600, height: 800, scale: 1.5, viewport: { width: 600, height: 800 } }
     ]
   })

   it('caches bitmap on successful render', async () => {
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }

     await cacheSession.renderPage(1, canvas, null)

     expect(cacheSession._bitmapCache.size).toBe(1)
     expect(mockRenderer.renderPage).toHaveBeenCalledTimes(1)
   })

   it('uses cache on second render for same page/scale', async () => {
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }

     await cacheSession.renderPage(1, canvas, null)
     mockRenderer.renderPage.mockClear()

     const canvas2 = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }
     await cacheSession.renderPage(1, canvas2, null)

     // Cache hit — renderer should not be called
     expect(mockRenderer.renderPage).not.toHaveBeenCalled()
     expect(canvas2.width).toBe(mockBitmap.width)
     expect(canvas2.height).toBe(mockBitmap.height)
   })

   it('does not cache on failed render', async () => {
     mockRenderer.renderPage.mockResolvedValueOnce({ status: 'failed' })
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }

     await cacheSession.renderPage(1, canvas, null)

     expect(cacheSession._bitmapCache.size).toBe(0)
   })

   it('does not cache on cancelled render', async () => {
     mockRenderer.renderPage.mockResolvedValueOnce({ status: 'cancelled' })
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }

     await cacheSession.renderPage(1, canvas, null)

     expect(cacheSession._bitmapCache.size).toBe(0)
   })

   it('clearPage preserves cache', async () => {
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }
     await cacheSession.renderPage(1, canvas, null)
     expect(cacheSession._bitmapCache.size).toBe(1)

     cacheSession.clearPage(1, canvas, null)

     expect(cacheSession._bitmapCache.size).toBe(1)
   })

   it('cleanupDocument clears cache', async () => {
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }
     await cacheSession.renderPage(1, canvas, null)
     expect(cacheSession._bitmapCache.size).toBe(1)

     await cacheSession.cleanupDocument()

     expect(cacheSession._bitmapCache.size).toBe(0)
   })

   it('rebuildPageMetrics clears cache', async () => {
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }
     await cacheSession.renderPage(1, canvas, null)
     expect(cacheSession._bitmapCache.size).toBe(1)

     await cacheSession.rebuildPageMetrics(640)

     expect(cacheSession._bitmapCache.size).toBe(0)
   })

   it('cache hit still renders text layer when textLayerRenderer provided', async () => {
     const mockTextLayer = { render: vi.fn().mockResolvedValue(undefined) }
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }

     // First render — cache miss
     await cacheSession.renderPage(1, canvas, mockTextLayer)
     mockRenderer.renderPage.mockClear()
     mockTextLayer.render.mockClear()

     // Second render — cache hit
     const canvas2 = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }
     await cacheSession.renderPage(1, canvas2, mockTextLayer)

     // Renderer not called (cache hit)
     expect(mockRenderer.renderPage).not.toHaveBeenCalled()
     // Text layer still rendered
     expect(mockTextLayer.render).toHaveBeenCalled()
   })

   it('destroy clears cache', async () => {
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }
     await cacheSession.renderPage(1, canvas, null)
     expect(cacheSession._bitmapCache.size).toBe(1)

     await cacheSession.destroy()

     expect(cacheSession._bitmapCache.size).toBe(0)
   })

   it('scrolling away and back reuses cached bitmap', async () => {
     const canvas1 = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }
     await cacheSession.renderPage(1, canvas1, null)
     expect(cacheSession._bitmapCache.size).toBe(1)
     mockRenderer.renderPage.mockClear()

     // Scroll away — clearPage called
     cacheSession.clearPage(1, canvas1, null)
     expect(cacheSession._bitmapCache.size).toBe(1)

     // Scroll back — cache hit, renderer not called
     const canvas2 = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn() })) }
     await cacheSession.renderPage(1, canvas2, null)
     expect(mockRenderer.renderPage).not.toHaveBeenCalled()
     expect(cacheSession._bitmapCache.size).toBe(1)
   })
 })
