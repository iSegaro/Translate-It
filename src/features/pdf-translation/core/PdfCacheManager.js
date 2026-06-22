import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { storageCore } from '@/shared/storage/core/StorageCore.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfCacheManager')
const STORAGE_KEY = 'pdfDocumentCache'

export class PdfCacheManager {
  async loadDocument(documentIdentity) {
    if (!documentIdentity) return { translations: {}, ocr: {} }

    try {
      const cache = await storageCore.get(STORAGE_KEY) || {}
      const docCache = cache[documentIdentity]

      if (!docCache) {
        return { translations: {}, ocr: {} }
      }

      return {
        translations: docCache.translations || {},
        ocr: docCache.ocr || {}
      }
    } catch (error) {
      logger.warn('Failed to load document cache:', error)
      return { translations: {}, ocr: {} }
    }
  }

  async saveTranslations(documentIdentity, entries) {
    if (!documentIdentity || !entries || Object.keys(entries).length === 0) return

    try {
      const cache = await storageCore.get(STORAGE_KEY) || {}

      if (!cache[documentIdentity]) {
        cache[documentIdentity] = { translations: {}, ocr: {}, updatedAt: Date.now() }
      }

      for (const [blockId, entry] of Object.entries(entries)) {
        if (entry.status === 'translated') {
          cache[documentIdentity].translations[blockId] = entry
        }
      }

      cache[documentIdentity].updatedAt = Date.now()
      await storageCore.set({ [STORAGE_KEY]: cache })

      logger.debug('Saved translations for document:', { documentIdentity, count: Object.keys(entries).length })
    } catch (error) {
      logger.warn('Failed to save translations:', error)
    }
  }

  async saveOcr(documentIdentity, pageNumber, ocrEntry) {
    if (!documentIdentity || !pageNumber || !ocrEntry) return

    try {
      const cache = await storageCore.get(STORAGE_KEY) || {}

      if (!cache[documentIdentity]) {
        cache[documentIdentity] = { translations: {}, ocr: {}, updatedAt: Date.now() }
      }

      cache[documentIdentity].ocr[pageNumber] = ocrEntry
      cache[documentIdentity].updatedAt = Date.now()
      await storageCore.set({ [STORAGE_KEY]: cache })

      logger.debug('Saved OCR for page:', { documentIdentity, pageNumber })
    } catch (error) {
      logger.warn('Failed to save OCR cache:', error)
    }
  }

  async clearDocument(documentIdentity) {
    if (!documentIdentity) return

    try {
      const cache = await storageCore.get(STORAGE_KEY) || {}
      delete cache[documentIdentity]
      await storageCore.set({ [STORAGE_KEY]: cache })

      logger.info('Cleared document cache:', { documentIdentity })
    } catch (error) {
      logger.warn('Failed to clear document cache:', error)
    }
  }

  async clearAll() {
    try {
      await storageCore.set({ [STORAGE_KEY]: {} })
      logger.info('Cleared all PDF document cache')
    } catch (error) {
      logger.warn('Failed to clear all PDF cache:', error)
    }
  }

  async getStats() {
    try {
      const cache = await storageCore.get(STORAGE_KEY) || {}
      const documentCount = Object.keys(cache).length
      let blockCount = 0
      let ocrPageCount = 0

      for (const doc of Object.values(cache)) {
        blockCount += Object.keys(doc.translations || {}).length
        ocrPageCount += Object.keys(doc.ocr || {}).length
      }

      return { documentCount, blockCount, ocrPageCount }
    } catch {
      return { documentCount: 0, blockCount: 0, ocrPageCount: 0 }
    }
  }
}

export const pdfCacheManager = new PdfCacheManager()
