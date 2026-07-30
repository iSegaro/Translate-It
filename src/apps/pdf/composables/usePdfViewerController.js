import { computed, reactive, ref, shallowRef } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { TranslationMode, getProviderOptimizationLevelAsync, getEffectiveProviderAsync } from '@/shared/config/config.js'
import { AUTO_DETECT_VALUE, DEFAULT_TARGET_LANGUAGE } from '@/shared/constants/core.js'
import { pdfSourceFromFile } from '@/apps/pdf/core/PdfSource.js'
import { PdfLoader } from '@/apps/pdf/core/PdfLoader.js'
import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'
import { PdfTranslationCoordinator } from '@/features/pdf-translation/core/PdfTranslationCoordinator.js'
import { getPdfTranslationFailureReason } from '@/features/pdf-translation/core/PdfTranslationAdapter.js'
import { pdfCacheManager } from '@/features/pdf-translation/core/PdfCacheManager.js'
import { pdfHistoryManager } from '@/features/pdf-translation/core/PdfHistoryManager.js'
import { sha256HexFromText } from '@/features/pdf-translation/core/PdfBlockIdentity.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfViewerController')
const pdfTranslationCoordinator = new PdfTranslationCoordinator(pdfDocumentSession)

async function buildTranslationSettings({ provider, sourceLanguage, targetLanguage, optimizationLevel }) {
  const translationSettingsHash = await sha256HexFromText(JSON.stringify({
    provider: provider || '',
    sourceLanguage: sourceLanguage || '',
    targetLanguage: targetLanguage || '',
    optimizationLevel: optimizationLevel ?? null
  }))

  return { provider, sourceLanguage, targetLanguage, optimizationLevel, translationSettingsHash }
}

