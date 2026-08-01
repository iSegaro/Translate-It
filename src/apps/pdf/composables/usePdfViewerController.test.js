import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sha256HexFromText } from '@/features/pdf-translation/core/PdfBlockIdentity.js'
import { AUTO_DETECT_VALUE, DEFAULT_TARGET_LANGUAGE } from '@/shared/constants/core.js'

const openFileMock = vi.fn()
const rebuildPageMetricsMock = vi.fn()
const cleanupDocumentMock = vi.fn().mockResolvedValue()
const cancelActiveTranslationMock = vi.fn().mockResolvedValue()
const translateVisibleBlocksMock = vi.fn()
const saveTranslationsMock = vi.fn().mockResolvedValue()
const clearDocumentCacheMock = vi.fn().mockResolvedValue()
const updateAfterOpenMock = vi.fn().mockResolvedValue()
const updateAfterTranslationMock = vi.fn().mockResolvedValue()
const getProviderOptimizationLevelAsyncMock = vi.fn()
const getSourceLanguageAsyncMock = vi.fn()
const getTargetLanguageAsyncMock = vi.fn()
const getTranslationApiAsyncMock = vi.fn()
const getEffectiveProviderAsyncMock = vi.fn()

const resetTranslationStatesMock = vi.fn()
const clearRenderedPageCacheMock = vi.fn()
const invalidateDocumentCacheSnapshotMock = vi.fn()

const session = {
  openFile: openFileMock,
  rebuildPageMetrics: rebuildPageMetricsMock,
  cleanupDocument: cleanupDocumentMock,
  documentIdentity: 'doc-1',
  pdfFingerprint: 'fingerprint-1',
  pageSessions: new Map(),
  translationStates: new Map(),
  resetTranslationStates: resetTranslationStatesMock,
  clearRenderedPageCache: clearRenderedPageCacheMock,
  invalidateDocumentCacheSnapshot: invalidateDocumentCacheSnapshotMock,
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
  hasAnyTranslatedBlocks: vi.fn(() => [...session.translationStates.values()].some((state) => state.status === 'translated')),
  getTranslatedBlockPersistenceRecords: vi.fn(() => [...session.translationStates]
    .filter(([, state]) => state.status === 'translated')
    .map(([blockId, state]) => ({
      blockId,
      pageNumber: state.pageNumber || 0,
      translatedText: state.translatedText || '',
      translatedCells: state.translatedCells || null,
      status: 'translated',
      provider: state.provider || '',
      sourceLanguage: state.sourceLanguage || '',
      targetLanguage: state.targetLanguage || '',
      sourceTextHash: state.sourceTextHash || '',
      updatedAt: state.updatedAt || 0
    }))),
  getPageLayout: vi.fn().mockReturnValue(null),
  getPageSession: vi.fn(),
  getPageSourceBlocks: vi.fn((pageNumber) => session.pageSessions.get(pageNumber)?.getLogicalBlocks?.() || []),
  forEachCommittedPage: vi.fn((callback) => {
    for (const pageNumber of [...session.pageSessions.keys()].sort((a, b) => a - b)) {
      callback(pageNumber)
    }
  }),
  onPageSessionCommitted: vi.fn(),
  documentGeneration: 1,
  visiblePageNumbers: new Set(),
  getVisibleLogicalBlocks: vi.fn().mockResolvedValue([]),
  getDocumentCacheSnapshot: vi.fn().mockResolvedValue({ translations: {}, ocr: {} }),
  findSourceBlock: vi.fn((blockId) => {
    for (const [, pageSession] of session.pageSessions) {
      for (const block of pageSession.allBlocks) {
        if (block.id === blockId) return block
      }
    }
    return null
  }),
  setPageOcrBlocks: vi.fn()
}

