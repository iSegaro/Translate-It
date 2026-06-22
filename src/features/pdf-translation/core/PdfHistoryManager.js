import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { storageCore } from '@/shared/storage/core/StorageCore.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfHistoryManager')
const STORAGE_KEY = 'pdfTranslationHistory'
const MAX_HISTORY_ITEMS = 100

export class PdfHistoryManager {
  async getHistory() {
    try {
      const history = await storageCore.get(STORAGE_KEY) || []
      return Array.isArray(history) ? history : []
    } catch (error) {
      logger.warn('Failed to load PDF history:', error)
      return []
    }
  }

  async upsert(entry) {
    if (!entry?.documentIdentity) return

    try {
      const history = await this.getHistory()
      const existingIndex = history.findIndex((h) => h.documentIdentity === entry.documentIdentity)

      if (existingIndex >= 0) {
        history[existingIndex] = {
          ...history[existingIndex],
          ...entry,
          lastOpenedAt: Date.now()
        }
      } else {
        history.unshift({
          ...entry,
          id: `pdf-${entry.documentIdentity}-${Date.now()}`,
          type: 'pdf-document',
          timestamp: Date.now(),
          lastOpenedAt: Date.now()
        })
      }

      const trimmed = history.slice(0, MAX_HISTORY_ITEMS)
      await storageCore.set({ [STORAGE_KEY]: trimmed })

      logger.debug('PDF history upserted:', { documentIdentity: entry.documentIdentity })
    } catch (error) {
      logger.warn('Failed to upsert PDF history:', error)
    }
  }

  async updateAfterOpen(session) {
    if (!session?.documentIdentity) return

    await this.upsert({
      documentIdentity: session.documentIdentity,
      fileName: session.fileName,
      displayName: session.displayName,
      totalPages: session.totalPages,
      translatedPageCount: 0,
      translatedBlockCount: 0,
      sourceLanguage: '',
      targetLanguage: '',
      provider: ''
    })
  }

  async updateAfterTranslation(session) {
    if (!session?.documentIdentity) return

    const translatedStates = [...session.translationStates.values()]
      .filter((s) => s.status === 'translated')

    const translatedBlockCount = translatedStates.length

    const translatedPageCount = new Set(
      translatedStates
        .map((s) => s.pageNumber || 0)
        .filter((p) => p > 0)
    ).size

    const provider = translatedStates.find((s) => s.provider)?.provider || ''
    const sourceLanguage = translatedStates.find((s) => s.sourceLanguage)?.sourceLanguage || ''
    const targetLanguage = translatedStates.find((s) => s.targetLanguage)?.targetLanguage || ''

    await this.upsert({
      documentIdentity: session.documentIdentity,
      fileName: session.fileName,
      displayName: session.displayName,
      totalPages: session.totalPages,
      translatedPageCount,
      translatedBlockCount,
      sourceLanguage,
      targetLanguage,
      provider
    })
  }

  async removeEntry(id) {
    try {
      const history = await this.getHistory()
      const filtered = history.filter((h) => h.id !== id)
      await storageCore.set({ [STORAGE_KEY]: filtered })
    } catch (error) {
      logger.warn('Failed to remove PDF history entry:', error)
    }
  }

  async clearHistory() {
    try {
      await storageCore.set({ [STORAGE_KEY]: [] })
      logger.info('PDF history cleared')
    } catch (error) {
      logger.warn('Failed to clear PDF history:', error)
    }
  }
}

export const pdfHistoryManager = new PdfHistoryManager()
