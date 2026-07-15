import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let commitListener = null
let visibleListener = null
let mockProcessPages = vi.fn()

const mockPdfDocumentSession = {
  pageSessions: new Map(),
  visiblePageNumbers: new Set(),
  documentIdentity: 'doc-1',
  getPageSession: vi.fn(),
  onPageSessionCommitted: vi.fn((listener) => {
    commitListener = listener
    return vi.fn(() => {
      if (commitListener === listener) {
        commitListener = null
      }
    })
  }),
  onVisiblePagesChanged: vi.fn((listener) => {
    visibleListener = listener
    return vi.fn(() => {
      if (visibleListener === listener) {
        visibleListener = null
      }
    })
  }),
  getLoadedVisiblePageSessions: vi.fn(() => {
    const pageSessions = []

    for (const pageNumber of mockPdfDocumentSession.visiblePageNumbers) {
      const pageSession = mockPdfDocumentSession.pageSessions.get(pageNumber)
      if (!pageSession?.loaded) continue
      pageSessions.push(pageSession)
    }

    return pageSessions
  })
}

vi.mock('@/features/pdf-translation/core/PdfDocumentSession.js', () => ({
  pdfDocumentSession: mockPdfDocumentSession
}))

vi.mock('@/features/pdf-translation/core/PdfOcrProcessor.js', () => ({
  PdfOcrProcessor: class PdfOcrProcessor {
    processPages(...args) {
      return mockProcessPages(...args)
    }

    cancel() {}
  }
}))

vi.mock('@/shared/config/config.js', () => ({
  getSourceLanguageAsync: vi.fn(async () => 'eng')
}))

vi.mock('@/features/pdf-translation/core/PdfCacheManager.js', () => ({
  pdfCacheManager: {
    saveOcr: vi.fn(async () => {})
  }
}))

const { usePdfOcr } = await import('./usePdfOcr.js')

function createScannedPageSession(pageNumber, overrides = {}) {
  return {
    pageNumber,
    loaded: true,
    logicalBlocks: [],
    textContent: { items: [] },
    ocrBlocks: [],
    ocrLanguage: null,
    hasOcrForLanguage: vi.fn(() => false),
    ...overrides
  }
}

function mountComposable(options = {}) {
  let api
  const wrapper = mount(defineComponent({
    setup() {
      api = usePdfOcr(options)
      return () => null
    }
  }))
  return { api, wrapper }
}