vi.mock('@/shared/config/config.js', () => ({
  TranslationMode: {
    PDF: 'pdf-translation',
    Selection: 'selection-manager',
    Select_Element: 'select-element',
    Field: 'field',
    Page: 'page-translation-batch',
    Dictionary_Translation: 'dictionary'
  },
  getProviderOptimizationLevelAsync: getProviderOptimizationLevelAsyncMock,
  getSourceLanguageAsync: getSourceLanguageAsyncMock,
  getTargetLanguageAsync: getTargetLanguageAsyncMock,
  getTranslationApiAsync: getTranslationApiAsyncMock,
  getEffectiveProviderAsync: getEffectiveProviderAsyncMock
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
    clearDocument: clearDocumentCacheMock,
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

function createOpenState() {
  return {
    fileName: 'doc.pdf',
    displayName: 'doc.pdf',
    totalPages: 1,
    pageMetrics: [{ pageNumber: 1, width: 600, height: 800, scale: 1 }],
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

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

async function createSettingsHash({ provider = 'googlev2', sourceLanguage = 'auto', targetLanguage = 'fa', optimizationLevel = 3 } = {}) {
  return sha256HexFromText(JSON.stringify({
    provider,
    sourceLanguage,
    targetLanguage,
    optimizationLevel
  }))
}

async function loadControllerWithCacheEntry(cacheEntry, block = createBlock()) {
  session.getDocumentCacheSnapshot.mockResolvedValue({
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

describe('usePdfViewerController pdf translation preferences', () => {
  beforeEach(() => {
    openFileMock.mockReset()
    rebuildPageMetricsMock.mockReset()
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
    getEffectiveProviderAsyncMock.mockReset().mockResolvedValue('googlev2')

    session.pageSessions = new Map()
    session.translationStates = new Map()
    session.documentIdentity = 'doc-1'
    session.documentGeneration = 1
    session.visiblePageNumbers = new Set()
    session.getPageSession.mockReset()
    session.getPageSourceBlocks.mockClear()
    session.forEachCommittedPage.mockClear()
    session.onPageSessionCommitted.mockClear()
    session.getDocumentCacheSnapshot.mockReset().mockResolvedValue({ translations: {}, ocr: {} })
    session.setBlockTranslationState.mockClear()
    session.getBlockTranslationState.mockClear()
    session.setPageOcrBlocks.mockClear()
  })

  it('initializes pdfSourceLanguage to AUTO_DETECT_VALUE', () => {
    const controller = usePdfViewerController()
    expect(controller.pdfSourceLanguage.value).toBe(AUTO_DETECT_VALUE)
  })

  it('initializes pdfTargetLanguage to DEFAULT_TARGET_LANGUAGE', () => {
    const controller = usePdfViewerController()
    expect(controller.pdfTargetLanguage.value).toBe(DEFAULT_TARGET_LANGUAGE)
  })

  it('allows independent language values per controller instance', () => {
    const controller1 = usePdfViewerController()
    const controller2 = usePdfViewerController()

    controller1.pdfSourceLanguage.value = 'en'
    controller1.pdfTargetLanguage.value = 'de'

    expect(controller2.pdfSourceLanguage.value).toBe(AUTO_DETECT_VALUE)
    expect(controller2.pdfTargetLanguage.value).toBe(DEFAULT_TARGET_LANGUAGE)
  })
})

describe('usePdfViewerController cache persistence', () => {
  beforeEach(() => {
    openFileMock.mockReset()
    rebuildPageMetricsMock.mockReset()
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
    getEffectiveProviderAsyncMock.mockReset().mockResolvedValue('googlev2')

    session.pageSessions = new Map()
    session.translationStates = new Map()
    session.documentIdentity = 'doc-1'
    session.documentGeneration = 1
    session.visiblePageNumbers = new Set()
    session.getPageSession.mockReset()
    session.getPageSourceBlocks.mockClear()
    session.forEachCommittedPage.mockClear()
    session.onPageSessionCommitted.mockClear()
    session.getDocumentCacheSnapshot.mockReset().mockResolvedValue({ translations: {}, ocr: {} })
    session.setBlockTranslationState.mockClear()
    session.getBlockTranslationState.mockClear()
    session.setPageOcrBlocks.mockClear()
  })

  it('does not restore cached translations during document load', async () => {
    const block = createBlock()
    await loadControllerWithCacheEntry({
      blockId: block.id,
      translatedText: 'درآمد ۱۲٫۵ میلیارد',
      sourceTextHash: block.sourceTextHash,
      translationSettingsHash: await createSettingsHash(),
      provider: 'googlev2',
      sourceLanguage: 'auto',
      targetLanguage: 'fa'
    }, block)

    const restoreCall = session.setBlockTranslationState.mock.calls.find((call) => call[0] === block.id)
    expect(restoreCall).toBeUndefined()
  })

  it('does not restore OCR from the controller cache path', async () => {
    session.getDocumentCacheSnapshot.mockResolvedValue({
      translations: {},
      ocr: {
        1: {
          pageNumber: 1,
          ocrLanguage: 'eng',
          ocrBlocks: [{ id: 'ocr-1', text: 'cached', pageNumber: 1 }]
        }
      }
    })
    session.pageSessions = new Map([
      [1, {
        allBlocks: [],
        getLogicalBlocks: () => [],
        hasOcrForLanguage: vi.fn(() => false)
      }]
    ])
    openFileMock.mockResolvedValue(createOpenState())

    const controller = usePdfViewerController()
    await controller.loadPdfFile({ type: 'application/pdf', name: 'doc.pdf', arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) }, 800)

    expect(session.setPageOcrBlocks).not.toHaveBeenCalled()
  })

  it('does not register deferred translation restoration', async () => {
    const block = createBlock()
    await loadControllerWithCacheEntry({
      blockId: block.id,
      translatedText: 'درآمد',
      sourceTextHash: block.sourceTextHash,
      translationSettingsHash: await createSettingsHash(),
      provider: 'googlev2', sourceLanguage: 'auto', targetLanguage: 'fa'
    }, block)

    expect(session.onPageSessionCommitted).not.toHaveBeenCalled()
    expect(session.setBlockTranslationState).not.toHaveBeenCalled()
  })

  it('keeps completed translations in memory without persistence', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    translateVisibleBlocksMock.mockResolvedValue({
      status: 'translated',
      translatedCount: 1,
      failedCount: 0,
      totalCount: 1
    })

    session.getVisibleLogicalBlocks.mockResolvedValue([block])
    session.getPageLayout.mockReturnValue(null)

    await controller.translateVisiblePages()

    expect(controller.translationSummary.value).toMatchObject({ status: 'translated', translatedCount: 1 })
    expect(updateAfterTranslationMock).toHaveBeenCalledWith(session)
    expect(saveTranslationsMock).not.toHaveBeenCalled()
  })

  it('forwards the layout object to openFile and recomputeLayout', async () => {
    openFileMock.mockResolvedValue(createOpenState())
    rebuildPageMetricsMock.mockResolvedValue(createOpenState())
    session.getDocumentCacheSnapshot.mockResolvedValue({
      translations: {},
      ocr: {}
    })

    const controller = usePdfViewerController()
    const file = {
      type: 'application/pdf',
      name: 'doc.pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
    }

    await controller.loadPdfFile(file, {
      width: 800,
      height: 600,
      zoomMode: 'fit-page',
      zoomPercent: 100
    })

    expect(openFileMock).toHaveBeenCalledWith({ name: 'doc.pdf', buffer: expect.any(ArrayBuffer) }, {
      width: 800,
      height: 600,
      zoomMode: 'fit-page',
      zoomPercent: 100
    })

    await controller.recomputeLayout({
      width: 900,
      height: 700,
      zoomMode: 'percent',
      zoomPercent: 125
    })

    expect(rebuildPageMetricsMock).toHaveBeenCalledWith({
      width: 900,
      height: 700,
      zoomMode: 'percent',
      zoomPercent: 125
    })
  })

  it('preserves existing page blocks when layout rebuild sees a released session', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    expect(controller.translatedPageData.value[0].blocks).toHaveLength(1)

    session.pageSessions.set(1, {
      allBlocks: [],
      getLogicalBlocks: () => []
    })
    rebuildPageMetricsMock.mockResolvedValue({
      ...createOpenState(),
      pageMetrics: [{ pageNumber: 1, width: 720, height: 900, scale: 1.2 }]
    })

    await controller.recomputeLayout({ width: 900, height: 700 })

    const [page] = controller.translatedPageData.value
    expect(page.blocks).toHaveLength(1)
    expect(page.blocks[0].id).toBe(block.id)
  })

  it('keeps translated block state exposed after release and layout rebuild', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)
    session.translationStates.set(block.id, {
      blockId: block.id,
      status: 'translated',
      translatedText: 'ترجمه',
      sourceTextHash: block.sourceTextHash
    })
    // Simulate normal state-propagation (_updateBlockStates refreshes
    // block.translationState from session after translation completes).
    // Block retains this state across zoom since _rebuildPageData is
    // no longer called during geometry-only updates.
    const preZoomBlocks = controller.translatedPageData.value[0].blocks
    preZoomBlocks[0].translationState = session.getBlockTranslationState(block.id)

    session.pageSessions.set(1, {
      allBlocks: [],
      getLogicalBlocks: () => []
    })
    rebuildPageMetricsMock.mockResolvedValue(createOpenState())

    await controller.recomputeLayout({ width: 900, height: 700 })

    const [page] = controller.translatedPageData.value
    expect(page.blocks).toHaveLength(1)
    expect(page.blocks[0].translationState.status).toBe('translated')
    expect(page.blocks[0].translationState.translatedText).toBe('ترجمه')
  })

  it('rehydrates visible pages with empty app-level blocks', async () => {
    const block = createBlock()
    session.getDocumentCacheSnapshot.mockResolvedValue({ translations: {}, ocr: {} })
    openFileMock.mockResolvedValue(createOpenState())
    session.pageSessions = new Map()
    const hydratedSession = {
      allBlocks: [block],
      getLogicalBlocks: () => [block]
    }
    session.getPageSession.mockImplementation(async () => {
      session.pageSessions.set(1, hydratedSession)
      return hydratedSession
    })

    const controller = usePdfViewerController()
    await controller.loadPdfFile({ type: 'application/pdf', name: 'doc.pdf', arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) }, 800)

    expect(controller.translatedPageData.value[0].blocks).toHaveLength(0)

    await controller.hydrateVisiblePageBlocks(new Set([1]))

    expect(session.getPageSession).toHaveBeenCalledWith(1)
    expect(controller.translatedPageData.value[0].blocks).toHaveLength(1)
    expect(controller.translatedPageData.value[0].blocks[0].id).toBe(block.id)
  })

  it('refreshes only OCR-completed page wrappers from committed sessions without hydration or layout recompute', async () => {
    const pageOneBlock = createBlock({ id: 'ocr-1', sourceTextHash: 'hash-ocr-1' })
    const pageTwoBlock = { ...createBlock({ id: 'text-2', sourceTextHash: 'hash-text-2' }), pageNumber: 2 }
    session.getDocumentCacheSnapshot.mockResolvedValue({ translations: {}, ocr: {} })
    session.pageSessions = new Map([
      [2, { allBlocks: [pageTwoBlock], getLogicalBlocks: () => [pageTwoBlock] }]
    ])
    openFileMock.mockResolvedValue({
      ...createOpenState(),
      totalPages: 2,
      pageMetrics: [
        { pageNumber: 1, width: 600, height: 800, scale: 1 },
        { pageNumber: 2, width: 620, height: 820, scale: 1 }
      ]
    })

    const controller = usePdfViewerController()
    await controller.loadPdfFile({ type: 'application/pdf', name: 'doc.pdf', arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) }, 800)
    const originalPageData = controller.translatedPageData.value
    const unaffectedPage = originalPageData.find((page) => page.pageNumber === 2)

    expect(originalPageData.find((page) => page.pageNumber === 1).blocks).toHaveLength(0)
    session.translationStates.set(pageOneBlock.id, {
      blockId: pageOneBlock.id,
      status: 'translated',
      translatedText: 'ترجمه OCR',
      sourceTextHash: pageOneBlock.sourceTextHash
    })
    session.pageSessions.set(1, { allBlocks: [pageOneBlock], getLogicalBlocks: () => [pageOneBlock] })
    session.pageSessions.set(3, { allBlocks: [{ ...pageOneBlock, id: 'orphan-3', pageNumber: 3 }], getLogicalBlocks: () => [{ ...pageOneBlock, id: 'orphan-3', pageNumber: 3 }] })

    const changed = controller.refreshTranslatedPageBlocks([1, 1, 3, 999])

    expect(changed).toBe(true)
    expect(controller.translatedPageData.value).not.toBe(originalPageData)
    expect(controller.translatedPageData.value.find((page) => page.pageNumber === 1).blocks[0]).toEqual(expect.objectContaining({
      id: pageOneBlock.id,
      text: pageOneBlock.text,
      translationState: expect.objectContaining({ translatedText: 'ترجمه OCR' })
    }))
    expect(controller.translatedPageData.value.map((page) => page.pageNumber)).toEqual([1, 2])
    expect(controller.translatedPageData.value.find((page) => page.pageNumber === 2)).toBe(unaffectedPage)
    expect(session.getPageSession).not.toHaveBeenCalled()
    expect(rebuildPageMetricsMock).not.toHaveBeenCalled()
  })
})

describe('usePdfViewerController error lifecycle', () => {
  beforeEach(() => {
    openFileMock.mockReset()
    rebuildPageMetricsMock.mockReset()
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
    getEffectiveProviderAsyncMock.mockReset().mockResolvedValue('googlev2')

    session.pageSessions = new Map()
    session.translationStates = new Map()
    session.documentIdentity = 'doc-1'
    session.documentGeneration = 1
    session.visiblePageNumbers = new Set()
    session.getPageSession.mockReset()
    session.setBlockTranslationState.mockClear()
    session.getBlockTranslationState.mockClear()
  })

  it('clears stale error before translation retry', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    controller.error.value = 'Stale error'

    translateVisibleBlocksMock.mockImplementation(async () => {
      expect(controller.error.value).toBe('')
      return {
        status: 'translated',
        translatedCount: 0,
        failedCount: 0,
        totalCount: 0
      }
    })

    session.getVisibleLogicalBlocks.mockResolvedValue([block])
    session.getPageLayout.mockReturnValue(null)

    await controller.translateVisiblePages()

    expect(controller.error.value).toBe('')
  })

  it('ignores duplicate translation requests without clearing active loading state', async () => {
    const block = createBlock()
    const translation = createDeferred()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    translateVisibleBlocksMock.mockReturnValueOnce(translation.promise)
    session.getVisibleLogicalBlocks.mockResolvedValue([block])
    session.getPageLayout.mockReturnValue(null)

    const firstRequest = controller.translateVisiblePages()

    expect(controller.isTranslating.value).toBe(true)
    await vi.waitFor(() => expect(translateVisibleBlocksMock).toHaveBeenCalledTimes(1))

    const duplicateResult = await controller.translateVisiblePages()

    expect(duplicateResult).toBe(false)
    expect(translateVisibleBlocksMock).toHaveBeenCalledTimes(1)
    expect(controller.isTranslating.value).toBe(true)

    translation.resolve({
      status: 'translated',
      translatedCount: 1,
      failedCount: 0,
      totalCount: 1
    })

    await firstRequest

    expect(controller.isTranslating.value).toBe(false)
  })

  it('keeps translation failure on translationSummary after clearing stale error', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    controller.error.value = 'Stale error'

    translateVisibleBlocksMock.mockRejectedValue(new Error('Translation failed'))

    session.getVisibleLogicalBlocks.mockResolvedValue([block])
    session.getPageLayout.mockReturnValue(null)

    await controller.translateVisiblePages()

    expect(controller.error.value).toBe('')
    expect(controller.translationSummary.value).toMatchObject({
      status: 'error',
      error: 'Translation failed'
    })
  })

  it('keeps partial translation error on translationSummary', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    translateVisibleBlocksMock.mockResolvedValue({
      status: 'partial',
      translatedCount: 5,
      failedCount: 3,
      totalCount: 8,
      error: 'Provider failed: quota exceeded'
    })

    session.getVisibleLogicalBlocks.mockResolvedValue([block])
    session.getPageLayout.mockReturnValue(null)

    await controller.translateVisiblePages()

    expect(controller.error.value).toBe('')
    expect(controller.translationSummary.value.error).toBe('Provider failed: quota exceeded')
  })

  it('clears previous error on successful translation run', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    translateVisibleBlocksMock
      .mockRejectedValueOnce(new Error('Previous failure'))
      .mockResolvedValueOnce({
        status: 'translated',
        translatedCount: 1,
        failedCount: 0,
        totalCount: 1,
        error: ''
      })

    session.getVisibleLogicalBlocks.mockResolvedValue([block])
    session.getPageLayout.mockReturnValue(null)

    await controller.translateVisiblePages()
    expect(controller.error.value).toBe('')
    expect(controller.translationSummary.value.error).toBe('Previous failure')

    await controller.translateVisiblePages()
    expect(controller.error.value).toBe('')
  })

  it('sets empty error for partial summary without provider error', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    translateVisibleBlocksMock.mockResolvedValue({
      status: 'partial',
      translatedCount: 5,
      failedCount: 3,
      totalCount: 8,
      error: ''
    })

    session.getVisibleLogicalBlocks.mockResolvedValue([block])
    session.getPageLayout.mockReturnValue(null)

    await controller.translateVisiblePages()

    expect(controller.error.value).toBe('')
  })

  it('clears stale error before recomputeLayout', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    controller.error.value = 'Stale error'

    rebuildPageMetricsMock.mockImplementation(async () => {
      expect(controller.error.value).toBe('')
      return createOpenState()
    })

    await controller.recomputeLayout({ width: 800, height: 600 })

    expect(controller.error.value).toBe('')
  })

  it('sets error when recomputeLayout fails after clearing stale error', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    controller.error.value = 'Stale error'

    rebuildPageMetricsMock.mockRejectedValue(new Error('Layout failed'))

    await controller.recomputeLayout({ width: 800, height: 600 })

    expect(controller.error.value).toBe('Layout failed')
  })
})

