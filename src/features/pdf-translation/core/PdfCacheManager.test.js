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
    expect(result).toEqual({ translations: {}, ocr: {} })
  })

  it('loadDocument returns cached data', async () => {
    mockStorage.pdfDocumentCache = {
      'doc-1': {
        translations: {
          b1: {
            blockId: 'b1',
            translatedText: 'Hello',
            translatedCells: [
              {
                lineIndex: 0,
                cells: ['Hello'],
                structuredCells: [
                  {
                    id: 'c1',
                    regionId: 'r1',
                    rowIndex: 0,
                    columnIndex: 0,
                    rowSpan: 1,
                    colSpan: 1,
                    spanType: 'none',
                    role: 'value',
                    text: 'Hello',
                    boundingBox: { x: 10, y: 20, width: 30, height: 14 },
                    sourceReferences: {
                      blockIds: ['b1'],
                      lineIds: [],
                      sourceLineIndices: [0],
                      sourceItemIndices: [0],
                      groupRegionIds: []
                    },
                    blockIds: ['b1'],
                    lineIds: [],
                    sourceLineIndex: 0,
                    sourceItemIndex: 0,
                    spanCandidate: false,
                    estimatedRowSpan: 1,
                    estimatedColSpan: 1,
                    confidence: 0.9
                  }
                ]
              }
            ],
            translationSettingsHash: 'hash-1'
          }
        },
        ocr: { '1': { pageNumber: 1, ocrLanguage: 'eng' } }
      }
    }

    const result = await manager.loadDocument('doc-1')
    expect(result.translations.b1.translatedText).toBe('Hello')
    expect(result.translations.b1.translatedCells[0].structuredCells[0].id).toBe('c1')
    expect(result.translations.b1.translationSettingsHash).toBe('hash-1')
    expect(result.ocr['1'].ocrLanguage).toBe('eng')
  })

  it('saveTranslations writes translated blocks', async () => {
    await manager.saveTranslations('doc-1', {
      b1: { blockId: 'b1', status: 'translated', translatedText: 'Hola' },
      b2: { blockId: 'b2', status: 'idle', translatedText: '' }
    })

    const saved = mockStorage.pdfDocumentCache
    expect(saved['doc-1'].translations.b1.translatedText).toBe('Hola')
    expect(saved['doc-1'].translations.b2).toBeUndefined()
  })

  it('saveOcr writes OCR data for a page', async () => {
    await manager.saveOcr('doc-1', 1, {
      pageNumber: 1,
      ocrLanguage: 'eng',
      ocrBlocks: [{ id: 'ocr-1' }],
      ocrCompletedAt: Date.now()
    })

    const saved = mockStorage.pdfDocumentCache
    expect(saved['doc-1'].ocr['1'].ocrLanguage).toBe('eng')
  })

  it('clearDocument removes document from cache', async () => {
    mockStorage.pdfDocumentCache = {
      'doc-1': { translations: {}, ocr: {} },
      'doc-2': { translations: {}, ocr: {} }
    }

    await manager.clearDocument('doc-1')

    const saved = mockStorage.pdfDocumentCache
    expect(saved['doc-1']).toBeUndefined()
    expect(saved['doc-2']).toBeDefined()
  })

  it('clearAll empties the entire cache', async () => {
    await manager.clearAll()
    expect(mockStorage.pdfDocumentCache).toEqual({})
  })

  it('getStats returns document and block counts', async () => {
    mockStorage.pdfDocumentCache = {
      'doc-1': {
        translations: { b1: {}, b2: {} },
        ocr: { '1': {}, '2': {} }
      }
    }

    const stats = await manager.getStats()
    expect(stats.documentCount).toBe(1)
    expect(stats.blockCount).toBe(2)
    expect(stats.ocrPageCount).toBe(2)
  })
})
