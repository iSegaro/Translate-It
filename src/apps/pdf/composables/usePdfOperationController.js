import { reactive } from 'vue'

/**
 * Single-operation progress controller for the PDF Viewer.
 * Owns exactly one active operation. No queue. No concurrency.
 */
export function usePdfOperationController() {
  const operation = reactive({
    id: null,
    title: '',
    running: false,
    indeterminate: true,
    progress: null,
    cancellable: false,
    onCancel: null
  })

  // Replaces any active operation.
  function startOperation(config) {
    const {
      id = null,
      title = '',
      indeterminate = true,
      progress = null,
      cancellable = false,
      onCancel = null
    } = config || {}

    operation.id = id
    operation.title = title
    operation.running = true
    operation.indeterminate = indeterminate
    operation.progress = progress
    operation.cancellable = cancellable
    operation.onCancel = onCancel
  }

  function updateProgress({ progress } = {}) {
    if (typeof progress !== 'number') return
    const clamped = Math.max(0, Math.min(100, progress))
    operation.progress = clamped
    operation.indeterminate = false
  }

  function finishOperation() {
    operation.id = null
    operation.title = ''
    operation.running = false
    operation.indeterminate = true
    operation.progress = null
    operation.cancellable = false
    operation.onCancel = null
  }

  function cancelOperation() {
    try {
      if (operation.onCancel) {
        operation.onCancel()
      }
    } finally {
      finishOperation()
    }
  }

  return {
    operation,
    startOperation,
    updateProgress,
    finishOperation,
    cancelOperation
  }
}