describe('usePdfViewerController translation language resolution', () => {
  beforeEach(() => {
    openFileMock.mockReset()
    rebuildPageMetricsMock.mockReset()
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
    session.documentGeneration = 1
    session.visiblePageNumbers = new Set()
    session.getPageSession.mockReset()
    session.getPageSourceBlocks.mockClear()
    session.forEachCommittedPage.mockClear()
    session.onPageSessionCommitted.mockClear()
    session.getDocumentCacheSnapshot.mockReset().mockResolvedValue({ translations: {}, ocr: {} })
    session.setBlockTranslationState.mockClear()
    session.getBlockTranslationState.mockClear()
    session.setPageOcrBlocks.mockClear()
    session.getPageLayout = vi.fn().mockReturnValue(null)
    session.getVisibleLogicalBlocks = vi.fn().mockResolvedValue([])
  })

  it('passes pdfSourceLanguage to translateVisibleBlocks', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    controller.pdfSourceLanguage.value = 'de'
    controller.pdfTargetLanguage.value = 'fa'

    translateVisibleBlocksMock.mockResolvedValue({
      status: 'translated',
      translatedCount: 1,
      failedCount: 0,
      totalCount: 1
    })

    session.getVisibleLogicalBlocks.mockResolvedValue([block])

    await controller.translateVisiblePages()

    expect(translateVisibleBlocksMock).toHaveBeenCalledWith(expect.objectContaining({
      sourceLanguage: 'de',
      targetLanguage: 'fa',
      translationIntent: expect.objectContaining({
        provider: 'googlev2',
        optimizationLevel: 3,
        translationSettingsHash: expect.any(String)
      })
    }))
  })

  it('passes pdfTargetLanguage to translateVisibleBlocks', async () => {
    const block = createBlock()
    const { controller } = await loadControllerWithCacheEntry(null, block)

    controller.pdfSourceLanguage.value = 'auto'
    controller.pdfTargetLanguage.value = 'fr'

    translateVisibleBlocksMock.mockResolvedValue({
      status: 'translated',
      translatedCount: 1,
      failedCount: 0,
      totalCount: 1
    })

    session.getVisibleLogicalBlocks.mockResolvedValue([block])

    await controller.translateVisiblePages()

    expect(translateVisibleBlocksMock).toHaveBeenCalledWith(expect.objectContaining({
      sourceLanguage: 'auto',
      targetLanguage: 'fr',
      translationIntent: expect.objectContaining({
        provider: 'googlev2',
        optimizationLevel: 3,
        translationSettingsHash: expect.any(String)
      })
    }))
  })
})

