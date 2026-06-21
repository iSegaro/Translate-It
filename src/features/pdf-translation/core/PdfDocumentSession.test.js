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
})
