import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { TranslationMode } from '@/shared/config/config.js'
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js'
import { normalizePdfText } from './PdfBlockIdentity.js'

function normalizeTranslatedText(value) {
  if (typeof value !== 'string') return normalizePdfText(value)

  return value
    .replace(/\u00A0/g, ' ')
    .replace(/[\s\u200B-\u200D\uFEFF]+/gu, ' ')
    .trim()
}

export class PdfTranslationAdapter {
  toProviderItems(blocks = []) {
    return blocks.map((block, index) => ({
      i: block.id,
      b: block.id,
      blockId: block.id,
      r: block.role,
      t: block.text,
      text: block.text,
      sourceTextHash: block.sourceTextHash,
      pageNumber: block.pageNumber,
      columnIndex: block.columnIndex,
      readingOrderIndex: block.readingOrderIndex,
      position: index
    }))
  }

  buildTranslationRequest(items, {
    provider,
    sourceLanguage,
    targetLanguage,
    messageId,
    sessionId,
    documentIdentity = '',
    pageNumbers = []
  }) {
    return {
      action: MessageActions.TRANSLATE,
      messageId,
      context: MessageContexts.PDF_TRANSLATION,
      data: {
        text: items,
        provider,
        sourceLanguage,
        targetLanguage,
        mode: TranslationMode.PDF,
        pdfTranslation: true,
        isExplicitProvider: true,
        documentIdentity,
        pageNumbers,
        options: {
          rawJsonPayload: true,
          pdfTranslation: true,
          documentIdentity,
          pageNumbers,
          sessionId
        }
      }
    }
  }

  mapBatchResponse(batchItems, response, {
    provider,
    sourceLanguage,
    targetLanguage
  } = {}) {
    if (!Array.isArray(batchItems) || batchItems.length === 0) {
      return []
    }

    if (!response || response.success === false) {
      const errorMessage = response?.error?.message || response?.error || 'PDF translation failed'
      return batchItems.map((item) => ({
        blockId: item.blockId,
        status: 'error',
        translatedText: '',
        provider: provider || response?.provider || '',
        sourceLanguage: sourceLanguage || response?.sourceLanguage || '',
        targetLanguage: targetLanguage || response?.targetLanguage || '',
        sourceTextHash: item.sourceTextHash || '',
        error: errorMessage
      }))
    }

    // Direct results from OptimizedJsonHandler (already mapped with blockId + translatedText)
    if (this._isMappedResults(response.results)) {
      return this._mergeDirectResults(batchItems, response.results, {
        provider, sourceLanguage, targetLanguage
      })
    }

    const translatedPayload = response.translatedText ?? response.results ?? response
    const rawResults = this._normalizeTranslatedPayload(translatedPayload)

    const grouped = new Map()

    batchItems.forEach((originalItem, index) => {
      const translatedItem = rawResults[index]
      const translatedText = this._extractTranslatedText(translatedItem, originalItem)
      const blockId = this._extractBlockId(translatedItem, originalItem)

      if (!grouped.has(blockId)) {
        grouped.set(blockId, {
          blockId,
          translatedText: '',
          status: 'translated',
          provider: response.provider || provider || '',
          sourceLanguage: response.sourceLanguage || sourceLanguage || '',
          targetLanguage: response.targetLanguage || targetLanguage || '',
          sourceTextHash: originalItem.sourceTextHash || '',
          error: null,
          parts: []
        })
      }

      grouped.get(blockId).parts.push(translatedText)
    })

    return [...grouped.values()].map((entry) => ({
      blockId: entry.blockId,
      translatedText: normalizeTranslatedText(entry.parts.join(' ')),
      status: entry.status,
      provider: entry.provider,
      sourceLanguage: entry.sourceLanguage,
      targetLanguage: entry.targetLanguage,
      sourceTextHash: entry.sourceTextHash,
      error: entry.error
    }))
  }

  _isMappedResults(results) {
    if (!Array.isArray(results) || results.length === 0) return false
    const first = results[0]
    return first && typeof first === 'object' && 'blockId' in first
  }

  _mergeDirectResults(batchItems, mappedResults, {
    provider,
    sourceLanguage,
    targetLanguage
  } = {}) {
    const resultByBlockId = new Map()
    for (const r of mappedResults) {
      if (r?.blockId) resultByBlockId.set(r.blockId, r)
    }

    return batchItems.map((item) => {
      const direct = resultByBlockId.get(item.blockId)
      if (!direct) {
        return {
          blockId: item.blockId,
          status: 'error',
          translatedText: '',
          provider: provider || '',
          sourceLanguage: sourceLanguage || '',
          targetLanguage: targetLanguage || '',
          sourceTextHash: item.sourceTextHash || '',
          error: 'Missing result for block'
        }
      }

      const translatedText = normalizeTranslatedText(direct.t || direct.text || direct.translatedText || '')
      return {
        blockId: item.blockId,
        translatedText,
        status: translatedText ? 'translated' : 'error',
        provider: direct.provider || provider || '',
        sourceLanguage: direct.sourceLanguage || sourceLanguage || '',
        targetLanguage: direct.targetLanguage || targetLanguage || '',
        sourceTextHash: item.sourceTextHash || '',
        error: translatedText ? null : 'Empty translation result'
      }
    })
  }

  _extractBlockId(translatedItem, originalItem) {
    if (translatedItem && typeof translatedItem === 'object') {
      return translatedItem.blockId || translatedItem.b || translatedItem.id || originalItem.blockId || originalItem.b || originalItem.i
    }

    return originalItem.blockId || originalItem.b || originalItem.i
  }

  _extractTranslatedText(translatedItem, originalItem) {
    if (translatedItem === null || translatedItem === undefined) {
      return normalizePdfText(originalItem?.text || originalItem?.t || '')
    }

    if (typeof translatedItem === 'string') {
      return normalizeTranslatedText(translatedItem)
    }

    if (typeof translatedItem === 'object') {
      return normalizeTranslatedText(translatedItem.text ?? translatedItem.t ?? translatedItem.translation ?? '')
    }

    return normalizeTranslatedText(String(translatedItem))
  }

  _normalizeTranslatedPayload(payload) {
    if (Array.isArray(payload)) {
      return payload
    }

    if (typeof payload === 'string') {
      const trimmed = payload.trim()
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed = JSON.parse(trimmed)
          return Array.isArray(parsed) ? parsed : [parsed]
        } catch {
          return [payload]
        }
      }

      return [payload]
    }

    if (payload && typeof payload === 'object') {
      const candidate = payload.translations || payload.results
      if (Array.isArray(candidate)) {
        return candidate
      }

      if (candidate && typeof candidate === 'object') {
        return [candidate]
      }

      return [payload]
    }

    return [payload]
  }
}