describe('usePdfViewerController hasTranslationContent', () => {
  beforeEach(() => {
    openFileMock.mockReset()
    rebuildPageMetricsMock.mockReset()
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
    session.documentGeneration = 1
    session.getPageSourceBlocks = vi.fn(() => [])
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
  })

  async function loadControllerWithBlocks(blocks) {
    session.pageSessions = new Map([[1, {
      allBlocks: blocks,
      getLogicalBlocks: () => blocks
    }]])
    session.getPageSourceBlocks = vi.fn((pageNumber) => session.pageSessions.get(pageNumber)?.getLogicalBlocks?.() || [])
    openFileMock.mockResolvedValue(createOpenState())
    const controller = usePdfViewerController()
    const file = {
      type: 'application/pdf',
      name: 'doc.pdf',
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
    }
    await controller.loadPdfFile(file, 800)
    return controller
  }

  it('returns false when page has no blocks and no translations', async () => {
    const controller = await loadControllerWithBlocks([])
    expect(controller.hasTranslationContent.value).toBe(false)
  })

  it('returns true after OCR populates page blocks', async () => {
    const controller = await loadControllerWithBlocks([])
    expect(controller.hasTranslationContent.value).toBe(false)

    const blocks = [createBlock()]
    session.pageSessions.set(1, {
      allBlocks: blocks,
      getLogicalBlocks: () => blocks
    })
    session.getPageSourceBlocks = vi.fn(() => blocks)
    controller.refreshTranslatedPageBlocks([1])
    controller.translationTick.value += 1

    expect(controller.hasTranslationContent.value).toBe(true)
  })

  it('returns false when OCR completes without producing blocks', async () => {
    const controller = await loadControllerWithBlocks([])
    expect(controller.hasTranslationContent.value).toBe(false)

    session.getPageSourceBlocks = vi.fn(() => [])
    controller.refreshTranslatedPageBlocks([1])
    controller.translationTick.value += 1

    expect(controller.hasTranslationContent.value).toBe(false)
  })

  it('returns true when blocks exist regardless of translation status', async () => {
    const controller = await loadControllerWithBlocks([createBlock()])
    expect(controller.hasTranslationContent.value).toBe(true)
  })

  it('returns true when translationStates has translated entries', async () => {
    const block = createBlock()
    const controller = await loadControllerWithBlocks([block])

    session.setBlockTranslationState(block.id, { status: 'translated', translatedText: 'Hola' })
    controller.translationTick.value += 1

    expect(controller.hasTranslationContent.value).toBe(true)
  })
})

