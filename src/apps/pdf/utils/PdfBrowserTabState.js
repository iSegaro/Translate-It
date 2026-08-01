const HISTORY_STATE_KEY = 'pdfBrowserTabState'

function getRootState() {
  const state = globalThis.history?.state
  return state && typeof state === 'object' ? state : {}
}

function replaceRootState(nextRootState) {
  globalThis.history.replaceState(nextRootState, '')
}

/**
 * Reads browser-tab state stored for the current History entry.
 * @returns {object|null}
 */
export function read() {
  const state = globalThis.history?.state
  if (!state || typeof state !== 'object') return null
  return state[HISTORY_STATE_KEY] ?? null
}

/**
 * Writes browser-tab state while preserving other History state owners.
 * @param {object} state
 */
export function write(state) {
  if (typeof globalThis.history?.replaceState !== 'function') return
  replaceRootState({ ...getRootState(), [HISTORY_STATE_KEY]: state })
}

/**
 * Clears browser-tab state without modifying other History state owners.
 */
export function clear() {
  if (typeof globalThis.history?.replaceState !== 'function') return

  const rootState = getRootState()
  if (!(HISTORY_STATE_KEY in rootState)) return

  const nextState = { ...rootState }
  delete nextState[HISTORY_STATE_KEY]
  replaceRootState(nextState)
}