export function usePdfViewerController() {
  const currentFile = ref(null)
  const fileSize = ref(0)
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
    const pdfSourceLanguage = ref(AUTO_DETECT_VALUE)
  const pdfTargetLanguage = ref(DEFAULT_TARGET_LANGUAGE)

  const _pageDataMap = reactive(new Map())

  const _translatedPageData = shallowRef([])

  const _blockIndex = new Map()

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

  function _resolveBlocksForPageSession(logicalBlocks = [], existingPage = null) {
    if (logicalBlocks.length > 0) {
      const blocks = _buildBlocksForLogicalBlocks(logicalBlocks)
      if (blocks.length > 0) return blocks
    }

    if (existingPage?.blocks?.length > 0) {
      return _refreshExistingBlocks(existingPage.blocks)
    }

    return []
  }

  function _buildPageDataForMetric(metric, existingPage = null) {
    const logicalBlocks = pdfDocumentSession.getPageSourceBlocks(metric.pageNumber)
    return reactive({
      pageNumber: metric.pageNumber,
      blocks: _resolveBlocksForPageSession(logicalBlocks, existingPage)
    })
  }

  function _hydratePageBlocks(page, logicalBlocks) {
    if (page.blocks.length > 0) {
      return false
    }

    if (logicalBlocks.length === 0) {
      return false
    }

    page.blocks = _buildBlocksForLogicalBlocks(logicalBlocks)
    return true
  }

  function _syncMissingPageSessions() {
    let changed = false
    pdfDocumentSession.forEachCommittedPage((pageNumber) => {
      const logicalBlocks = pdfDocumentSession.getPageSourceBlocks(pageNumber)
      if (!_pageDataMap.has(pageNumber)) {
        _pageDataMap.set(pageNumber, reactive({
          pageNumber,
          blocks: _buildBlocksForLogicalBlocks(logicalBlocks)
        }))
        changed = true
        return
      }

      if (_hydratePageBlocks(_pageDataMap.get(pageNumber), logicalBlocks)) {
        changed = true
      }
    })

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

    for (const metric of pageMetrics.value) {
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
      const logicalBlocks = pageSession ? pdfDocumentSession.getPageSourceBlocks(pageNumber) : []
      if (_hydratePageBlocks(page, logicalBlocks)) {
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
    if (pdfDocumentSession.hasAnyTranslatedBlocks()) return true
    for (const page of _pageDataMap.values()) {
      if (page.blocks.length > 0) return true
    }
    return false
  })

  function applySessionState(state, rebuildContent = true) {
    fileName.value = state.fileName
    pageCount.value = state.totalPages
    pageMetrics.value = state.pageMetrics
    pdfFingerprint.value = state.pdfFingerprint || ''
    workerLabel.value = state.workerUrl ? 'configured' : 'pending'
    if (rebuildContent) {
      _rebuildPageData()
    }
  }

  function resetLoadedDocument() {
    currentFile.value = null
    fileSize.value = 0
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
    _pageDataMap.clear()
    _blockIndex.clear()
    _translatedPageData.value = []
  }

  async function loadPdfFile(file, layoutRequest) {
    if (!file) return false

    if (!file.name?.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      error.value = 'Please choose a valid PDF file.'
      return false
    }

    try {
      isLoading.value = true
      error.value = ''
      await pdfTranslationCoordinator.cancelActiveTranslation('document-replaced')
      resetLoadedDocument()

      const source = pdfSourceFromFile(file)
      const { name, buffer } = await PdfLoader.load(source)
      const size = file.size ?? 0
      currentFile.value = { name, size }
      fileSize.value = size

      const nextState = await pdfDocumentSession.openFile({ name, buffer }, layoutRequest)
      applySessionState(nextState)

      pdfHistoryManager.updateAfterOpen(pdfDocumentSession).catch(() => {})

      return true
    } catch (loadError) {
      logger.error('Failed to open PDF file:', loadError)
      currentFile.value = null
      fileSize.value = 0
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
      applySessionState(nextState, false)

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
      const provider = await getEffectiveProviderAsync(TranslationMode.PDF)
      const optimizationLevel = await getProviderOptimizationLevelAsync(provider)
      const translationIntent = await buildTranslationSettings({
        provider,
        sourceLanguage: pdfSourceLanguage.value,
        targetLanguage: pdfTargetLanguage.value,
        optimizationLevel
      })
      translationSummary.value = await pdfTranslationCoordinator.translateVisibleBlocks({
        sourceLanguage: pdfSourceLanguage.value,
        targetLanguage: pdfTargetLanguage.value,
        translationIntent
      })
      pdfHistoryManager.updateAfterTranslation(pdfDocumentSession).catch(() => {})
      return true
    } catch (translateError) {
      logger.error('Failed to translate visible PDF blocks:', translateError)
      translationSummary.value = {
        status: 'error',
        translatedCount: 0,
        failedCount: 0,
        totalCount: 0,
        translationOccurrenceId: 0,
        error: translateError?.message || 'Failed to translate visible PDF blocks.',
        failureReason: getPdfTranslationFailureReason(translateError)
      }
      return false
    } finally {
      translationTick.value += 1
      isTranslating.value = false
    }
  }

  async function clearDocumentCache() {
    const documentIdentity = pdfDocumentSession.documentIdentity
    if (!documentIdentity) return

    // 1. Persistent storage
    await pdfCacheManager.clearDocument(documentIdentity)

    // 2. In-memory bitmap cache
    pdfDocumentSession.clearRenderedPageCache()

    // 3. In-memory document cache snapshot (prevents stale restores)
    pdfDocumentSession.invalidateDocumentCacheSnapshot()

    // 4. Translation state + UI overlay
    pdfDocumentSession.resetTranslationStates()
    _pageDataMap.clear()
    _blockIndex.clear()
    _translatedPageData.value = []

    logger.info('Cleared document cache:', { documentIdentity })
  }

  function clearError() {
    error.value = ''
  }

  async function cancelTranslation() {
    await pdfTranslationCoordinator.cancelActiveTranslation('user-cancel')
    isTranslating.value = false
  }

  async function cleanup() {
    await pdfTranslationCoordinator.cancelActiveTranslation('viewer-cleanup')
    await pdfDocumentSession.destroy()
    resetLoadedDocument()
    clearError()
  }

  return {
    currentFile,
    fileSize,
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
    pdfSourceLanguage,
    pdfTargetLanguage,
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
    clearError,
    cleanup,
    resetLoadedDocument
  }
}