describe('usePdfOcr', () => {
  beforeEach(() => {
    commitListener = null
    visibleListener = null
    mockProcessPages = vi.fn(async () => [])
    mockPdfDocumentSession.pageSessions = new Map()
    mockPdfDocumentSession.visiblePageNumbers = new Set()
    mockPdfDocumentSession.documentIdentity = 'doc-1'
    mockPdfDocumentSession.getPageSession.mockClear()
    mockPdfDocumentSession.onPageSessionCommitted.mockClear()
    mockPdfDocumentSession.onVisiblePagesChanged.mockClear()
    mockPdfDocumentSession.getLoadedVisiblePageSessions.mockClear()
  })

  it('refreshes OCR recommendations when a PageSession commit notification arrives', () => {
    const { api, wrapper } = mountComposable()
    mockPdfDocumentSession.pageSessions.set(1, createScannedPageSession(1))
    mockPdfDocumentSession.visiblePageNumbers.add(1)

    commitListener?.({ pageNumber: 1 })

    expect(api.ocrRecommendationCount.value).toBe(1)
    api.requestOcr()
    expect(api.ocrBatch.pageNumbers).toEqual([1])
    wrapper.unmount()
  })

  it('does not hydrate while refreshing OCR recommendations', () => {
    const { api, wrapper } = mountComposable()
    mockPdfDocumentSession.pageSessions.set(1, createScannedPageSession(1))
    mockPdfDocumentSession.visiblePageNumbers.add(1)

    api.refreshOcrRecommendations()

    expect(api.ocrRecommendationCount.value).toBe(1)
    expect(mockPdfDocumentSession.getPageSession).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('refreshes OCR recommendations when visible pages change', () => {
    const { api, wrapper } = mountComposable()
    mockPdfDocumentSession.pageSessions.set(1, createScannedPageSession(1))
    mockPdfDocumentSession.visiblePageNumbers = new Set([1])

    visibleListener?.({ pages: [1] })

    expect(api.ocrRecommendationCount.value).toBe(1)
    api.requestOcr()
    expect(api.ocrBatch.pageNumbers).toEqual([1])
    wrapper.unmount()
  })

  it('captures prompt batch when OCR is requested', () => {
    const { api, wrapper } = mountComposable()
    mockPdfDocumentSession.pageSessions.set(1, createScannedPageSession(1))
    mockPdfDocumentSession.pageSessions.set(2, createScannedPageSession(2))
    mockPdfDocumentSession.visiblePageNumbers = new Set([1, 2])
    api.refreshOcrRecommendations()

    api.requestOcr()
    expect(api.ocrBatch.pageNumbers).toEqual([1, 2])
    expect(api.ocrBatch.pageNumbers.length).toBe(2)

    mockPdfDocumentSession.visiblePageNumbers = new Set([2])
    visibleListener?.({ pages: [2] })
    expect(api.ocrRecommendationCount.value).toBe(1)
    expect(api.ocrBatch.pageNumbers.length).toBe(2)
    wrapper.unmount()
  })

  it('processes the OCR batch captured when the prompt opened', async () => {
    const { api, wrapper } = mountComposable()
    mockPdfDocumentSession.pageSessions.set(1, createScannedPageSession(1))
    mockPdfDocumentSession.pageSessions.set(2, createScannedPageSession(2))
    mockPdfDocumentSession.visiblePageNumbers = new Set([1, 2])
    api.refreshOcrRecommendations()
    api.requestOcr()

    mockPdfDocumentSession.visiblePageNumbers = new Set([2])
    visibleListener?.({ pages: [2] })
    await api.confirmOcr()

    expect(mockProcessPages).toHaveBeenCalledWith([1, 2], expect.any(Object))
    wrapper.unmount()
  })

  it('emits captured OCR batch page numbers on completion', async () => {
    const onOcrComplete = vi.fn()
    const { api, wrapper } = mountComposable({ onOcrComplete })
    mockPdfDocumentSession.pageSessions.set(1, createScannedPageSession(1))
    mockPdfDocumentSession.pageSessions.set(2, createScannedPageSession(2))
    mockPdfDocumentSession.visiblePageNumbers = new Set([1, 2])
    api.refreshOcrRecommendations()
    api.requestOcr()

    mockPdfDocumentSession.visiblePageNumbers = new Set([2])
    visibleListener?.({ pages: [2] })
    await api.confirmOcr()

    expect(onOcrComplete).toHaveBeenCalledWith({ pageNumbers: [1, 2] })
    wrapper.unmount()
  })

  it('updates recommendations while scrolling down and up across hydrated pages', () => {
    const { api, wrapper } = mountComposable()
    mockPdfDocumentSession.pageSessions.set(1, createScannedPageSession(1, { logicalBlocks: [{ id: 'text-1' }] }))
    mockPdfDocumentSession.pageSessions.set(2, createScannedPageSession(2))
    mockPdfDocumentSession.pageSessions.set(3, createScannedPageSession(3))

    mockPdfDocumentSession.visiblePageNumbers = new Set([2, 3])
    visibleListener?.({ pages: [2, 3] })
    api.requestOcr()
    expect(api.ocrBatch.pageNumbers).toEqual([2, 3])

    mockPdfDocumentSession.visiblePageNumbers = new Set([1, 2])
    visibleListener?.({ pages: [1, 2] })
    api.requestOcr()
    expect(api.ocrBatch.pageNumbers).toEqual([2])

    mockPdfDocumentSession.visiblePageNumbers = new Set([3])
    visibleListener?.({ pages: [3] })
    api.requestOcr()
    expect(api.ocrBatch.pageNumbers).toEqual([3])
    wrapper.unmount()
  })

  it('keeps OCR completion refresh behavior', async () => {
    const { api, wrapper } = mountComposable()
    const pageSession = createScannedPageSession(1)
    mockPdfDocumentSession.pageSessions.set(1, pageSession)
    mockPdfDocumentSession.visiblePageNumbers.add(1)
    api.refreshOcrRecommendations()
    expect(api.ocrRecommendationCount.value).toBe(1)

    mockProcessPages = vi.fn(async () => {
      pageSession.ocrBlocks = [{ id: 'ocr-1' }]
      return [{ pageNumber: 1, blocks: pageSession.ocrBlocks, success: true }]
    })

    await api.confirmOcr()

    expect(api.ocrRecommendationCount.value).toBe(0)
    wrapper.unmount()
  })

  it('removes lifecycle listeners on unmount', () => {
    const { wrapper } = mountComposable()

    expect(commitListener).toEqual(expect.any(Function))
    expect(visibleListener).toEqual(expect.any(Function))
    wrapper.unmount()

    expect(commitListener).toBeNull()
    expect(visibleListener).toBeNull()
  })
})
