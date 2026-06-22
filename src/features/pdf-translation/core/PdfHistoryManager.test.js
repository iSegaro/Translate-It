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

const { PdfHistoryManager } = await import('./PdfHistoryManager.js')

describe('PdfHistoryManager', () => {
  let manager

  beforeEach(() => {
    manager = new PdfHistoryManager()
    mockStorage = {}
  })

  it('getHistory returns empty array when no history', async () => {
    const history = await manager.getHistory()
    expect(history).toEqual([])
  })

  it('upsert creates a new entry', async () => {
    await manager.upsert({
      documentIdentity: 'doc-1',
      fileName: 'test.pdf',
      totalPages: 5
    })

    const saved = mockStorage.pdfTranslationHistory
    expect(saved).toHaveLength(1)
    expect(saved[0].documentIdentity).toBe('doc-1')
    expect(saved[0].type).toBe('pdf-document')
  })

  it('upsert deduplicates by documentIdentity', async () => {
    mockStorage.pdfTranslationHistory = [
      { id: 'old', documentIdentity: 'doc-1', fileName: 'old.pdf', translatedBlockCount: 5 }
    ]

    await manager.upsert({
      documentIdentity: 'doc-1',
      fileName: 'new.pdf',
      translatedBlockCount: 10
    })

    const saved = mockStorage.pdfTranslationHistory
    expect(saved).toHaveLength(1)
    expect(saved[0].fileName).toBe('new.pdf')
    expect(saved[0].translatedBlockCount).toBe(10)
  })

  it('history is capped at 100 entries', async () => {
    mockStorage.pdfTranslationHistory = Array.from({ length: 100 }, (_, i) => ({
      id: `entry-${i}`,
      documentIdentity: `doc-${i}`
    }))

    await manager.upsert({ documentIdentity: 'doc-new' })

    const saved = mockStorage.pdfTranslationHistory
    expect(saved).toHaveLength(100)
    expect(saved[0].documentIdentity).toBe('doc-new')
  })

  it('removeEntry removes by id', async () => {
    mockStorage.pdfTranslationHistory = [
      { id: 'a', documentIdentity: 'doc-1' },
      { id: 'b', documentIdentity: 'doc-2' }
    ]

    await manager.removeEntry('a')

    const saved = mockStorage.pdfTranslationHistory
    expect(saved).toHaveLength(1)
    expect(saved[0].id).toBe('b')
  })

  it('clearHistory empties the array', async () => {
    await manager.clearHistory()
    expect(mockStorage.pdfTranslationHistory).toEqual([])
  })

  it('updateAfterTranslation updates translated counts and derives provider/language', async () => {
    await manager.updateAfterTranslation({
      documentIdentity: 'doc-1',
      fileName: 'test.pdf',
      totalPages: 5,
      translationStates: new Map([
        ['b1', { status: 'translated', pageNumber: 1, provider: 'google', sourceLanguage: 'en', targetLanguage: 'es' }],
        ['b2', { status: 'translated', pageNumber: 1, provider: 'google', sourceLanguage: 'en', targetLanguage: 'es' }],
        ['b3', { status: 'idle', pageNumber: 2 }]
      ])
    })

    const saved = mockStorage.pdfTranslationHistory
    expect(saved[0].translatedBlockCount).toBe(2)
    expect(saved[0].translatedPageCount).toBe(1)
    expect(saved[0].provider).toBe('google')
    expect(saved[0].sourceLanguage).toBe('en')
    expect(saved[0].targetLanguage).toBe('es')
  })

  it('updateAfterOpen creates entry with zero translated counts', async () => {
    await manager.updateAfterOpen({
      documentIdentity: 'doc-1',
      fileName: 'test.pdf',
      totalPages: 5
    })

    const saved = mockStorage.pdfTranslationHistory
    expect(saved).toHaveLength(1)
    expect(saved[0].translatedBlockCount).toBe(0)
    expect(saved[0].translatedPageCount).toBe(0)
  })
})
