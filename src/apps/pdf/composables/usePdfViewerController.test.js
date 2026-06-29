import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sha256HexFromText } from '@/features/pdf-translation/core/PdfBlockIdentity.js'

const openFileMock = vi.fn()
const cleanupDocumentMock = vi.fn().mockResolvedValue()
const cancelActiveTranslationMock = vi.fn().mockResolvedValue()
const translateVisibleBlocksMock = vi.fn()
const saveTranslationsMock = vi.fn().mockResolvedValue()
const updateAfterOpenMock = vi.fn().mockResolvedValue()
const updateAfterTranslationMock = vi.fn().mockResolvedValue()
const getProviderOptimizationLevelAsyncMock = vi.fn()
const getSourceLanguageAsyncMock = vi.fn()
const getTargetLanguageAsyncMock = vi.fn()
const getTranslationApiAsyncMock = vi.fn()

const session = {
  openFile: openFileMock,
  cleanupDocument: cleanupDocumentMock,
  documentIdentity: 'doc-1',
  pdfFingerprint: 'fingerprint-1',
  pageSessions: new Map(),
  translationStates: new Map(),
  setBlockTranslationState: vi.fn((blockId, patch) => {
    const current = session.translationStates.get(blockId) || { blockId }
    const next = {
      ...current,
      ...patch,
      blockId
    }
    session.translationStates.set(blockId, next)
    return next
  }),
  getBlockTranslationState: vi.fn((blockId) => session.translationStates.get(blockId) || {
    blockId,
    translatedText: '',
    translatedCells: null,
    status: 'idle',
    provider: '',
    sourceLanguage: '',
    targetLanguage: '',
    sourceTextHash: '',
    translationSettingsHash: '',
    updatedAt: 0,
    error: null
  }),
  getPageLayout: vi.fn().mockReturnValue(null),
  getVisibleLogicalBlocks: vi.fn().mockResolvedValue([])
}

vi.mock('@/shared/config/config.js', () => ({
  getProviderOptimizationLevelAsync: getProviderOptimizationLevelAsyncMock,
  getSourceLanguageAsync: getSourceLanguageAsyncMock,
  getTargetLanguageAsync: getTargetLanguageAsyncMock,
  getTranslationApiAsync: getTranslationApiAsyncMock
}))

vi.mock('@/features/pdf-translation/core/PdfDocumentSession.js', () => ({
  pdfDocumentSession: session
}))

vi.mock('@/features/pdf-translation/core/PdfTranslationCoordinator.js', () => ({
  PdfTranslationCoordinator: class {
    constructor() {
      this.translateVisibleBlocks = translateVisibleBlocksMock
      this.cancelActiveTranslation = cancelActiveTranslationMock
      this.onStateChange = null
      this.lastSummary = {
        status: 'idle',
        translatedCount: 0,
        failedCount: 0,
        totalCount: 0
      }
    }
  }
}))

vi.mock('@/features/pdf-translation/core/PdfCacheManager.js', () => ({
  pdfCacheManager: {
    loadDocument: vi.fn(),
    saveTranslations: saveTranslationsMock,
    saveOcr: vi.fn(),
    clearDocument: vi.fn(),
    clearAll: vi.fn(),
    getStats: vi.fn()
  }
}))

vi.mock('@/features/pdf-translation/core/PdfHistoryManager.js', () => ({
  pdfHistoryManager: {
    updateAfterOpen: updateAfterOpenMock,
    updateAfterTranslation: updateAfterTranslationMock,
    removeEntry: vi.fn(),
    clearHistory: vi.fn()
  }
}))

const { usePdfViewerController } = await import('./usePdfViewerController.js')
const { pdfCacheManager } = await import('@/features/pdf-translation/core/PdfCacheManager.js')

function createOpenState() {
  return {
    fileName: 'doc.pdf',
    displayName: 'doc.pdf',
    totalPages: 1,
    pageMetrics: [{ pageNumber: 1, width: 600, height: 800, scale: 1 }],
    pageScale: 1,
    workerUrl: 'worker',
    documentIdentity: 'doc-1',
    pdfFingerprint: 'fingerprint-1'
  }
}

function createBlock({ id = 'block-a', sourceTextHash = 'hash-a' } = {}) {
  return {
    id,
    text: 'Revenue 12.5B',
    role: 'table-region',
    sourceTextHash,
    pageNumber: 1,
    readingOrderIndex: 0
  }
}

