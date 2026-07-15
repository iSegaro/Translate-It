import { onBeforeUnmount, reactive, ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { getSourceLanguageAsync } from '@/shared/config/config.js'
import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'
import { PdfOcrRecommendationEngine } from '@/features/pdf-translation/core/PdfOcrRecommendationEngine.js'
import { PdfOcrProcessor } from '@/features/pdf-translation/core/PdfOcrProcessor.js'
import { pdfCacheManager } from '@/features/pdf-translation/core/PdfCacheManager.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfOcr')

export function usePdfOcr({ onOcrComplete } = {}) {
  const recommendationEngine = new PdfOcrRecommendationEngine()
  const processor = new PdfOcrProcessor(pdfDocumentSession)

  const ocrRecommendationCount = ref(0)
  const ocrRecommendations = ref([])
  const ocrBatch = reactive({ pageNumbers: [] })
  const isOcrPromptVisible = ref(false)
  const isOcrProcessing = ref(false)
  const ocrProgress = ref({ current: 0, total: 0, pageNumber: 0 })
  const ocrError = ref('')
  const ocrLanguage = ref('eng')

  function refreshOcrRecommendations() {
    const visiblePageSessions = pdfDocumentSession.getLoadedVisiblePageSessions()
    const recommendations = recommendationEngine.getRecommendations(visiblePageSessions)

    ocrRecommendationCount.value = recommendations.length
    ocrRecommendations.value = recommendations
  }

  function requestOcr() {
    if (ocrRecommendationCount.value === 0) return

    ocrError.value = ''
    ocrBatch.pageNumbers = [...ocrRecommendations.value]
    isOcrPromptVisible.value = true
  }

  async function confirmOcr() {
    if (isOcrProcessing.value) return

    isOcrPromptVisible.value = false
    isOcrProcessing.value = true
    ocrError.value = ''

    try {
      const sourceLang = await getSourceLanguageAsync()
      ocrLanguage.value = sourceLang || 'eng'

      const pageNumbers = [...ocrBatch.pageNumbers]

      await processor.processPages(pageNumbers, {
        language: ocrLanguage.value,
        onProgress: ({ current, total, pageNumber }) => {
          ocrProgress.value = { current, total, pageNumber }
        }
      })

      await saveOcrToCache(pageNumbers)

      refreshOcrRecommendations()
      onOcrComplete?.({ pageNumbers })

      logger.info('OCR completed for pages:', { pageNumbers, language: ocrLanguage.value })
    } catch (error) {
      logger.error('OCR process failed:', error)
      ocrError.value = error?.message || 'OCR failed'
    } finally {
      isOcrProcessing.value = false
      ocrProgress.value = { current: 0, total: 0, pageNumber: 0 }
    }
  }

  function cancelOcr() {
    processor.cancel()
    isOcrProcessing.value = false
    isOcrPromptVisible.value = false
    ocrProgress.value = { current: 0, total: 0, pageNumber: 0 }
  }

  function dismissOcrPrompt() {
    isOcrPromptVisible.value = false
  }

  async function saveOcrToCache(pageNumbers) {
    const documentIdentity = pdfDocumentSession.documentIdentity
    if (!documentIdentity) return

    for (const pageNumber of pageNumbers) {
      const pageSession = pdfDocumentSession.pageSessions.get(pageNumber)
      if (pageSession && pageSession.ocrBlocks.length > 0) {
        await pdfCacheManager.saveOcr(documentIdentity, pageNumber, {
          pageNumber,
          ocrLanguage: pageSession.ocrLanguage || ocrLanguage.value,
          ocrBlocks: pageSession.ocrBlocks,
          ocrCompletedAt: pageSession.ocrCompletedAt || Date.now()
        })
      }
    }
  }

  const unsubscribePageSessionCommitted = pdfDocumentSession.onPageSessionCommitted?.(() => {
    refreshOcrRecommendations()
  })

  const unsubscribeVisiblePagesChanged = pdfDocumentSession.onVisiblePagesChanged?.(() => {
    refreshOcrRecommendations()
  })

  onBeforeUnmount(() => {
    unsubscribePageSessionCommitted?.()
    unsubscribeVisiblePagesChanged?.()
    processor.cancel()
  })

  return {
    ocrRecommendationCount,
    ocrBatch,
    isOcrPromptVisible,
    isOcrProcessing,
    ocrProgress,
    ocrError,
    ocrLanguage,
    refreshOcrRecommendations,
    requestOcr,
    confirmOcr,
    cancelOcr,
    dismissOcrPrompt
  }
}
