import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let commitListener = null
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

function mountComposable() {
  let api
  const wrapper = mount(defineComponent({
    setup() {
      api = usePdfOcr()
      return () => null
    }
  }))
  return { api, wrapper }
}

describe('usePdfOcr', () => {
  beforeEach(() => {
    commitListener = null
    mockProcessPages = vi.fn(async () => [])
    mockPdfDocumentSession.pageSessions = new Map()
    mockPdfDocumentSession.visiblePageNumbers = new Set()
    mockPdfDocumentSession.documentIdentity = 'doc-1'
    mockPdfDocumentSession.getPageSession.mockClear()
    mockPdfDocumentSession.onPageSessionCommitted.mockClear()
  })

  it('refreshes OCR candidates when a PageSession commit notification arrives', () => {
    const { api, wrapper } = mountComposable()
    mockPdfDocumentSession.pageSessions.set(1, createScannedPageSession(1))
    mockPdfDocumentSession.visiblePageNumbers.add(1)

    commitListener?.({ pageNumber: 1 })

    expect(api.scannedPageCount.value).toBe(1)
    expect(api.scannedPageNumbers.value).toEqual([1])
    wrapper.unmount()
  })

  it('does not hydrate while refreshing OCR candidates', () => {
    const { api, wrapper } = mountComposable()
    mockPdfDocumentSession.pageSessions.set(1, createScannedPageSession(1))
    mockPdfDocumentSession.visiblePageNumbers.add(1)

    api.refreshOcrCandidates()

    expect(api.scannedPageCount.value).toBe(1)
    expect(mockPdfDocumentSession.getPageSession).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps OCR completion refresh behavior', async () => {
    const { api, wrapper } = mountComposable()
    const pageSession = createScannedPageSession(1)
    mockPdfDocumentSession.pageSessions.set(1, pageSession)
    mockPdfDocumentSession.visiblePageNumbers.add(1)
    api.refreshOcrCandidates()
    expect(api.scannedPageCount.value).toBe(1)

    mockProcessPages = vi.fn(async () => {
      pageSession.ocrBlocks = [{ id: 'ocr-1' }]
      return [{ pageNumber: 1, blocks: pageSession.ocrBlocks, success: true }]
    })

    await api.confirmOcr()

    expect(api.scannedPageCount.value).toBe(0)
    wrapper.unmount()
  })

  it('removes hydration listener on unmount', () => {
    const { wrapper } = mountComposable()

    expect(commitListener).toEqual(expect.any(Function))
    wrapper.unmount()

    expect(commitListener).toBeNull()
  })
})
