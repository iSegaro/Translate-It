import { computed, reactive, ref, shallowRef } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { getProviderOptimizationLevelAsync, getSourceLanguageAsync, getTargetLanguageAsync, getTranslationApiAsync } from '@/shared/config/config.js'
import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'
import { PdfTranslationCoordinator } from '@/features/pdf-translation/core/PdfTranslationCoordinator.js'
import { pdfCacheManager } from '@/features/pdf-translation/core/PdfCacheManager.js'
import { pdfHistoryManager } from '@/features/pdf-translation/core/PdfHistoryManager.js'
import { sha256HexFromText } from '@/features/pdf-translation/core/PdfBlockIdentity.js'
import { restoreCachedPdfTranslations, normalizeStructuredCells } from '@/features/pdf-translation/core/PdfTranslationCacheRestore.js'
import { createTranslationRestoreContext } from '@/features/pdf-translation/core/PdfTranslationRestoreContext.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfViewerController')
const pdfTranslationCoordinator = new PdfTranslationCoordinator(pdfDocumentSession)

async function resolveTranslationSettings() {
  const [provider, sourceLanguage, targetLanguage] = await Promise.all([
    getTranslationApiAsync(),
    getSourceLanguageAsync(),
    getTargetLanguageAsync()
  ])

  const optimizationLevel = await getProviderOptimizationLevelAsync(provider)

  return {
    provider,
    sourceLanguage,
    targetLanguage,
    optimizationLevel
  }
}

async function buildTranslationSettings() {
  const settings = await resolveTranslationSettings()
  const translationSettingsHash = await sha256HexFromText(JSON.stringify({
    provider: settings.provider || '',
    sourceLanguage: settings.sourceLanguage || '',
    targetLanguage: settings.targetLanguage || '',
    optimizationLevel: settings.optimizationLevel ?? null
  }))

  return {
    ...settings,
    translationSettingsHash
  }
}

