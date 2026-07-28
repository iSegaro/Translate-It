import { beforeEach, describe, expect, it, vi } from 'vitest'

let mockStorage = {}

vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageCore: {
    get: vi.fn().mockImplementation((key) => Promise.resolve(mockStorage[key])),
    set: vi.fn().mockImplementation((data) => {
      Object.assign(mockStorage, data)
      return Promise.resolve()
    })
  }
}))

const { PdfCacheManager } = await import('./PdfCacheManager.js')

describe('PdfCacheManager', () => {
  let manager

  beforeEach(() => {
    manager = new PdfCacheManager()
    mockStorage = {}
  })

  it('loadDocument returns empty when no cache exists', async () => {
    const result = await manager.loadDocument('doc-1')
    expect(result).toEqual({ ocr: {} })
  })

  it('loadDocument returns cached OCR without legacy translations', async () => {
    mockStorage.pdfDocumentCache = {
      'doc-1': {
        translations: { b1: { translatedText: 'Hello' } },
        ocr: { '1': { pageNumber: 1, ocrLanguage: 'eng' } }
      }
    }

    const result = await manager.loadDocument('doc-1')
    expect(result).toEqual({ ocr: { '1': { pageNumber: 1, ocrLanguage: 'eng' } } })
  })

  it('saveOcr writes OCR data for a page', async () => {
    await manager.saveOcr('doc-1', 1, {
      pageNumber: 1,
      ocrLanguage: 'eng',
      ocrBlocks: [{ id: 'ocr-1' }],
      ocrCompletedAt: Date.now()
    })

    const saved = mockStorage.pdfDocumentCache
    expect(saved['doc-1']).toMatchObject({ ocr: { '1': { ocrLanguage: 'eng' } } })
    expect(saved['doc-1']).not.toHaveProperty('translations')
  })

  it('clearDocument removes document from cache', async () => {
    mockStorage.pdfDocumentCache = {
      'doc-1': { ocr: {} },
      'doc-2': { ocr: {} }
    }

    await manager.clearDocument('doc-1')

    const saved = mockStorage.pdfDocumentCache
    expect(saved['doc-1']).toBeUndefined()
    expect(saved['doc-2']).toBeDefined()
  })

  it('clearAll empties the entire cache', async () => {
    mockStorage.pdfDocumentCache = { 'doc-1': { ocr: { '1': {} } } }

    await manager.clearAll()
    expect(mockStorage.pdfDocumentCache).toEqual({})
  })

  it('getStats returns document and OCR page counts', async () => {
    mockStorage.pdfDocumentCache = {
      'doc-1': {
        ocr: { '1': {}, '2': {} }
      }
    }

    const stats = await manager.getStats()
    expect(stats.documentCount).toBe(1)
    expect(stats.ocrPageCount).toBe(2)
  })
})
