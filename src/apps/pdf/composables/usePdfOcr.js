import { onBeforeUnmount, reactive, ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'
import { PdfOcrRecommendationEngine } from '@/features/pdf-translation/core/PdfOcrRecommendationEngine.js'
import { PdfOcrProcessor } from '@/features/pdf-translation/core/PdfOcrProcessor.js'
import { pdfCacheManager } from '@/features/pdf-translation/core/PdfCacheManager.js'
import { mapOcrError } from '@/features/ocr/errors/ocrErrorMapper.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfOcr')

function getBatchOcrError(results) {
  const failedPages = results.filter(result => !result.success)
  if (!failedPages.length) return null

  const errorCodes = failedPages.map(({ error }) => mapOcrError(error instanceof Error ? error : { message: error }))
  if (errorCodes.every(errorCode => errorCode === 'cancelled')) return 'cancelled'
  if (errorCodes.includes('model-not-installed')) return 'model-not-installed'
  return 'ocr-failed'
}

export function usePdfOcr({ onOcrComplete, onOcrStart, onOcrProgress, onOcrError } = {}) {
  const recommendationEngine = new PdfOcrRecommendationEngine()
  const processor = new PdfOcrProcessor(pdfDocumentSession)
  const settingsStore = useSettingsStore()

  const ocrRecommendationCount = ref(0)
  const ocrRecommendations = ref([])
  const ocrBatch = reactive({ pageNumbers: [] })
  const isOcrProcessing = ref(false)
  const ocrError = ref('')
  const ocrLanguage = ref('eng')

  function refreshOcrRecommendations() {
    const candidates = pdfDocumentSession.getLoadedVisibleOcrCandidates()
    const recommendations = recommendationEngine.getRecommendations(candidates)

    ocrRecommendationCount.value = recommendations.length
    ocrRecommendations.value = recommendations
  }

  function requestOcr() {
    if (ocrRecommendationCount.value === 0) return

    ocrError.value = ''
    ocrBatch.pageNumbers = [...ocrRecommendations.value]
    return confirmOcr()
  }

  async function confirmOcr() {
    if (isOcrProcessing.value) return

    isOcrProcessing.value = true
    ocrError.value = ''
    let pageNumbers = []
    let batchErrorCode = null
    let terminalResult = null

    onOcrStart?.()

    try {
      ocrLanguage.value = settingsStore.settings.OCR_DEFAULT_LANG || 'eng'

      pageNumbers = [...ocrBatch.pageNumbers]

      const results = await processor.processPages(pageNumbers, {
        language: ocrLanguage.value,
        onProgress: ({ current, total, pageNumber }) => {
          onOcrProgress?.({ current, total, pageNumber })
        }
      })

      batchErrorCode = getBatchOcrError(results)
      if (batchErrorCode && batchErrorCode !== 'cancelled') {
        ocrError.value = batchErrorCode
      }

      await saveOcrToCache(pageNumbers)

      refreshOcrRecommendations()
      if (batchErrorCode && batchErrorCode !== 'cancelled') {
        terminalResult = { type: 'error', errorCode: batchErrorCode, pageNumbers }
      } else {
        terminalResult = { type: 'complete', pageNumbers }
      }

      logger.info('OCR completed for pages:', { pageNumbers, language: ocrLanguage.value })
    } catch (error) {
      logger.error('OCR process failed:', error)
      const errorCode = batchErrorCode || mapOcrError(error)
      if (errorCode !== 'cancelled') {
        ocrError.value = errorCode
        terminalResult = {
          type: 'error',
          errorCode,
          pageNumbers: batchErrorCode ? pageNumbers : undefined
        }
      }
    } finally {
      isOcrProcessing.value = false
    }

    if (terminalResult?.type === 'error') {
      onOcrError?.(terminalResult.errorCode, terminalResult.pageNumbers && { pageNumbers: terminalResult.pageNumbers })
      return
    }

    if (terminalResult?.type === 'complete') {
      onOcrComplete?.({ pageNumbers: terminalResult.pageNumbers })
    }
  }

  function cancelOcr() {
    processor.cancel()
    isOcrProcessing.value = false
  }

  async function saveOcrToCache(pageNumbers) {
    const documentIdentity = pdfDocumentSession.documentIdentity
    if (!documentIdentity) return

    for (const pageNumber of pageNumbers) {
      const ocrState = pdfDocumentSession.getCommittedOcrState(pageNumber)
      if (ocrState?.ocrBlocks.length > 0) {
        await pdfCacheManager.saveOcr(documentIdentity, pageNumber, {
          pageNumber,
          ocrLanguage: ocrState.ocrLanguage || ocrLanguage.value,
          ocrBlocks: ocrState.ocrBlocks,
          ocrCompletedAt: ocrState.ocrCompletedAt || Date.now()
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
    ocrRecommendations,
    ocrBatch,
    isOcrProcessing,
    ocrError,
    ocrLanguage,
    refreshOcrRecommendations,
    requestOcr,
    confirmOcr,
    cancelOcr
  }
}
