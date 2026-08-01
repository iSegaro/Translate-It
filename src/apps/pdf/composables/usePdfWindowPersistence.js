import { storageCore } from '@/shared/storage/core/StorageCore.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { PDF_WINDOW_LAYOUT } from '@/apps/pdf/utils/pdfWindowGeometry.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfWindowPersistence')
export const PDF_WINDOWS_HOST_STORAGE_KEY = 'pdfWindowsHostLayout'

const DEFAULT_STATE = Object.freeze({
  version: 1,
  global: {
    isPinned: false,
    dockMode: 'none',
    dockedWidth: 420,
    defaultPosition: { ...PDF_WINDOW_LAYOUT.DEFAULT_GLOBAL_POSITION }
  },
  documents: {}
})

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value))
}

function normalizePosition(position) {
  if (!position) return null

  const x = Number(position.x)
  const y = Number(position.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }

  return { x, y }
}

function normalizeState(rawState) {
  const state = {
    version: DEFAULT_STATE.version,
    global: {
      ...DEFAULT_STATE.global
    },
    documents: {}
  }

  if (!rawState || typeof rawState !== 'object') {
    return state
  }

  if (rawState.version) {
    state.version = rawState.version
  }

  if (rawState.global && typeof rawState.global === 'object') {
    state.global.isPinned = !!rawState.global.isPinned
    state.global.dockMode = rawState.global.dockMode === 'left' || rawState.global.dockMode === 'right'
      ? rawState.global.dockMode
      : 'none'
    state.global.dockedWidth = Number(rawState.global.dockedWidth) || DEFAULT_STATE.global.dockedWidth

    const defaultPosition = normalizePosition(rawState.global.defaultPosition)
    if (defaultPosition) {
      state.global.defaultPosition = defaultPosition
    }
  }

  if (rawState.documents && typeof rawState.documents === 'object') {
    for (const [fingerprint, entry] of Object.entries(rawState.documents)) {
      if (!entry || typeof entry !== 'object') continue

      const normalizedPosition = normalizePosition(entry.position)
      state.documents[fingerprint] = {
        position: normalizedPosition || clone(DEFAULT_STATE.global.defaultPosition),
        updatedAt: Number(entry.updatedAt) || Date.now()
      }
    }
  }

  return state
}

async function readStoredLayoutState() {
  const result = await storageCore.get({ [PDF_WINDOWS_HOST_STORAGE_KEY]: clone(DEFAULT_STATE) })
  return normalizeState(result?.[PDF_WINDOWS_HOST_STORAGE_KEY])
}

async function writeStoredLayoutState(state) {
  await storageCore.set({
    [PDF_WINDOWS_HOST_STORAGE_KEY]: normalizeState(state)
  })
}

export async function loadPdfWindowLayout(pdfFingerprint = '') {
  const state = await readStoredLayoutState()
  const documentEntry = pdfFingerprint ? state.documents[pdfFingerprint] : null

  return {
    state,
    isPinned: state.global.isPinned,
    dockMode: state.global.dockMode,
    dockedWidth: state.global.dockedWidth,
    position: documentEntry?.position || clone(state.global.defaultPosition),
    positionScope: documentEntry ? 'document' : 'global',
    hasDocumentPosition: !!documentEntry
  }
}

export async function savePdfWindowLayout({
  pdfFingerprint = '',
  isPinned,
  dockMode,
  dockedWidth,
  position
} = {}) {
  const state = await readStoredLayoutState()

  if (typeof isPinned === 'boolean') {
    state.global.isPinned = isPinned
  }

  if (dockMode === 'none' || dockMode === 'left' || dockMode === 'right') {
    state.global.dockMode = dockMode
  }

  if (Number.isFinite(Number(dockedWidth))) {
    state.global.dockedWidth = Number(dockedWidth)
  }

  const normalizedPosition = normalizePosition(position)
  if (normalizedPosition) {
    if (pdfFingerprint) {
      state.documents[pdfFingerprint] = {
        position: normalizedPosition,
        updatedAt: Date.now()
      }
    } else {
      state.global.defaultPosition = normalizedPosition
    }
  }

  try {
    await writeStoredLayoutState(state)
  } catch (error) {
    logger.warn('Failed to persist PDF window layout:', error)
  }

  return state
}

export async function savePdfWindowPosition(pdfFingerprint, position) {
  return savePdfWindowLayout({ pdfFingerprint, position })
}

export async function savePdfWindowPreferences(preferences = {}) {
  return savePdfWindowLayout(preferences)
}

export { normalizeState as normalizePdfWindowLayoutState }
