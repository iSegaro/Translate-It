export function createDefaultPdfTranslationState(blockId) {
  return {
    blockId,
    translatedText: '',
    translatedCells: null,
    status: 'idle',
    provider: '',
    sourceLanguage: '',
    targetLanguage: '',
    sourceTextHash: '',
    translationSettingsHash: '',
    updatedAt: 0,
    error: null
  }
}

export class PdfTranslationState {
  constructor() {
    this.translationStates = new Map()
  }

  get map() {
    return this.translationStates
  }

  set map(nextMap) {
    this.translationStates = nextMap instanceof Map ? nextMap : new Map()
  }

  getBlockTranslationState(blockId) {
    return this.translationStates.get(blockId) || createDefaultPdfTranslationState(blockId)
  }

  setBlockTranslationState(blockId, patch = {}) {
    if (!blockId) return null

    const current = this.getBlockTranslationState(blockId)
    const next = {
      ...current,
      ...patch,
      blockId,
      updatedAt: patch.updatedAt || Date.now()
    }

    this.translationStates.set(blockId, next)
    return next
  }

  updateBlockTranslationStates(blockStates = []) {
    const updatedStates = []
    for (const blockState of blockStates) {
      if (!blockState?.blockId) continue
      updatedStates.push(this.setBlockTranslationState(blockState.blockId, blockState))
    }
    return updatedStates
  }

  resetTranslationStates() {
    this.translationStates.clear()
  }

  hasAnyTranslated() {
    for (const state of this.translationStates.values()) {
      if (state.status === 'translated') return true
    }
    return false
  }

  getStats() {
    let translatedCount = 0
    let failedCount = 0
    let totalCount = 0

    for (const state of this.translationStates.values()) {
      totalCount += 1
      if (state.status === 'translated') translatedCount += 1
      if (state.status === 'error') failedCount += 1
    }

    return {
      totalCount,
      translatedCount,
      failedCount,
      hasTranslatedBlocks: translatedCount > 0
    }
  }

  entries() {
    return this.translationStates.entries()
  }

  values() {
    return this.translationStates.values()
  }
}
