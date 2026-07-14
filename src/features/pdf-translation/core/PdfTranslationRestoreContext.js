export function createTranslationRestoreContext({
  getDocumentGeneration,
  documentGeneration,
  getSettingsVersion = null,
  resolveSettings
} = {}) {
  const initialSettingsVersion = typeof getSettingsVersion === 'function'
    ? getSettingsVersion()
    : 0
  const pendingRestorePages = new Set()
  let disposed = false

  const context = {
    documentGeneration,
    settingsVersion: initialSettingsVersion,
    settingsHashPromise: Promise.resolve().then(() => resolveSettings()),

    isCurrent() {
      if (disposed) return false
      if (typeof getDocumentGeneration === 'function' && getDocumentGeneration() !== documentGeneration) return false
      if (typeof getSettingsVersion === 'function' && getSettingsVersion() !== initialSettingsVersion) return false
      return true
    },

    tryBeginPageRestore(pageNumber) {
      if (!this.isCurrent() || pendingRestorePages.has(pageNumber)) return false
      pendingRestorePages.add(pageNumber)
      return true
    },

    finishPageRestore(pageNumber) {
      pendingRestorePages.delete(pageNumber)
    },

    dispose() {
      disposed = true
      pendingRestorePages.clear()
    },

    get pendingPageCount() {
      return pendingRestorePages.size
    }
  }

  return context
}
