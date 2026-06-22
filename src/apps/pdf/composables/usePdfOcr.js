import { onBeforeUnmount, ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { getSourceLanguageAsync } from '@/shared/config/config.js'
import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'
import { PdfOcrDetector } from '@/features/pdf-translation/core/PdfOcrDetector.js'
import { PdfOcrProcessor } from '@/features/pdf-translation/core/PdfOcrProcessor.js'
import { pdfCacheManager } from '@/features/pdf-translation/core/PdfCacheManager.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfOcr')

export function usePdfOcr({ onOcrComplete } = {}) {
  const detector = new PdfOcrDetector(pdfDocumentSession)
  const processor = new PdfOcrProcessor(pdfDocumentSession)

  const scannedPageCount = ref(0)
  const scannedPageNumbers = ref([])
  const isOcrPromptVisible = ref(false)
  const isOcrProcessing = ref(false)
  const ocrProgress = ref({ current: 0, total: 0, pageNumber: 0 })
  const ocrError = ref('')
  const ocrLanguage = ref('eng')

  function refreshOcrCandidates() {
    const candidates = detector.detectScannedPages()
    const pending = candidates.filter((c) => !c.alreadyOcrd)

    scannedPageCount.value = pending.length
    scannedPageNumbers.value = pending.map((c) => c.pageNumber)
  }

  function requestOcr() {
    if (scannedPageCount.value === 0) return

    ocrError.value = ''
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

      const pageNumbers = [...scannedPageNumbers.value]

      await processor.processPages(pageNumbers, {
        language: ocrLanguage.value,
        onProgress: ({ current, total, pageNumber }) => {
          ocrProgress.value = { current, total, pageNumber }
        }
      })

      await saveOcrToCache(pageNumbers)

      refreshOcrCandidates()
      onOcrComplete?.()

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

  onBeforeUnmount(() => {
    processor.cancel()
  })

  return {
    scannedPageCount,
    scannedPageNumbers,
    isOcrPromptVisible,
    isOcrProcessing,
    ocrProgress,
    ocrError,
    ocrLanguage,
    refreshOcrCandidates,
    requestOcr,
    confirmOcr,
    cancelOcr,
    dismissOcrPrompt
  }
}