export function usePdfViewerController() {
  const currentFile = ref(null)
  const isLoading = ref(false)
  const error = ref('')
  const fileName = ref('')
  const pageCount = ref(0)
  const workerLabel = ref('')
  const pdfFingerprint = ref('')
  const pageMetrics = ref([])
  const isTranslating = ref(false)
  const translationSummary = ref({
    status: 'idle',
    translatedCount: 0,
    failedCount: 0,
    totalCount: 0,
    translationOccurrenceId: 0
  })
  const translationTick = ref(0)
  const restoredTranslationCount = ref(0)
  const restoredOcrPageCount = ref(0)

  const _pageDataMap = reactive(new Map())

  const _translatedPageData = shallowRef([])

  const _blockIndex = new Map()

  const _pageMetricIndex = new Map()
  let translationRestoreContext = null
  let unsubscribePageSessionCommitted = null
  let disposed = false

  function createRestoreContext() {
    translationRestoreContext?.dispose?.()
    translationRestoreContext = createTranslationRestoreContext({
      documentGeneration: pdfDocumentSession.documentGeneration,
      getDocumentGeneration: () => pdfDocumentSession.documentGeneration,
      resolveSettings: buildTranslationSettings
    })
    return translationRestoreContext
  }

  function ensurePageSessionCommitSubscription() {
    if (unsubscribePageSessionCommitted || typeof pdfDocumentSession.onPageSessionCommitted !== 'function') return

    unsubscribePageSessionCommitted = pdfDocumentSession.onPageSessionCommitted(({ pageNumber }) => restoreCachedTranslationsForPage(pageNumber, translationRestoreContext))
  }

  function _buildBlocksForPage(pageSession) {
    return _buildBlocksForLogicalBlocks(pageSession.getLogicalBlocks())
  }

  function _buildBlocksForLogicalBlocks(logicalBlocks = []) {
    const blocks = []

    for (const block of logicalBlocks) {
      const reactiveBlock = reactive({
        ...block,
        translationState: pdfDocumentSession.getBlockTranslationState(block.id)
      })
      blocks.push(reactiveBlock)
      _blockIndex.set(block.id, reactiveBlock)
    }

    blocks.sort((a, b) => (a.readingOrderIndex ?? 0) - (b.readingOrderIndex ?? 0))
    return blocks
  }

  function _refreshExistingBlocks(blocks = []) {
    for (const block of blocks) {
      if (!block?.id) continue
      block.translationState = pdfDocumentSession.getBlockTranslationState(block.id)
      _blockIndex.set(block.id, block)
    }
    return blocks
  }

  function _resolveBlocksForPageSession(pageSession, existingPage = null) {
    if (pageSession) {
      const blocks = _buildBlocksForPage(pageSession)
      if (blocks.length > 0) return blocks
    }

    if (existingPage?.blocks?.length > 0) {
      return _refreshExistingBlocks(existingPage.blocks)
    }

    return []
  }

  function _buildPageDataForMetric(metric, existingPage = null) {
    const pageSession = pdfDocumentSession.pageSessions.get(metric.pageNumber)
    return reactive({
      pageNumber: metric.pageNumber,
      width: metric.width,
      height: metric.height,
      blocks: _resolveBlocksForPageSession(pageSession, existingPage)
    })
  }

  function _hydratePageBlocks(page, pageSession) {
    if (page.blocks.length > 0) {
      return false
    }

    const logicalBlocks = pageSession.getLogicalBlocks()
    if (logicalBlocks.length === 0) {
      return false
    }

    page.blocks = _buildBlocksForPage(pageSession)
    return true
  }

  function _syncMissingPageSessions() {
    let changed = false
    const pageSessionCount = pdfDocumentSession.pageSessions.size

    if (pageSessionCount === 0) {
      return false
    }

    for (const [pageNumber, pageSession] of pdfDocumentSession.pageSessions) {
      if (!_pageDataMap.has(pageNumber)) {
        const metric = _pageMetricIndex.get(pageNumber)
        _pageDataMap.set(pageNumber, reactive({
          pageNumber,
          width: metric?.width ?? 0,
          height: metric?.height ?? 0,
          blocks: _buildBlocksForPage(pageSession)
        }))
        changed = true
        continue
      }

      if (_hydratePageBlocks(_pageDataMap.get(pageNumber), pageSession)) {
        changed = true
      }
    }

    if (changed) {
      _translatedPageData.value = [..._pageDataMap.values()]
    }

    return changed
  }

  function _updateBlockStates(blockIds = []) {
    if (blockIds.length === 0) return

    for (const blockId of blockIds) {
      const block = _blockIndex.get(blockId)
      if (block) {
        block.translationState = pdfDocumentSession.getBlockTranslationState(blockId)
      }
    }
  }

  function _rebuildPageData() {
    const previousPageData = new Map(_pageDataMap)
    _pageDataMap.clear()
    _blockIndex.clear()
    _pageMetricIndex.clear()

    for (const metric of pageMetrics.value) {
      _pageMetricIndex.set(metric.pageNumber, metric)
      _pageDataMap.set(metric.pageNumber, _buildPageDataForMetric(metric, previousPageData.get(metric.pageNumber)))
    }

    _translatedPageData.value = [..._pageDataMap.values()]
  }

  async function hydrateVisiblePageBlocks(pageNumbers = pdfDocumentSession.visiblePageNumbers) {
    const numbers = [...(pageNumbers || [])]
      .map((pageNumber) => Number(pageNumber))
      .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0)
    if (numbers.length === 0) return false

    let changed = false
    for (const pageNumber of numbers) {
      const page = _pageDataMap.get(pageNumber)
      if (!page || page.blocks.length > 0) continue

      const pageSession = await pdfDocumentSession.getPageSession?.(pageNumber)
      if (pageSession && _hydratePageBlocks(page, pageSession)) {
        changed = true
      }
    }

    if (changed) {
      _translatedPageData.value = [..._pageDataMap.values()]
    }

    return changed
  }

  function refreshTranslatedPageBlocks(pageNumbers = []) {
    const numbers = [...new Set([...(pageNumbers || [])]
      .map((pageNumber) => Number(pageNumber))
      .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0))]
    if (numbers.length === 0) return false

    let changed = false
    for (const pageNumber of numbers) {
      const sourceBlocks = pdfDocumentSession.getPageSourceBlocks?.(pageNumber) || []
      if (sourceBlocks.length === 0) continue

      const page = _pageDataMap.get(pageNumber)
      if (!page) continue

      const previousBlocks = page?.blocks || []
      for (const block of previousBlocks) {
        if (block?.id) _blockIndex.delete(block.id)
      }
      const nextBlocks = _buildBlocksForLogicalBlocks(sourceBlocks)

      page.blocks = nextBlocks
      changed = true
    }

    if (changed) {
      _translatedPageData.value = [..._pageDataMap.values()]
    }

    return changed
  }

  async function restoreCachedTranslationsForPage(pageNumber, context) {
    if (!context?.isCurrent?.() || !context.tryBeginPageRestore(pageNumber)) return

    try {
      const sourceBlocks = pdfDocumentSession.getPageSourceBlocks?.(pageNumber) || []
      if (sourceBlocks.length === 0) return

      const [cache, settings] = await Promise.all([
        pdfDocumentSession.getDocumentCacheSnapshot(),
        context.settingsHashPromise
      ])

      if (!context.isCurrent()) return

      const { restoredBlockIds } = restoreCachedPdfTranslations({
        session: pdfDocumentSession,
        cacheTranslations: cache.translations,
        sourceBlocks,
        settings
      })

      if (!context.isCurrent() || disposed || restoredBlockIds.length === 0) return

      restoredTranslationCount.value += restoredBlockIds.length
      _syncMissingPageSessions()
      _updateBlockStates(restoredBlockIds)
      translationTick.value += 1
      logger.info('Restored PDF translations from cache:', { pageNumber, count: restoredBlockIds.length })
    } catch (cacheError) {
      logger.warn('Failed to restore PDF translations from cache:', { pageNumber, error: cacheError })
    } finally {
      context.finishPageRestore(pageNumber)
    }
  }

  pdfTranslationCoordinator.onStateChange = (updatedBlockIds) => {
    _syncMissingPageSessions()
    _updateBlockStates(updatedBlockIds)
  }

  const hasDocument = computed(() => pageCount.value > 0 && pageMetrics.value.length > 0)
  const canTranslateVisiblePages = computed(() => hasDocument.value && !isLoading.value && !isTranslating.value)
  const workerUrl = computed(() => pdfDocumentSession.workerUrl)

  const translatedPageData = computed(() => _translatedPageData.value)

  const hasTranslationContent = computed(() => {
    translationTick?.value
    for (const state of pdfDocumentSession.translationStates.values()) {
      if (state.status === 'translated') return true
    }
    for (const page of _pageDataMap.values()) {
      if (page.blocks.length > 0) return true
    }
    return false
  })

  function applySessionState(state) {
    fileName.value = state.fileName
    pageCount.value = state.totalPages
    pageMetrics.value = state.pageMetrics
    pdfFingerprint.value = state.pdfFingerprint || ''
    workerLabel.value = state.workerUrl ? 'configured' : 'pending'
    _rebuildPageData()
  }

  function resetLoadedDocument() {
    currentFile.value = null
    fileName.value = ''
    pageCount.value = 0
    workerLabel.value = ''
    pdfFingerprint.value = ''
    pageMetrics.value = []
    translationSummary.value = {
      status: 'idle',
      translatedCount: 0,
      failedCount: 0,
      totalCount: 0,
      translationOccurrenceId: 0
    }
    isTranslating.value = false
    translationTick.value = 0
    restoredTranslationCount.value = 0
    restoredOcrPageCount.value = 0
    _pageDataMap.clear()
    _blockIndex.clear()
    _pageMetricIndex.clear()
    _translatedPageData.value = []
  }

  async function loadPdfFile(file, layoutRequest) {
    if (!file) return false

    if (file.type !== 'application/pdf' && !file.name?.toLowerCase().endsWith('.pdf')) {
      error.value = 'Please choose a valid PDF file.'
      return false
    }

    try {
      disposed = false
      isLoading.value = true
      error.value = ''
      await pdfTranslationCoordinator.cancelActiveTranslation('document-replaced')
      resetLoadedDocument()
      currentFile.value = file

      const nextState = await pdfDocumentSession.openFile(file, layoutRequest)
      const restoreContext = createRestoreContext()
      ensurePageSessionCommitSubscription()
      applySessionState(nextState)

      const restoreTasks = []
      pdfDocumentSession.forEachCommittedPage?.((pageNumber) => {
        restoreTasks.push(restoreCachedTranslationsForPage(pageNumber, restoreContext))
      })
      await Promise.all(restoreTasks)

      pdfHistoryManager.updateAfterOpen(pdfDocumentSession).catch(() => {})

      return true
    } catch (loadError) {
      logger.error('Failed to open PDF file:', loadError)
      currentFile.value = null
      error.value = loadError?.message || 'Failed to open the PDF file.'
      await pdfDocumentSession.cleanupDocument()
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function recomputeLayout(layoutRequest) {
    if (isLoading.value || !currentFile.value) {
      return false
    }

    error.value = ''
    try {
      const nextState = await pdfDocumentSession.rebuildPageMetrics(layoutRequest)
      applySessionState(nextState)

      return true
    } catch (layoutError) {
      logger.warn('Failed to recompute PDF layout:', layoutError)
      error.value = layoutError?.message || 'Failed to recompute PDF layout.'
      return false
    }
  }

  async function translateVisiblePages() {
    if (isTranslating.value) {
      return false
    }

    if (!canTranslateVisiblePages.value) {
      return false
    }

    error.value = ''

    try {
      isTranslating.value = true
      translationSummary.value = await pdfTranslationCoordinator.translateVisibleBlocks()
      error.value = translationSummary.value?.error || ''
      await saveTranslationsToCache()
      pdfHistoryManager.updateAfterTranslation(pdfDocumentSession).catch(() => {})
      return true
    } catch (translateError) {
      logger.error('Failed to translate visible PDF blocks:', translateError)
      error.value = translateError?.message || 'Failed to translate visible PDF blocks.'
      translationSummary.value = {
        status: 'error',
        translatedCount: 0,
        failedCount: 0,
        totalCount: 0,
        translationOccurrenceId: 0
      }
      return false
    } finally {
      translationTick.value += 1
      isTranslating.value = false
    }
  }

  async function saveTranslationsToCache() {
    const documentIdentity = pdfDocumentSession.documentIdentity
    if (!documentIdentity) return

    const { translationSettingsHash } = await buildTranslationSettings()

    const entries = {}
    for (const [blockId, state] of pdfDocumentSession.translationStates) {
      if (state.status === 'translated') {
        const translatedCells = normalizeStructuredCells(state.translatedCells)
        entries[blockId] = {
          blockId,
          documentIdentity,
          pageNumber: state.pageNumber || 0,
          sourceTextHash: state.sourceTextHash || '',
          translatedText: state.translatedText || '',
          ...(translatedCells && { translatedCells }),
          status: state.status,
          provider: state.provider || '',
          sourceLanguage: state.sourceLanguage || '',
          targetLanguage: state.targetLanguage || '',
          translationSettingsHash,
          updatedAt: state.updatedAt || Date.now()
        }
      }
    }

    if (Object.keys(entries).length > 0) {
      await pdfCacheManager.saveTranslations(documentIdentity, entries)
    }
  }

  async function clearDocumentCache() {
    const documentIdentity = pdfDocumentSession.documentIdentity
    if (documentIdentity) {
      await pdfCacheManager.clearDocument(documentIdentity)
      logger.info('Cleared document cache:', { documentIdentity })
    }
  }

  async function clearAllPdfCache() {
    await pdfCacheManager.clearAll()
    logger.info('Cleared all PDF cache')
  }

  function clearError() {
    error.value = ''
  }

  async function cancelTranslation() {
    await pdfTranslationCoordinator.cancelActiveTranslation('user-cancel')
    isTranslating.value = false
  }

  async function cleanup() {
    disposed = true
    unsubscribePageSessionCommitted?.()
    unsubscribePageSessionCommitted = null
    translationRestoreContext?.dispose?.()
    translationRestoreContext = null
    await pdfTranslationCoordinator.cancelActiveTranslation('viewer-cleanup')
    await pdfDocumentSession.destroy()
    resetLoadedDocument()
    clearError()
  }

  return {
    currentFile,
    error,
    fileName,
    hasDocument,
    isLoading,
    pageCount,
    pageMetrics,
    isTranslating,
    hasTranslationContent,
    canTranslateVisiblePages,
    pdfFingerprint,
    translationSummary,
    translationTick,
    translatedPageData,
    restoredTranslationCount,
    restoredOcrPageCount,
    workerLabel,
    workerUrl,
    session: pdfDocumentSession,
    loadPdfFile,
    recomputeLayout,
    translateVisiblePages,
    hydrateVisiblePageBlocks,
    refreshTranslatedPageBlocks,
    cancelTranslation,
    clearDocumentCache,
    clearAllPdfCache,
    clearError,
    cleanup,
    resetLoadedDocument
  }
}
