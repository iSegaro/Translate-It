import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolvePdfCanvasSlot } from '@/apps/pdf/utils/pdfFitPageFootprint.js'

vi.mock('./pdfjs.js', () => ({
  ensurePdfJsConfigured: vi.fn(() => ({})),
  getPdfWorkerUrl: vi.fn(() => 'blob:worker-url'),
  loadPdfDocumentFromFile: vi.fn()
}))

vi.mock('./PdfTextLayerRenderer.js', () => ({
  PdfTextLayerRenderer: class PdfTextLayerRenderer {}
}))

vi.mock('./PdfCacheManager.js', () => ({
  pdfCacheManager: {
    loadDocument: vi.fn()
  }
}))

const { PdfDocumentSession, PAGE_CONTENT_SOURCE } = await import('./PdfDocumentSession.js')
const { loadPdfDocumentFromFile } = await import('./pdfjs.js')
const { pdfCacheManager } = await import('./PdfCacheManager.js')

describe('PdfDocumentSession', () => {
  let session
  let pdfDocument
  let loadingTask

  beforeEach(() => {
    pdfCacheManager.loadDocument.mockReset().mockResolvedValue({ translations: {}, ocr: {} })
    loadPdfDocumentFromFile.mockReset()
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

  function createScannedPage(pageNumber = 1) {
    return {
      pageNumber,
      cleanup: vi.fn(),
      getTextContent: vi.fn().mockResolvedValue({ items: [], styles: null }),
      getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale })
    }
  }

  function createOcrEntry(pageNumber = 1) {
    return {
      pageNumber,
      ocrLanguage: 'eng',
      ocrCompletedAt: 1234,
      ocrBlocks: [{
        id: `ocr-${pageNumber}`,
        text: 'Cached OCR text',
        pageNumber,
        boundingBox: null
      }]
    }
  }

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

    const footprint = resolvePdfCanvasSlot({ width: 400, height: 400 })
    const state = await session.rebuildPageMetrics({
      width: 400,
      height: 400,
      availableCanvasWidth: footprint.availableCanvasWidth,
      availableCanvasHeight: footprint.availableCanvasHeight,
      zoomMode: 'fit-page',
      zoomPercent: 100
    })

    expect(state.pageMetrics).toHaveLength(1)
    expect(state.pageMetrics[0].scale).toBeCloseTo(footprint.availableCanvasHeight / 600, 6)
    expect(state.pageMetrics[0].height).toBeCloseTo(footprint.availableCanvasHeight, 6)
  })

  it('keeps fit-width scale compatible when a canonical footprint is provided', async () => {
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

    const footprint = resolvePdfCanvasSlot({ width: 400, height: 400 })
    const state = await session.rebuildPageMetrics({
      width: 400,
      height: 400,
      availableCanvasWidth: footprint.availableCanvasWidth,
      availableCanvasHeight: footprint.availableCanvasHeight,
      zoomMode: 'fit-width',
      zoomPercent: 100
    })

    expect(state.pageMetrics).toHaveLength(1)
    expect(state.pageMetrics[0].scale).toBeCloseTo(footprint.availableCanvasWidth / 500, 6)
  })

  it('allows fit-width to exceed the user zoom maximum', async () => {
    session.totalPages = 1
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        pageNumber: 1,
        cleanup: vi.fn(),
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
        getViewport: ({ scale }) => ({ width: 500 * scale, height: 600 * scale })
      }))
    }

    const state = await session.rebuildPageMetrics({
      width: 1500,
      height: 800,
      availableCanvasWidth: 1500,
      availableCanvasHeight: 700,
      zoomMode: 'fit-width',
      zoomPercent: 100
    })

    expect(state.pageMetrics[0].scale).toBe(3)
    expect(state.pageMetrics[0].width).toBe(1500)
  })

  it.each([
    [50, 0.5],
    [75, 0.75],
    [100, 1],
    [125, 1.25],
    [150, 1.5],
    [200, 2],
    [250, 2]
  ])('rebuildPageMetrics applies percent zoom within the user scale policy', async (zoomPercent, expectedScale) => {
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
      zoomPercent
    })

    expect(state.pageMetrics).toHaveLength(1)
    expect(state.pageMetrics[0].scale).toBeCloseTo(expectedScale, 6)
    expect(state.pageMetrics[0].width).toBeCloseTo(500 * expectedScale, 6)
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

  it('keeps visibility changes separate from page hydration', async () => {
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 1
    session.documentIdentity = 'fingerprint-1'
    const hydrateSpy = vi.spyOn(session._pageContentRepository, 'getPageSession')

    session.updateVisiblePages([1])
    await Promise.resolve()

    expect(hydrateSpy).not.toHaveBeenCalled()
    expect(pdfDocument.getPage).not.toHaveBeenCalled()
  })

  it('notifies consumers after PageSession commits', async () => {
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 1
    session.documentIdentity = 'fingerprint-1'
    const listener = vi.fn()

    session.onPageSessionCommitted(listener)
    await session.getPageSession(1)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ pageNumber: 1 })
  })

  it('returns committed page source blocks without hydrating unavailable pages', async () => {
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 },
      { pageNumber: 2, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 2

    const pageSession = await session.getPageSession(1)
    const blocks = session.getPageSourceBlocks(1)

    expect(blocks).toEqual(pageSession.getLogicalBlocks())
    expect(session.getPageSourceBlocks(2)).toEqual([])
    expect(pdfDocument.getPage).toHaveBeenCalledTimes(1)
  })

  it('forwards committed page content source unchanged', async () => {
    const pageSession = { getPageContentSource: vi.fn(() => PAGE_CONTENT_SOURCE.OCR) }
    session.pageSessions.set(1, pageSession)

    expect(session.getPageContentSource(1)).toBe(PAGE_CONTENT_SOURCE.OCR)
    expect(pageSession.getPageContentSource).toHaveBeenCalledOnce()
    expect(session.getPageContentSource(2)).toBe(PAGE_CONTENT_SOURCE.NONE)
  })

  it('returns committed text content by reference without hydrating', () => {
    const textContent = { items: [{ str: 'Committed text' }] }
    const pageSession = { loaded: true, textContent }
    const hydrateSpy = vi.spyOn(session._pageContentRepository, 'getPageSession')
    session.pageSessions.set(1, pageSession)

    const first = session.getCommittedTextContent(1)
    const second = session.getCommittedTextContent(1)

    expect(first).toBe(textContent)
    expect(second).toBe(textContent)
    expect(hydrateSpy).not.toHaveBeenCalled()
    expect(pdfDocument.getPage).not.toHaveBeenCalled()
  })

  it('returns null when committed text content is missing or not loaded', () => {
    session.pageSessions.set(1, { loaded: false, textContent: { items: [] } })
    session.pageSessions.set(2, { loaded: true, textContent: null })

    expect(session.getCommittedTextContent(1)).toBeNull()
    expect(session.getCommittedTextContent(2)).toBeNull()
    expect(session.getCommittedTextContent(3)).toBeNull()
  })

  it('returns committed OCR state without exposing the page session or hydrating', () => {
    const ocrBlocks = [{ id: 'ocr-1' }]
    const committedState = { ocrBlocks, ocrLanguage: 'eng', ocrCompletedAt: 1234, ocrError: 'previous failure' }
    const pageSession = { loaded: true, getCommittedOcrState: vi.fn(() => committedState) }
    const hydrateSpy = vi.spyOn(session._pageContentRepository, 'getPageSession')
    session.pageSessions.set(1, pageSession)

    const state = session.getCommittedOcrState(1)

    expect(state).toEqual({
      ocrBlocks,
      ocrLanguage: 'eng',
      ocrCompletedAt: 1234,
      ocrError: 'previous failure'
    })
    expect(state).not.toBe(pageSession)
    expect(state.ocrBlocks).toBe(ocrBlocks)
    expect(session.getCommittedOcrState(1)).toBe(state)
    expect(hydrateSpy).not.toHaveBeenCalled()
    expect(pdfDocument.getPage).not.toHaveBeenCalled()
  })

  it('returns null OCR state for invalid, missing, and unloaded pages', () => {
    session.pageSessions.set(1, { loaded: false, ocrBlocks: [] })

    expect(session.getCommittedOcrState(0)).toBeNull()
    expect(session.getCommittedOcrState(1)).toBeNull()
    expect(session.getCommittedOcrState(2)).toBeNull()
  })

  it('returns ordered loaded visible OCR candidates without sessions or hydration', () => {
    const hydrateSpy = vi.spyOn(session._pageContentRepository, 'getPageSession')
    session.visiblePageNumbers = new Set([2, 1, 3])
    session.pageSessions.set(1, {
      loaded: true,
      logicalBlocks: [],
      textContent: { items: [{ str: ' A ' }, { str: 'B' }] },
      ocrBlocks: [],
      ocrLanguage: null
    })
    session.pageSessions.set(2, {
      loaded: true,
      logicalBlocks: [{ id: 'text-1' }],
      textContent: { items: [{ str: 'Text' }] },
      ocrBlocks: [{ id: 'ocr-1' }],
      ocrLanguage: 'eng'
    })
    session.pageSessions.set(3, { loaded: false })

    expect(session.getLoadedVisibleOcrCandidates()).toEqual([
      { pageNumber: 1, logicalBlockCount: 0, textItemCount: 2, textCharCount: 2, hasOcrBlocks: false, ocrLanguage: null },
      { pageNumber: 2, logicalBlockCount: 1, textItemCount: 1, textCharCount: 4, hasOcrBlocks: true, ocrLanguage: 'eng' }
    ])
    expect(hydrateSpy).not.toHaveBeenCalled()
    expect(pdfDocument.getPage).not.toHaveBeenCalled()
  })

  it('records OCR errors only on existing loaded pages without commit notification', () => {
    const listener = vi.fn()
    session.onPageSessionCommitted(listener)
    const pageSession = { loaded: true, setOcrError: vi.fn() }
    session.pageSessions.set(1, pageSession)
    session.pageSessions.set(2, { loaded: false, ocrError: null })

    expect(session.recordPageOcrError(1, new Error('OCR failed'))).toBe(true)
    expect(pageSession.setOcrError).toHaveBeenCalledWith('OCR failed')
    expect(session.recordPageOcrError(0, 'invalid')).toBe(false)
    expect(session.recordPageOcrError(2, 'unloaded')).toBe(false)
    expect(session.recordPageOcrError(3, 'missing')).toBe(false)
    expect(listener).not.toHaveBeenCalled()
    expect(pdfDocument.getPage).not.toHaveBeenCalled()
  })

  it('returns loaded visible PageSessions without hydrating', () => {
    const visibleLoadedPageSession = { loaded: true, pageNumber: 1 }
    const visibleUnloadedPageSession = { loaded: false, pageNumber: 2 }
    const hiddenLoadedPageSession = { loaded: true, pageNumber: 3 }

    session.pageSessions.set(1, visibleLoadedPageSession)
    session.pageSessions.set(2, visibleUnloadedPageSession)
    session.pageSessions.set(3, hiddenLoadedPageSession)
    session.visiblePageNumbers = new Set([1, 2])

    expect(session.getLoadedVisiblePageSessions()).toEqual([visibleLoadedPageSession])
    expect(pdfDocument.getPage).not.toHaveBeenCalled()
  })

  it('traverses committed pages in page order', async () => {
    session.pageSessions.set(3, { getLogicalBlocks: () => [] })
    session.pageSessions.set(1, { getLogicalBlocks: () => [] })
    const visitedPages = []

    session.forEachCommittedPage((pageNumber) => visitedPages.push(pageNumber))

    expect(visitedPages).toEqual([1, 3])
  })

  it('unsubscribes PageSession commit listeners', async () => {
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 1
    const listener = vi.fn()
    const unsubscribe = session.onPageSessionCommitted(listener)

    unsubscribe()
    await session.getPageSession(1)

    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies consumers when visible page set changes', () => {
    const listener = vi.fn()
    session.onVisiblePagesChanged(listener)

    session.updateVisiblePages([2, 1])

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ pages: [1, 2] })
  })

  it('does not notify visible page listeners for identical sets', () => {
    const listener = vi.fn()
    session.onVisiblePagesChanged(listener)

    session.updateVisiblePages([1, 2])
    session.updateVisiblePages([2, 1])

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes visible page listeners', () => {
    const listener = vi.fn()
    const unsubscribe = session.onVisiblePagesChanged(listener)

    unsubscribe()
    session.updateVisiblePages([1])

    expect(listener).not.toHaveBeenCalled()
  })

  it('does not emit duplicate notifications for deduped hydration', async () => {
    let resolveTextContent
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 1
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        pageNumber: 1,
        cleanup: vi.fn(),
        getTextContent: vi.fn(() => new Promise((resolve) => {
          resolveTextContent = () => resolve({
            items: [{ str: 'Delayed text', transform: [1, 0, 0, 14, 40, 650], width: 100, height: 14, dir: 'ltr' }],
            styles: null
          })
        })),
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale })
      }))
    }
    const listener = vi.fn()
    session.onPageSessionCommitted(listener)

    const first = session.getPageSession(1)
    const second = session.getPageSession(1)
    await Promise.resolve()
    resolveTextContent()
    await Promise.all([first, second])

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not hydrate pages from visible-set updates', async () => {
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 },
      { pageNumber: 2, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    const hydrateSpy = vi.spyOn(session._pageContentRepository, 'getPageSession')

    session.updateVisiblePages([1, 2])
    session.updateVisiblePages([2, 1])

    expect(hydrateSpy).not.toHaveBeenCalled()
  })

  it('starts canonical hydration without waiting for canvas rendering', async () => {
    let resolveTextContent
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.pdfDocument = {
      getPage: vi.fn().mockResolvedValue({
        pageNumber: 1,
        cleanup: vi.fn(),
        getTextContent: vi.fn(() => new Promise((resolve) => {
          resolveTextContent = () => resolve({ items: [], styles: null })
        }))
      })
    }
    session._renderer = {
      renderPage: vi.fn().mockResolvedValue({ status: 'success' }),
      cancelRender: vi.fn(),
      clearPage: vi.fn(),
      cancelAll: vi.fn()
    }

    await session.renderPage(1, {})
    await Promise.resolve()

    expect(session._renderer.renderPage).toHaveBeenCalledOnce()
    expect(resolveTextContent).toBeTypeOf('function')

    resolveTextContent()
    await session.getPageSession(1)
    await session.renderPage(1, {})

    expect(session.pdfDocument.getPage).toHaveBeenCalledOnce()
  })

  it('keeps lazy getPageSession hydration working without visibility', async () => {
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 1
    session.documentIdentity = 'fingerprint-1'

    const pageSession = await session.getPageSession(1)

    expect(pageSession?.loaded).toBe(true)
    expect(session.pageSessions.get(1)).toBe(pageSession)
  })

  it('discards stale background hydration after a different document opens', async () => {
    let resolveTextContent
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.documentIdentity = 'doc-a'
    const listener = vi.fn()
    session.onPageSessionCommitted(listener)
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        pageNumber: 1,
        cleanup: vi.fn(),
        getTextContent: vi.fn(() => new Promise((resolve) => {
          resolveTextContent = () => resolve({
            items: [{ str: 'Old document text', transform: [1, 0, 0, 14, 40, 650], width: 100, height: 14, dir: 'ltr' }],
            styles: null
          })
        })),
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale })
      }))
    }

    session._renderer = {
      renderPage: vi.fn().mockResolvedValue({ status: 'success' }),
      cancelRender: vi.fn(),
      clearPage: vi.fn(),
      cancelAll: vi.fn()
    }
    await session.renderPage(1, {})
    await Promise.resolve()
    await session.cleanupDocument()
    session.documentIdentity = 'doc-b'
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    resolveTextContent()
    await Promise.resolve()

    expect(session.pageSessions.size).toBe(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('discards stale background hydration after the same document is reopened', async () => {
    let resolveTextContent
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.documentIdentity = 'same-doc'
    const listener = vi.fn()
    session.onPageSessionCommitted(listener)
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        pageNumber: 1,
        cleanup: vi.fn(),
        getTextContent: vi.fn(() => new Promise((resolve) => {
          resolveTextContent = () => resolve({
            items: [{ str: 'Old same document text', transform: [1, 0, 0, 14, 40, 650], width: 100, height: 14, dir: 'ltr' }],
            styles: null
          })
        })),
        getViewport: ({ scale }) => ({ width: 100 * scale, height: 200 * scale })
      }))
    }

    session._renderer = {
      renderPage: vi.fn().mockResolvedValue({ status: 'success' }),
      cancelRender: vi.fn(),
      clearPage: vi.fn(),
      cancelAll: vi.fn()
    }
    await session.renderPage(1, {})
    await Promise.resolve()
    await session.cleanupDocument()
    session.documentIdentity = 'same-doc'
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    resolveTextContent()
    await Promise.resolve()

    expect(session.pageSessions.size).toBe(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not notify consumers when hydration fails', async () => {
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => {
        throw new Error('getPage failed')
      })
    }
    const listener = vi.fn()
    session.onPageSessionCommitted(listener)

    await expect(session.getPageSession(1)).rejects.toThrow('getPage failed')

    expect(listener).not.toHaveBeenCalled()
  })

  it('restores cached OCR before PageSession commit notification and indexing', async () => {
    const ocrEntry = createOcrEntry(1)
    pdfCacheManager.loadDocument.mockResolvedValue({ translations: {}, ocr: { 1: ocrEntry } })
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 1
    session.documentIdentity = 'doc-ocr'
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => createScannedPage(1))
    }
    session._startDocumentCacheLoad(session.documentIdentity, session.documentGeneration)
    const listener = vi.fn(() => {
      expect(session.findSourceBlock('ocr-1')).toBe(ocrEntry.ocrBlocks[0])
      expect(session.pageSessions.get(1)?.ocrBlocks).toEqual(ocrEntry.ocrBlocks)
    })
    session.onPageSessionCommitted(listener)

    const pageSession = await session.getPageSession(1)

    expect(pageSession.ocrBlocks).toEqual(ocrEntry.ocrBlocks)
    expect(pageSession.ocrLanguage).toBe('eng')
    expect(pageSession.ocrCompletedAt).toBe(1234)
    expect(session.findSourceBlock('ocr-1')).toBe(ocrEntry.ocrBlocks[0])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('starts one cache load when a document lifecycle opens', async () => {
    pdfDocument.fingerprint = 'doc-fingerprint'
    loadPdfDocumentFromFile.mockResolvedValue({
      document: pdfDocument,
      loadingTask,
      objectUrl: 'blob:next-pdf'
    })
    pdfCacheManager.loadDocument.mockResolvedValue({ translations: {}, ocr: {} })

    await session.openFile({ type: 'application/pdf', name: 'doc.pdf' }, 800)

    expect(pdfCacheManager.loadDocument).toHaveBeenCalledTimes(1)
    expect(pdfCacheManager.loadDocument).toHaveBeenCalledWith(session.documentIdentity)
  })

  it('loads document cache once and shares readiness across PageSessions', async () => {
    let resolveCache
    pdfCacheManager.loadDocument.mockReturnValue(new Promise((resolve) => {
      resolveCache = () => resolve({
        translations: {},
        ocr: {
          1: createOcrEntry(1),
          2: createOcrEntry(2)
        }
      })
    }))
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 },
      { pageNumber: 2, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 2
    session.documentIdentity = 'doc-shared-cache'
    session.pdfDocument = {
      numPages: 2,
      getPage: vi.fn(async (pageNumber) => createScannedPage(pageNumber))
    }
    session._startDocumentCacheLoad(session.documentIdentity, session.documentGeneration)

    const first = session.getPageSession(1)
    const second = session.getPageSession(2)
    await Promise.resolve()
    expect(pdfCacheManager.loadDocument).toHaveBeenCalledTimes(1)

    resolveCache()
    const pageSessions = await Promise.all([first, second])

    expect(pageSessions[0].ocrBlocks).toHaveLength(1)
    expect(pageSessions[1].ocrBlocks).toHaveLength(1)
    expect(pdfCacheManager.loadDocument).toHaveBeenCalledTimes(1)
  })

  it('commits normally when cache is missing or cache load fails', async () => {
    pdfCacheManager.loadDocument.mockRejectedValue(new Error('storage failed'))
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 1
    session.documentIdentity = 'doc-cache-failure'
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => createScannedPage(1))
    }
    session._startDocumentCacheLoad(session.documentIdentity, session.documentGeneration)

    const pageSession = await session.getPageSession(1)

    expect(pageSession.loaded).toBe(true)
    expect(pageSession.ocrBlocks).toEqual([])
    expect(session.pageSessions.get(1)).toBe(pageSession)
  })

  it('skips corrupt cached OCR entries safely', async () => {
    pdfCacheManager.loadDocument.mockResolvedValue({
      translations: {},
      ocr: { 1: { ocrLanguage: 'eng', ocrBlocks: null } }
    })
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 1
    session.documentIdentity = 'doc-corrupt-cache'
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => createScannedPage(1))
    }
    session._startDocumentCacheLoad(session.documentIdentity, session.documentGeneration)

    const pageSession = await session.getPageSession(1)

    expect(pageSession.loaded).toBe(true)
    expect(pageSession.ocrBlocks).toEqual([])
    expect(session.pageSessions.get(1)).toBe(pageSession)
  })

  it('does not apply stale cache result after different document opens', async () => {
    let resolveCache
    pdfCacheManager.loadDocument.mockReturnValue(new Promise((resolve) => {
      resolveCache = () => resolve({ translations: {}, ocr: { 1: createOcrEntry(1) } })
    }))
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 1
    session.documentIdentity = 'doc-a'
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => createScannedPage(1))
    }
    session._startDocumentCacheLoad(session.documentIdentity, session.documentGeneration)
    const hydration = session.getPageSession(1)
    await Promise.resolve()

    await session.cleanupDocument()
    session.documentIdentity = 'doc-b'
    resolveCache()

    expect(await hydration).toBeNull()
    expect(session.pageSessions.size).toBe(0)
  })

  it('does not apply stale cache result after same document reopen', async () => {
    let resolveCache
    pdfCacheManager.loadDocument.mockReturnValue(new Promise((resolve) => {
      resolveCache = () => resolve({ translations: {}, ocr: { 1: createOcrEntry(1) } })
    }))
    session.pageMetrics = [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ]
    session.totalPages = 1
    session.documentIdentity = 'same-doc'
    session.pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => createScannedPage(1))
    }
    session._startDocumentCacheLoad(session.documentIdentity, session.documentGeneration)
    const hydration = session.getPageSession(1)
    await Promise.resolve()

    await session.cleanupDocument()
    session.documentIdentity = 'same-doc'
    resolveCache()

    expect(await hydration).toBeNull()
    expect(session.pageSessions.size).toBe(0)
  })

  describe('batched metrics building', () => {
    it('fetches all pages across multiple batches with correct call count', async () => {
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
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }

     await cacheSession.renderPage(1, canvas, null)

     expect(cacheSession._bitmapCache.size).toBe(1)
     expect(mockRenderer.renderPage).toHaveBeenCalledTimes(1)
   })

   it('uses cache on second render for same page/scale', async () => {
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }

     await cacheSession.renderPage(1, canvas, null)
     mockRenderer.renderPage.mockClear()
     mockPdfDocument.getPage.mockClear()

     const canvas2 = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }
     await cacheSession.renderPage(1, canvas2, null)

     // Cache hit — renderer should not be called
     expect(mockRenderer.renderPage).not.toHaveBeenCalled()
     // Cache hit — pdfDocument.getPage should not be called
     expect(mockPdfDocument.getPage).not.toHaveBeenCalled()
     expect(canvas2.width).toBe(mockBitmap.width)
      expect(canvas2.height).toBe(mockBitmap.height)
    })

    it('uses scale in bitmap cache keys', async () => {
      const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }
      await cacheSession.renderPage(1, canvas, null)
      expect(cacheSession._bitmapCache.size).toBe(1)

      mockRenderer.renderPage.mockClear()
      cacheSession.pageMetrics = [
        { pageNumber: 1, width: 800, height: 1000, scale: 2, viewport: { width: 800, height: 1000 } }
      ]

      const canvas2 = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }
      await cacheSession.renderPage(1, canvas2, null)

      expect(mockRenderer.renderPage).toHaveBeenCalledTimes(1)
      expect(cacheSession._bitmapCache.size).toBe(2)
    })

    it('does not cache on failed render', async () => {
     mockRenderer.renderPage.mockResolvedValueOnce({ status: 'failed' })
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }

     await cacheSession.renderPage(1, canvas, null)

     expect(cacheSession._bitmapCache.size).toBe(0)
   })

   it('does not cache on cancelled render', async () => {
     mockRenderer.renderPage.mockResolvedValueOnce({ status: 'cancelled' })
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }

     await cacheSession.renderPage(1, canvas, null)

     expect(cacheSession._bitmapCache.size).toBe(0)
   })

   it('clearPage preserves cache', async () => {
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }
     await cacheSession.renderPage(1, canvas, null)
     expect(cacheSession._bitmapCache.size).toBe(1)

     cacheSession.clearPage(1, canvas, null)

     expect(cacheSession._bitmapCache.size).toBe(1)
   })

   it('cleanupDocument clears cache', async () => {
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }
     await cacheSession.renderPage(1, canvas, null)
     expect(cacheSession._bitmapCache.size).toBe(1)

     await cacheSession.cleanupDocument()

     expect(cacheSession._bitmapCache.size).toBe(0)
   })

   it('rebuildPageMetrics clears cache', async () => {
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }
     await cacheSession.renderPage(1, canvas, null)
     expect(cacheSession._bitmapCache.size).toBe(1)

     await cacheSession.rebuildPageMetrics(640)

     expect(cacheSession._bitmapCache.size).toBe(0)
   })

    it('requests canonical hydration on a bitmap cache hit', async () => {
      const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }
      const hydrateSpy = vi.spyOn(cacheSession._pageContentRepository, 'getPageSession')

      // First render — cache miss
      await cacheSession.renderPage(1, canvas)
      mockRenderer.renderPage.mockClear()
      mockPdfDocument.getPage.mockClear()

      // Second render — cache hit
      const canvas2 = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }
      await cacheSession.renderPage(1, canvas2)

      // Renderer not called (cache hit)
      expect(mockRenderer.renderPage).not.toHaveBeenCalled()
      expect(hydrateSpy).toHaveBeenCalledTimes(2)
   })

   it('destroy clears cache', async () => {
     const canvas = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }
     await cacheSession.renderPage(1, canvas, null)
     expect(cacheSession._bitmapCache.size).toBe(1)

     await cacheSession.destroy()

     expect(cacheSession._bitmapCache.size).toBe(0)
   })

   it('scrolling away and back reuses cached bitmap', async () => {
     const canvas1 = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }
     await cacheSession.renderPage(1, canvas1, null)
     expect(cacheSession._bitmapCache.size).toBe(1)
     mockRenderer.renderPage.mockClear()

     // Scroll away — clearPage called
     cacheSession.clearPage(1, canvas1, null)
     expect(cacheSession._bitmapCache.size).toBe(1)

     // Scroll back — cache hit, renderer not called
     const canvas2 = { width: 0, height: 0, style: {}, getContext: vi.fn(() => ({ drawImage: vi.fn(), fillRect: vi.fn() })) }
     await cacheSession.renderPage(1, canvas2, null)
     expect(mockRenderer.renderPage).not.toHaveBeenCalled()
     expect(cacheSession._bitmapCache.size).toBe(1)
   })
 })
