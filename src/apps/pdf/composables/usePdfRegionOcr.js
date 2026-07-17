import { onBeforeUnmount, ref } from 'vue'
import { PdfRegionOcrExecutor } from '@/features/pdf-translation/core/PdfRegionOcrExecutor.js'
import { createExecutionOperation } from './executionOperation.js'

export function usePdfRegionOcr({
  createExecutor = (options) => new PdfRegionOcrExecutor(options),
  onRecognized
} = {}) {
  const outcome = ref(null)
  const isProcessing = ref(false)
  let activeOperation = null
  let activeRunId = 0

  function cancelCurrentRun() {
    activeOperation?.cancel()
  }

  function startRegionOcr({ region, pdfDocument, scale, language } = {}) {
    cancelCurrentRun()
    const runId = ++activeRunId
    let executorOperation = null
    let operation = null

    const finalizeResult = (result) => {
      if (runId !== activeRunId) return result

      outcome.value = result
      if (activeOperation === operation) {
        activeOperation = null
      }
      isProcessing.value = false
      if (result?.status === 'recognized') {
        onRecognized?.(result.data)
      }
      return result
    }

    const finalizeError = (error) => {
      if (runId === activeRunId) {
        if (activeOperation === operation) {
          activeOperation = null
        }
        isProcessing.value = false
      }
      throw error
    }

    const startExecutor = (resolvedLanguage) => {
      if (runId !== activeRunId) return { status: 'cancelled' }

      const executor = createExecutor({ pdfDocument })
      executorOperation = executor.execute({ region, scale, language: resolvedLanguage })
      return executorOperation.promise
    }

    let executionPromise
    try {
      executionPromise = language && typeof language.then === 'function'
        ? language.then(startExecutor)
        : startExecutor(language)
    } catch (error) {
      executionPromise = Promise.reject(error)
    }

    const promise = Promise.resolve(executionPromise).then(finalizeResult, finalizeError)

    operation = createExecutionOperation({
      promise,
      cancel() {
        if (activeOperation !== operation || runId !== activeRunId) return

        activeRunId++
        executorOperation?.cancel?.()
        activeOperation = null
        isProcessing.value = false
      },
      context: {
        target: 'ocr',
        runId,
        pageNumber: region.pageNumber
      }
    })
    activeOperation = operation
    isProcessing.value = true

    return operation
  }

  function executeRegionOcr(options = {}) {
    return startRegionOcr(options).promise
  }

  function cancelRegionOcr() {
    cancelCurrentRun()
  }

  onBeforeUnmount(() => {
    cancelCurrentRun()
  })

  return {
    outcome,
    isProcessing,
    startRegionOcr,
    executeRegionOcr,
    cancelRegionOcr
  }
}
