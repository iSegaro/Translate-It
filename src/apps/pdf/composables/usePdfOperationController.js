import { reactive } from 'vue'

/**
 * Single-operation progress controller for the PDF Viewer.
 * Owns exactly one active operation. No queue. No concurrency.
 * Starting a new operation replaces the active one and invalidates previous handles.
 */
export function usePdfOperationController() {
  let currentId = 0

  const operation = reactive({
    id: null,
    title: '',
    running: false,
    indeterminate: true,
    progress: null,
    cancellable: false,
    onCancel: null
  })

  // Replaces any active operation. Returns a handle whose methods are no-ops
  // if a newer operation has been started.
  function startOperation(config) {
    const id = ++currentId

    const {
      title = '',
      indeterminate = true,
      progress = null,
      cancellable = false,
      onCancel = null
    } = config || {}

    operation.title = title
    operation.running = true
    operation.indeterminate = indeterminate
    operation.progress = progress
    operation.cancellable = cancellable
    operation.onCancel = onCancel

    return {
      updateProgress({ progress } = {}) {
        if (currentId !== id) return
        if (typeof progress !== 'number') return
        const clamped = Math.max(0, Math.min(100, progress))
        operation.progress = clamped
        operation.indeterminate = false
      },
      finish() {
        if (currentId !== id) return
        finishOperation()
      }
    }
  }

  function cancelOperation() {
    try {
      if (operation.onCancel) {
        operation.onCancel()
      }
    } catch {
      // onCancel threw — still finish the operation
    } finally {
      finishOperation()
    }
  }

  function finishOperation() {
    currentId++
    operation.title = ''
    operation.running = false
    operation.indeterminate = true
    operation.progress = null
    operation.cancellable = false
    operation.onCancel = null
  }

  return {
    operation,
    startOperation,
    cancelOperation
  }
}
