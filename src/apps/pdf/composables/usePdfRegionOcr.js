import { onBeforeUnmount, ref } from 'vue'
import { PdfRegionOcrExecutor } from '@/features/pdf-translation/core/PdfRegionOcrExecutor.js'

export function usePdfRegionOcr({ createExecutor = (options) => new PdfRegionOcrExecutor(options) } = {}) {
  const outcome = ref(null)
  const isProcessing = ref(false)
  let activeOperation = null
  let activeRunId = 0

  function cancelCurrentRun() {
    if (!activeOperation) return

    activeRunId++
    activeOperation.cancel?.()
    activeOperation = null
    isProcessing.value = false
  }

  async function executeRegionOcr({ region, pdfDocument, scale, language } = {}) {
    cancelCurrentRun()
    const runId = ++activeRunId
    const executor = createExecutor({ pdfDocument })
    const operation = executor.execute({ region, scale, language })
    activeOperation = operation
    isProcessing.value = true

    const result = await operation.promise
    if (runId !== activeRunId) return result

    outcome.value = result
    activeOperation = null
    isProcessing.value = false
    return result
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
    executeRegionOcr,
    cancelRegionOcr
  }
}