async function loadControllerWithCacheEntry(cacheEntry, block = createBlock()) {
  pdfCacheManager.loadDocument.mockResolvedValue({
    translations: cacheEntry ? { [block.id]: cacheEntry } : {},
    ocr: {}
  })

  session.pageSessions = new Map([
    [1, {
      allBlocks: [block],
      getLogicalBlocks: () => [block]
    }]
  ])
  session.translationStates = new Map()
  session.setBlockTranslationState.mockClear()
  session.getBlockTranslationState.mockImplementation((blockId) => session.translationStates.get(blockId) || {
    blockId,
    translatedText: '',
    translatedCells: null,
    status: 'idle',
    provider: '',
    sourceLanguage: '',
    targetLanguage: '',
    sourceTextHash: '',
    translationSettingsHash: '',
    updatedAt: 0,
    error: null
  })

  const controller = usePdfViewerController()
  const file = {
    type: 'application/pdf',
    name: 'doc.pdf',
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
  }

  openFileMock.mockResolvedValue(createOpenState())
  await controller.loadPdfFile(file, 800)
  return { controller, block }
}

describe('usePdfViewerController cache persistence', () => {
  beforeEach(() => {
    openFileMock.mockReset()
    cleanupDocumentMock.mockReset().mockResolvedValue()
    cancelActiveTranslationMock.mockReset().mockResolvedValue()
    translateVisibleBlocksMock.mockReset()
    saveTranslationsMock.mockReset().mockResolvedValue()
    updateAfterOpenMock.mockReset().mockResolvedValue()
    updateAfterTranslationMock.mockReset().mockResolvedValue()
    getProviderOptimizationLevelAsyncMock.mockReset().mockResolvedValue(3)
    getSourceLanguageAsyncMock.mockReset().mockResolvedValue('auto')
    getTargetLanguageAsyncMock.mockReset().mockResolvedValue('fa')
    getTranslationApiAsyncMock.mockReset().mockResolvedValue('googlev2')

    session.pageSessions = new Map()
    session.translationStates = new Map()
    session.documentIdentity = 'doc-1'
  })

  it('restores plain translatedText cache entries', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry({
      blockId: block.id,
      translatedText: 'درآمد ۱۲٫۵ میلیارد',
      sourceTextHash: block.sourceTextHash,
      provider: 'googlev2',
      sourceLanguage: 'en',
      targetLanguage: 'fa'
    }, block)

    const restoreCall = session.setBlockTranslationState.mock.calls.find((call) => call[0] === block.id)
    expect(restoreCall).toBeDefined()
    expect(restoreCall[1].translatedText).toBe('درآمد ۱۲٫۵ میلیارد')
    expect(restoreCall[1].translatedCells).toBeUndefined()
    expect(restoreCall[1].provider).toBe('googlev2')
    expect(restoreCall[1].sourceLanguage).toBe('en')
    expect(restoreCall[1].targetLanguage).toBe('fa')
    expect(restoreCall[1].sourceTextHash).toBe(block.sourceTextHash)
    expect(controller.restoredTranslationCount.value).toBe(1)
  })

  it('restores structured translatedCells cache entries', async () => {
    const block = createBlock()
    const structuredCell = {
      id: 'cell-1',
      regionId: 'region-1',
      rowIndex: 0,
      columnIndex: 0,
      rowSpan: 1,
      colSpan: 1,
      spanType: 'none',
      role: 'value',
      text: 'Revenue',
      boundingBox: { x: 60, y: 120, width: 120, height: 18 },
      sourceReferences: {
        blockIds: ['block-a'],
        lineIds: [],
        sourceLineIndices: [0],
        sourceItemIndices: [0],
        groupRegionIds: []
      },
      blockIds: ['block-a'],
      lineIds: [],
      sourceLineIndex: 0,
      sourceItemIndex: 0,
      spanCandidate: false,
      estimatedRowSpan: 1,
      estimatedColSpan: 1,
      confidence: 0.9
    }

    await loadControllerWithCacheEntry({
      blockId: block.id,
      translatedText: 'درآمد',
      translatedCells: [
        {
          lineIndex: 0,
          cells: ['درآمد'],
          structuredCells: [structuredCell]
        }
      ],
      sourceTextHash: block.sourceTextHash,
      translationSettingsHash: await sha256HexFromText(JSON.stringify({
        provider: 'googlev2',
        sourceLanguage: 'auto',
        targetLanguage: 'fa',
        optimizationLevel: 3
      })),
      provider: 'googlev2',
      sourceLanguage: 'auto',
      targetLanguage: 'fa'
    }, block)

    const restoreCall = session.setBlockTranslationState.mock.calls.find((call) => call[0] === block.id)
    expect(restoreCall).toBeDefined()
    expect(restoreCall[1].translatedCells).toHaveLength(1)
    expect(restoreCall[1].translatedCells[0].structuredCells[0]).toEqual(structuredCell)
    expect(restoreCall[1].translatedText).toBe('درآمد')
  })

  it('ignores invalid structuredCells but still restores translatedText when safe', async () => {
    const block = createBlock()

    await loadControllerWithCacheEntry({
      blockId: block.id,
      translatedText: 'درآمد',
      translatedCells: [
        {
          lineIndex: 0,
          cells: ['درآمد'],
          structuredCells: [
            { id: 'broken-cell', boundingBox: null }
          ]
        }
      ],
      sourceTextHash: block.sourceTextHash,
      provider: 'googlev2',
      sourceLanguage: 'auto',
      targetLanguage: 'fa'
    }, block)

    const restoreCall = session.setBlockTranslationState.mock.calls.find((call) => call[0] === block.id)
    expect(restoreCall).toBeDefined()
    expect(restoreCall[1].translatedText).toBe('درآمد')
    expect(restoreCall[1].translatedCells).toBeUndefined()
  })

  it('skips stale restores when sourceTextHash does not match', async () => {
    const block = createBlock()

    await loadControllerWithCacheEntry({
      blockId: block.id,
      translatedText: 'درآمد',
      sourceTextHash: 'wrong-hash',
      provider: 'googlev2',
      sourceLanguage: 'auto',
      targetLanguage: 'fa'
    }, block)

    expect(session.setBlockTranslationState).not.toHaveBeenCalled()
  })

  it('skips stale restores when translationSettingsHash does not match', async () => {
    const block = createBlock()

    await loadControllerWithCacheEntry({
      blockId: block.id,
      translatedText: 'درآمد',
      sourceTextHash: block.sourceTextHash,
      translationSettingsHash: 'old-settings-hash',
      provider: 'googlev2',
      sourceLanguage: 'auto',
      targetLanguage: 'fa'
    }, block)

    expect(session.setBlockTranslationState).not.toHaveBeenCalled()
  })

  it('saves translatedCells and translationSettingsHash to cache', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    session.translationStates.set(block.id, {
      blockId: block.id,
      pageNumber: 1,
      translatedText: 'درآمد',
      translatedCells: [
        {
          lineIndex: 0,
          cells: ['درآمد'],
          structuredCells: [
            {
              id: 'cell-2',
              regionId: 'region-2',
              rowIndex: 0,
              columnIndex: 0,
              rowSpan: 1,
              colSpan: 1,
              spanType: 'none',
              role: 'value',
              text: 'Revenue',
              boundingBox: { x: 60, y: 120, width: 120, height: 18 },
              sourceReferences: {
                blockIds: ['block-a'],
                lineIds: [],
                sourceLineIndices: [0],
                sourceItemIndices: [0],
                groupRegionIds: []
              },
              blockIds: ['block-a'],
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
      status: 'translated',
      provider: 'googlev2',
      sourceLanguage: 'auto',
      targetLanguage: 'fa',
      sourceTextHash: block.sourceTextHash,
      updatedAt: 123
    })

    translateVisibleBlocksMock.mockResolvedValue({
      status: 'translated',
      translatedCount: 1,
      failedCount: 0,
      totalCount: 1
    })

    session.getVisibleLogicalBlocks.mockResolvedValue([block])
    session.getPageLayout.mockReturnValue(null)

    await controller.translateVisiblePages()

    expect(saveTranslationsMock).toHaveBeenCalledTimes(1)
    const [documentIdentity, entries] = saveTranslationsMock.mock.calls[0]
    expect(documentIdentity).toBe('doc-1')
    expect(entries[block.id].translatedCells).toHaveLength(1)
    expect(entries[block.id].translatedCells[0].structuredCells[0].id).toBe('cell-2')
    expect(entries[block.id].translationSettingsHash).toHaveLength(64)
  })
})
