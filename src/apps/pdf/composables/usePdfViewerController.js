import { computed, ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfViewerController')

export function usePdfViewerController() {
  const currentFile = ref(null)
  const isLoading = ref(false)
  const error = ref('')
  const fileName = ref('')
  const pageCount = ref(0)
  const workerLabel = ref('')
  const pageMetrics = ref([])
  const pageScale = ref(1)

  const hasDocument = computed(() => pageCount.value > 0 && pageMetrics.value.length > 0)
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

  function clearError() {
    error.value = ''
  }

  async function cleanup() {
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
    workerLabel,
    workerUrl,
    session: pdfDocumentSession,
    loadPdfFile,
    recomputeLayout,
    clearError,
    cleanup,
    resetLoadedDocument
  }
}
