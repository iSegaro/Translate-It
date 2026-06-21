import { computed, ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'
import { PdfTranslationCoordinator } from '@/features/pdf-translation/core/PdfTranslationCoordinator.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfViewerController')
const pdfTranslationCoordinator = new PdfTranslationCoordinator(pdfDocumentSession)

export function usePdfViewerController() {
  const currentFile = ref(null)
  const isLoading = ref(false)
  const error = ref('')
  const fileName = ref('')
  const pageCount = ref(0)
  const workerLabel = ref('')
  const pageMetrics = ref([])
  const pageScale = ref(1)
  const isTranslating = ref(false)
  const translationSummary = ref({
    status: 'idle',
    translatedCount: 0,
    failedCount: 0,
    totalCount: 0
  })

  const hasDocument = computed(() => pageCount.value > 0 && pageMetrics.value.length > 0)
  const canTranslateVisiblePages = computed(() => hasDocument.value && !isLoading.value && !isTranslating.value)
  const workerUrl = computed(() => pdfDocumentSession.workerUrl)

  function applySessionState(state) {
    fileName.value = state.fileName
    pageCount.value = state.totalPages
    pageMetrics.value = state.pageMetrics
    pageScale.value = state.pageScale
    workerLabel.value = state.workerUrl ? 'configured' : 'pending'
  }

  function resetLoadedDocument() {
    currentFile.value = null
    fileName.value = ''
    pageCount.value = 0
    workerLabel.value = ''
    pageMetrics.value = []
    pageScale.value = 1
    translationSummary.value = {
      status: 'idle',
      translatedCount: 0,
      failedCount: 0,
      totalCount: 0
    }
    isTranslating.value = false
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

  function clearError() {
    error.value = ''
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
    translationSummary,
    workerLabel,
    workerUrl,
    session: pdfDocumentSession,
    loadPdfFile,
    recomputeLayout,
    translateVisiblePages,
    clearError,
    cleanup,
    resetLoadedDocument
  }
}
