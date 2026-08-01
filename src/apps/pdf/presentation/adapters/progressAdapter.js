/**
 * Progress Adapter — holds the latest progress presentation snapshot.
 *
 * Receives complete progress presentation snapshots from the
 * Presentation Dispatcher via dispatch(). Each dispatch replaces
 * the previous state entirely — no merge, no partial updates.
 *
 * Framework-agnostic. Pure JavaScript. No Vue, no composables, no handles.
 *
 * @returns {{ dispatch: (presentationResult: object) => void, getState: () => object, reset: () => void }}
 */
export function createProgressAdapter() {
  const state = {
    version: 0,
    operation: {
      title: '',
      running: false,
      indeterminate: true,
      progress: null,
      cancellable: false
    }
  }

  function operationChanged(a, b) {
    return a.title !== b.title
      || a.running !== b.running
      || a.indeterminate !== b.indeterminate
      || a.progress !== b.progress
      || a.cancellable !== b.cancellable
  }

  function dispatch(presentationResult) {
    if (!presentationResult || typeof presentationResult !== 'object') return

    const incoming = {
      title: typeof presentationResult.title === 'string' ? presentationResult.title : '',
      running: presentationResult.running === true,
      indeterminate: presentationResult.indeterminate !== false,
      progress: Number.isFinite(presentationResult.progress) ? presentationResult.progress : null,
      cancellable: presentationResult.cancellable === true
    }

    if (!operationChanged(state.operation, incoming)) return

    state.operation.title = incoming.title
    state.operation.running = incoming.running
    state.operation.indeterminate = incoming.indeterminate
    state.operation.progress = incoming.progress
    state.operation.cancellable = incoming.cancellable
    state.version++
  }

  function getState() {
    return Object.freeze({
      version: state.version,
      operation: Object.freeze({ ...state.operation })
    })
  }

  function reset() {
    const initial = {
      title: '',
      running: false,
      indeterminate: true,
      progress: null,
      cancellable: false
    }

    if (!operationChanged(state.operation, initial)) return

    state.operation.title = ''
    state.operation.running = false
    state.operation.indeterminate = true
    state.operation.progress = null
    state.operation.cancellable = false
    state.version++
  }

  return Object.freeze({ dispatch, getState, reset })
}
