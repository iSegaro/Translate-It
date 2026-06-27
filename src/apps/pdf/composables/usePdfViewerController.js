import { computed, ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'
import { PdfTranslationCoordinator } from '@/features/pdf-translation/core/PdfTranslationCoordinator.js'
import { pdfCacheManager } from '@/features/pdf-translation/core/PdfCacheManager.js'
import { pdfHistoryManager } from '@/features/pdf-translation/core/PdfHistoryManager.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfViewerController')
const pdfTranslationCoordinator = new PdfTranslationCoordinator(pdfDocumentSession)

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

  pdfTranslationCoordinator.onStateChange = () => {
    translationTick.value += 1
  }

  const hasDocument = computed(() => pageCount.value > 0 && pageMetrics.value.length > 0)
  const canTranslateVisiblePages = computed(() => hasDocument.value && !isLoading.value && !isTranslating.value)
  const workerUrl = computed(() => pdfDocumentSession.workerUrl)

  const translatedPageData = computed(() => {
    translationTick.value

    if (!hasDocument.value) return []

    return pageMetrics.value.map((metric) => {
      const blocks = []
      const pageSession = pdfDocumentSession.pageSessions.get(metric.pageNumber)

      if (pageSession) {
        const logicalBlocks = pageSession.getLogicalBlocks()
        for (const block of logicalBlocks) {
          blocks.push({
            ...block,
            translationState: pdfDocumentSession.getBlockTranslationState(block.id)
          })
        }

        blocks.sort((a, b) => (a.readingOrderIndex ?? 0) - (b.readingOrderIndex ?? 0))
      }

      return {
        pageNumber: metric.pageNumber,
        width: metric.width,
        height: metric.height,
        blocks
      }
    })
  })

  function applySessionState(state) {
    fileName.value = state.fileName
    pageCount.value = state.totalPages
    pageMetrics.value = state.pageMetrics
    pageScale.value = state.pageScale
    pdfFingerprint.value = state.pdfFingerprint || ''
    workerLabel.value = state.workerUrl ? 'configured' : 'pending'
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
  }

  async function loadPdfFile(file, viewerWidth) {
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

      const nextState = await pdfDocumentSession.openFile(file, viewerWidth)
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

  async function recomputeLayout(viewerWidth) {
    if (isLoading.value || !currentFile.value) {
      return false
    }

    try {
      const nextState = await pdfDocumentSession.rebuildPageMetrics(viewerWidth)
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
      isTranslating.value = false
    }
  }

  async function restoreFromCache(documentIdentity) {
    if (!documentIdentity) return

    try {
      const cache = await pdfCacheManager.loadDocument(documentIdentity)
      let translationCount = 0
      let ocrPageCount = 0

      for (const [blockId, entry] of Object.entries(cache.translations)) {
        const state = pdfDocumentSession.getBlockTranslationState(blockId)
        if (state.status === 'translated') continue

        const block = findBlockById(blockId)
        if (block && block.sourceTextHash === entry.sourceTextHash) {
          pdfDocumentSession.setBlockTranslationState(blockId, {
            translatedText: entry.translatedText,
            status: 'translated',
            provider: entry.provider || '',
            sourceLanguage: entry.sourceLanguage || '',
            targetLanguage: entry.targetLanguage || '',
            sourceTextHash: entry.sourceTextHash,
            error: null
          })
          translationCount++
        }
      }

      for (const [pageNumber, ocrEntry] of Object.entries(cache.ocr)) {
        const pageSession = pdfDocumentSession.pageSessions.get(Number(pageNumber))
        if (pageSession && !pageSession.hasOcrForLanguage(ocrEntry.ocrLanguage)) {
          pageSession.setOcrBlocks(ocrEntry.ocrBlocks || [], ocrEntry.ocrLanguage)
          ocrPageCount++
        }
      }

      if (translationCount > 0 || ocrPageCount > 0) {
        restoredTranslationCount.value = translationCount
        restoredOcrPageCount.value = ocrPageCount
        translationTick.value += 1
        logger.info('Restored from cache:', { documentIdentity, translationCount, ocrPageCount })
      }
    } catch (cacheError) {
      logger.warn('Failed to restore from cache:', cacheError)
    }
  }

  function findBlockById(blockId) {
    for (const [, pageSession] of pdfDocumentSession.pageSessions) {
      for (const block of pageSession.allBlocks) {
        if (block.id === blockId) return block
      }
    }
    return null
  }

  async function saveTranslationsToCache() {
    const documentIdentity = pdfDocumentSession.documentIdentity
    if (!documentIdentity) return

    const entries = {}
    for (const [blockId, state] of pdfDocumentSession.translationStates) {
      if (state.status === 'translated') {
        entries[blockId] = {
          blockId,
          documentIdentity,
          pageNumber: state.pageNumber || 0,
          sourceTextHash: state.sourceTextHash || '',
          translatedText: state.translatedText || '',
          status: state.status,
          provider: state.provider || '',
          sourceLanguage: state.sourceLanguage || '',
          targetLanguage: state.targetLanguage || '',
          translationSettingsHash: '',
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
