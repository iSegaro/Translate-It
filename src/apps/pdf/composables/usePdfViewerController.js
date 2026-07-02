import { computed, reactive, ref, shallowRef } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { getProviderOptimizationLevelAsync, getSourceLanguageAsync, getTargetLanguageAsync, getTranslationApiAsync } from '@/shared/config/config.js'
import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'
import { PdfTranslationCoordinator } from '@/features/pdf-translation/core/PdfTranslationCoordinator.js'
import { pdfCacheManager } from '@/features/pdf-translation/core/PdfCacheManager.js'
import { pdfHistoryManager } from '@/features/pdf-translation/core/PdfHistoryManager.js'
import { sha256HexFromText } from '@/features/pdf-translation/core/PdfBlockIdentity.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfViewerController')
const pdfTranslationCoordinator = new PdfTranslationCoordinator(pdfDocumentSession)

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBoundingBoxLike(value) {
  return !!value && typeof value === 'object' &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
}

function isSourceReferencesLike(value) {
  return !!value && typeof value === 'object' &&
    Array.isArray(value.blockIds) &&
    Array.isArray(value.lineIds) &&
    Array.isArray(value.sourceLineIndices) &&
    Array.isArray(value.sourceItemIndices) &&
    Array.isArray(value.groupRegionIds)
}

function isStructuredCellLike(value) {
  return !!value && typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.regionId === 'string' &&
    isFiniteNumber(value.rowIndex) &&
    isFiniteNumber(value.columnIndex) &&
    isFiniteNumber(value.rowSpan) &&
    isFiniteNumber(value.colSpan) &&
    typeof value.spanType === 'string' &&
    typeof value.role === 'string' &&
    typeof value.text === 'string' &&
    (value.boundingBox == null || isBoundingBoxLike(value.boundingBox)) &&
    isSourceReferencesLike(value.sourceReferences) &&
    typeof value.spanCandidate === 'boolean' &&
    isFiniteNumber(value.estimatedRowSpan) &&
    isFiniteNumber(value.estimatedColSpan) &&
    isFiniteNumber(value.confidence)
}

function cloneSerializable(value) {
  if (value == null) return value

  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value))
}

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

async function buildTranslationSettingsHash() {
  const settings = await resolveTranslationSettings()
  return await sha256HexFromText(JSON.stringify({
    provider: settings.provider || '',
    sourceLanguage: settings.sourceLanguage || '',
    targetLanguage: settings.targetLanguage || '',
    optimizationLevel: settings.optimizationLevel ?? null
  }))
}

function normalizeStructuredCells(translatedCells = []) {
  if (!Array.isArray(translatedCells) || translatedCells.length === 0) return null

  const normalized = []
  for (const line of translatedCells) {
    if (!line || typeof line !== 'object') return null
    if (!isFiniteNumber(line.lineIndex) || !Array.isArray(line.cells)) return null
    if (!line.cells.every((cell) => typeof cell === 'string')) return null

    const nextLine = {
      lineIndex: line.lineIndex,
      cells: cloneSerializable(line.cells)
    }

    const metadataKeys = ['cellIds', 'columnIndices', 'rowIndices', 'colSpanCandidates', 'estimatedColSpans']
    for (const key of metadataKeys) {
      if (line[key] == null) continue
      if (!Array.isArray(line[key])) return null
      nextLine[key] = cloneSerializable(line[key])
    }

    if (line.structuredCells != null) {
      if (!Array.isArray(line.structuredCells)) return null
      if (!line.structuredCells.every((cell) => cell == null || isStructuredCellLike(cell))) return null
      nextLine.structuredCells = cloneSerializable(line.structuredCells)
    }

    normalized.push(nextLine)
  }

  return normalized
}

function deriveTranslatedTextFromStructuredCells(translatedCells = []) {
  if (!Array.isArray(translatedCells) || translatedCells.length === 0) return ''

  const lines = []
  for (const line of translatedCells) {
    if (!line || typeof line !== 'object' || !Array.isArray(line.cells)) continue
    const cells = line.cells.filter((cell) => typeof cell === 'string' && cell.length > 0)
    if (cells.length > 0) {
      lines.push(cells.join(' '))
    }
  }

  return lines.join('\n').trim()
}