describe('clearDocumentCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.documentIdentity = 'doc-1'
  })

  it('clears persistent storage, bitmap cache, translation state, and UI overlay', async () => {
    const controller = usePdfViewerController()

    await controller.clearDocumentCache()

    expect(clearDocumentCacheMock).toHaveBeenCalledWith('doc-1')
    expect(clearRenderedPageCacheMock).toHaveBeenCalled()
    expect(invalidateDocumentCacheSnapshotMock).toHaveBeenCalled()
    expect(resetTranslationStatesMock).toHaveBeenCalled()
  })

  it('early exits when documentIdentity is falsy', async () => {
    session.documentIdentity = ''
    const controller = usePdfViewerController()

    await controller.clearDocumentCache()

    expect(clearDocumentCacheMock).not.toHaveBeenCalled()
    expect(clearRenderedPageCacheMock).not.toHaveBeenCalled()
    expect(resetTranslationStatesMock).not.toHaveBeenCalled()
  })
})

describe('openPdfUrl', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fetches a URL and opens the document in the session', async () => {
    const buffer = new ArrayBuffer(8)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      arrayBuffer: () => Promise.resolve(buffer),
    })

    openFileMock.mockResolvedValue(createOpenState())
    const controller = usePdfViewerController()

    const result = await controller.openPdfUrl('https://example.com/doc.pdf', 800)

    expect(result).toBe(true)
    expect(controller.loadFailure.value).toBeNull()
    expect(openFileMock).toHaveBeenCalledWith(
      { name: 'doc.pdf', buffer: expect.any(ArrayBuffer) },
      800,
    )
  })

  it('returns false and resets state on fetch failure', async () => {
    let controller
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      expect(controller.loadFailure.value).toBeNull()
      throw new TypeError('NetworkError')
    })

    controller = usePdfViewerController()
    controller.loadFailure.value = Object.freeze({ kind: 'TIMEOUT', details: Object.freeze({}) })

    const result = await controller.openPdfUrl('https://example.com/doc.pdf', 800)

    expect(result).toBe(false)
    expect(controller.error.value).toBe('NetworkError')
    expect(controller.loadFailure.value).toEqual({ kind: 'UNEXPECTED', details: {} })
  })

  it('returns false for empty URL', async () => {
    const controller = usePdfViewerController()

    const result = await controller.openPdfUrl('', 800)

    expect(result).toBe(false)
  })

  it('returns false, sets error, resets loading, and cleans up after timeout', async () => {
    vi.useFakeTimers()
    cleanupDocumentMock.mockReset().mockResolvedValue()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason))
    }))
    const controller = usePdfViewerController()

    const load = controller.openPdfUrl('https://example.com/doc.pdf', 800)
    await vi.advanceTimersByTimeAsync(30_000)

    await expect(load).resolves.toBe(false)
    expect(controller.error.value).toBe('Opening the PDF link timed out.')
    expect(controller.loadFailure.value).toEqual({ kind: 'TIMEOUT', details: {} })
    expect(controller.isLoading.value).toBe(false)
    expect(cleanupDocumentMock).toHaveBeenCalledOnce()
  })

  it('returns false when timeout cleanup fails', async () => {
    vi.useFakeTimers()
    cleanupDocumentMock.mockReset().mockRejectedValueOnce(new Error('Cleanup failed'))
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason))
    }))
    const controller = usePdfViewerController()

    const load = controller.openPdfUrl('https://example.com/doc.pdf', 800)
    await vi.advanceTimersByTimeAsync(30_000)

    await expect(load).resolves.toBe(false)
    expect(cleanupDocumentMock).toHaveBeenCalledOnce()
  })

  it('opens successfully after a timeout', async () => {
    vi.useFakeTimers()
    cleanupDocumentMock.mockReset().mockResolvedValue()
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce((_url, { signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      }))
      .mockResolvedValueOnce({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })
    openFileMock.mockReset().mockResolvedValue(createOpenState())
    const controller = usePdfViewerController()

    const timedOutLoad = controller.openPdfUrl('https://example.com/timeout.pdf', 800)
    await vi.advanceTimersByTimeAsync(30_000)

    await expect(timedOutLoad).resolves.toBe(false)
    await expect(controller.openPdfUrl('https://example.com/retry.pdf', 800)).resolves.toBe(true)
    expect(controller.error.value).toBe('')
    expect(controller.isLoading.value).toBe(false)
  })
})