function hasTranslationSettingsHash(entry = null) {
  return typeof entry?.translationSettingsHash === 'string' && entry.translationSettingsHash.length > 0
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
  const pageScale = ref(1)
  const isTranslating = ref(false)
  const translationSummary = ref({
    status: 'idle',
    translatedCount: 0,
    failedCount: 0,
    totalCount: 0
  })
  const translationTick = ref(0)
  const restoredTranslationCount = ref(0)
  const restoredOcrPageCount = ref(0)

  const _pageDataMap = reactive(new Map())

  const _translatedPageData = shallowRef([])

  const _blockIndex = new Map()

  const _pageMetricIndex = new Map()

  function _buildBlocksForPage(pageSession) {
    const logicalBlocks = pageSession.getLogicalBlocks()
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

  function _syncMissingPageSessions() {
    let changed = false
    const pageSessionCount = pdfDocumentSession.pageSessions.size

    if (pageSessionCount === 0 || _pageDataMap.size >= pageSessionCount) {
      return false
    }

    for (const [pageNumber, pageSession] of pdfDocumentSession.pageSessions) {
      if (_pageDataMap.has(pageNumber)) continue

      const metric = _pageMetricIndex.get(pageNumber)
      _pageDataMap.set(pageNumber, reactive({
        pageNumber,
        width: metric?.width ?? 0,
        height: metric?.height ?? 0,
        blocks: _buildBlocksForPage(pageSession)
      }))
      changed = true
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
    _pageDataMap.clear()
    _blockIndex.clear()
    _pageMetricIndex.clear()

    for (const metric of pageMetrics.value) {
      _pageMetricIndex.set(metric.pageNumber, metric)

      const pageSession = pdfDocumentSession.pageSessions.get(metric.pageNumber)
      if (!pageSession) continue

      _pageDataMap.set(metric.pageNumber, reactive({
        pageNumber: metric.pageNumber,
        width: metric.width,
        height: metric.height,
        blocks: _buildBlocksForPage(pageSession)
      }))
    }

    _translatedPageData.value = [..._pageDataMap.values()]
  }

  pdfTranslationCoordinator.onStateChange = (updatedBlockIds) => {
    _syncMissingPageSessions()
    _updateBlockStates(updatedBlockIds)
  }

  const hasDocument = computed(() => pageCount.value > 0 && pageMetrics.value.length > 0)
  const canTranslateVisiblePages = computed(() => hasDocument.value && !isLoading.value && !isTranslating.value)
  const workerUrl = computed(() => pdfDocumentSession.workerUrl)

  const translatedPageData = computed(() => _translatedPageData.value)

  function applySessionState(state) {
    fileName.value = state.fileName
    pageCount.value = state.totalPages
    pageMetrics.value = state.pageMetrics
    pageScale.value = state.pageScale
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
    pageScale.value = 1
    translationSummary.value = {
      status: 'idle',
      translatedCount: 0,
      failedCount: 0,
      totalCount: 0
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
      isLoading.value = true
      error.value = ''
      await pdfTranslationCoordinator.cancelActiveTranslation('document-replaced')
      resetLoadedDocument()
      currentFile.value = file

      const nextState = await pdfDocumentSession.openFile(file, layoutRequest)
      applySessionState(nextState)

      await restoreFromCache(pdfDocumentSession.documentIdentity)

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
    if (!canTranslateVisiblePages.value) {
      return false
    }

    try {
      isTranslating.value = true
      translationSummary.value = await pdfTranslationCoordinator.translateVisibleBlocks()
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
        totalCount: 0
      }
      return false
    } finally {
      translationTick.value += 1
      isTranslating.value = false
    }
  }

  async function restoreFromCache(documentIdentity) {
    if (!documentIdentity) return

    try {
      const currentTranslationSettingsHash = await buildTranslationSettingsHash()
      const cache = await pdfCacheManager.loadDocument(documentIdentity)
      let translationCount = 0
      let ocrPageCount = 0

      for (const [blockId, entry] of Object.entries(cache.translations)) {
        const state = pdfDocumentSession.getBlockTranslationState(blockId)
        if (state.status === 'translated') continue

        const block = pdfDocumentSession.findSourceBlock(blockId)
        if (!block || block.sourceTextHash !== entry.sourceTextHash) continue

        if (hasTranslationSettingsHash(entry) && entry.translationSettingsHash !== currentTranslationSettingsHash) {
          continue
        }

        const normalizedTranslatedCells = normalizeStructuredCells(entry.translatedCells)
        const translatedText = (typeof entry.translatedText === 'string' && entry.translatedText.trim().length > 0)
          ? entry.translatedText
          : deriveTranslatedTextFromStructuredCells(normalizedTranslatedCells || [])

        if (!translatedText) continue

        const nextState = {
          translatedText,
          status: 'translated',
          provider: entry.provider || '',
          sourceLanguage: entry.sourceLanguage || '',
          targetLanguage: entry.targetLanguage || '',
          sourceTextHash: entry.sourceTextHash,
          translationSettingsHash: hasTranslationSettingsHash(entry)
            ? entry.translationSettingsHash
            : '',
          error: null
        }

        if (normalizedTranslatedCells) {
          nextState.translatedCells = normalizedTranslatedCells
        }

        pdfDocumentSession.setBlockTranslationState(blockId, nextState)
        translationCount++
      }

      for (const [pageNumber, ocrEntry] of Object.entries(cache.ocr)) {
        const pageSession = pdfDocumentSession.pageSessions.get(Number(pageNumber))
        if (pageSession && !pageSession.hasOcrForLanguage(ocrEntry.ocrLanguage)) {
          pdfDocumentSession.setPageOcrBlocks(Number(pageNumber), ocrEntry.ocrBlocks || [], ocrEntry.ocrLanguage)
          ocrPageCount++
        }
      }

      if (translationCount > 0 || ocrPageCount > 0) {
        restoredTranslationCount.value = translationCount
        restoredOcrPageCount.value = ocrPageCount

        _syncMissingPageSessions()

        const restoredBlockIds = Object.keys(cache.translations)
        _updateBlockStates(restoredBlockIds)

        translationTick.value += 1
        logger.info('Restored from cache:', { documentIdentity, translationCount, ocrPageCount })
      }
    } catch (cacheError) {
      logger.warn('Failed to restore from cache:', cacheError)
    }
  }

  async function saveTranslationsToCache() {
    const documentIdentity = pdfDocumentSession.documentIdentity
    if (!documentIdentity) return

    const translationSettingsHash = await buildTranslationSettingsHash()

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
    pageScale,
    isTranslating,
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
    cancelTranslation,
    clearDocumentCache,
    clearAllPdfCache,
    clearError,
    cleanup,
    resetLoadedDocument
  }
}
