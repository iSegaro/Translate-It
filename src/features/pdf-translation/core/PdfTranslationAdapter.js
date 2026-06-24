import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { TranslationMode } from '@/shared/config/config.js'
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js'
import { normalizePdfText } from './PdfBlockIdentity.js'

const STRUCTURED_BLOCK_MAX_LINES = 30
const STRUCTURED_MAX_CELLS_PER_LINE = 10

function isStructuredBlock(block) {
  if (block?.roleMetadata?.isStructured !== true) return false
  if (!Array.isArray(block?.lines) || block.lines.length === 0) return false
  if (block.lines.length > STRUCTURED_BLOCK_MAX_LINES) return false
  return block.lines.length > 1 || block.lines.some((line) => line.items?.length > 1)
}

function normalizeTranslatedText(value) {
  if (typeof value !== 'string') return normalizePdfText(value)

  return value
    .replace(/\u00A0/g, ' ')
    .replace(/[\s\u200B-\u200D\uFEFF]+/gu, ' ')
    .trim()
}

function normalizeStructuredTranslatedText(value) {
  if (typeof value !== 'string') return normalizePdfText(value)

  return value
    .split('\n')
    .map((line) => line.replace(/\u00A0/g, ' ').replace(/[^\S\n\r]+/gu, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim()
}

function normalizeCellText(value) {
  if (typeof value !== 'string') return normalizePdfText(value)

  return value.replace(/\u00A0/g, ' ').replace(/[^\S\n\r]+/gu, ' ').trim()
}

function extractTranslatedString(translatedItem) {
  if (translatedItem === null || translatedItem === undefined) return ''
  if (typeof translatedItem === 'string') return translatedItem
  if (typeof translatedItem === 'object') return translatedItem.text ?? translatedItem.t ?? translatedItem.translation ?? ''
  return String(translatedItem)
}

function extractBlockId(translatedItem, originalItem) {
  if (translatedItem && typeof translatedItem === 'object') {
    return translatedItem.blockId || translatedItem.b || translatedItem.id || originalItem.blockId || originalItem.b || originalItem.i
  }

  return originalItem.blockId || originalItem.b || originalItem.i
}

export class PdfTranslationAdapter {
  toProviderItems(blocks = []) {
    const items = []

    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = blocks[blockIndex]

      if (isStructuredBlock(block)) {
        for (let lineIndex = 0; lineIndex < block.lines.length; lineIndex++) {
          const line = block.lines[lineIndex]
          const cellItems = line.items

          if (cellItems && cellItems.length > 1 && cellItems.length <= STRUCTURED_MAX_CELLS_PER_LINE) {
            for (let cellIndex = 0; cellIndex < cellItems.length; cellIndex++) {
              const cell = cellItems[cellIndex]
              items.push({
                i: block.id,
                b: block.id,
                blockId: block.id,
                r: block.role,
                t: cell.text,
                text: cell.text,
                lineIndex,
                cellIndex,
                isStructured: true,
                sourceTextHash: block.sourceTextHash,
                pageNumber: block.pageNumber,
                columnIndex: block.columnIndex,
                readingOrderIndex: block.readingOrderIndex,
                position: items.length
              })
            }
          } else {
            items.push({
              i: block.id,
              b: block.id,
              blockId: block.id,
              r: block.role,
              t: line.text,
              text: line.text,
              lineIndex,
              isStructured: true,
              sourceTextHash: block.sourceTextHash,
              pageNumber: block.pageNumber,
              columnIndex: block.columnIndex,
              readingOrderIndex: block.readingOrderIndex,
              position: items.length
            })
          }
        }
      } else {
        items.push({
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
          position: items.length
        })
      }
    }

    return items
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
      const blockId = extractBlockId(translatedItem, originalItem)

      if (!grouped.has(blockId)) {
        grouped.set(blockId, {
          blockId,
          status: 'translated',
          provider: response.provider || provider || '',
          sourceLanguage: response.sourceLanguage || sourceLanguage || '',
          targetLanguage: response.targetLanguage || targetLanguage || '',
          sourceTextHash: originalItem.sourceTextHash || '',
          error: null,
          parts: [],
          lineResults: new Map(),
          isStructured: originalItem.isStructured === true
        })
      }

      const group = grouped.get(blockId)
      const lineIndex = originalItem.lineIndex
      const cellIndex = originalItem.cellIndex

      if (group.isStructured && lineIndex != null) {
        if (!group.lineResults.has(lineIndex)) {
          group.lineResults.set(lineIndex, { cells: [], lineText: '' })
        }
        const lineResult = group.lineResults.get(lineIndex)

        if (cellIndex != null) {
          lineResult.cells[cellIndex] = translatedText
        } else {
          lineResult.lineText = translatedText
        }
      } else {
        group.parts.push(translatedText)
      }
    })

    return [...grouped.values()].map((entry) => {
      const translatedCells = this._buildTranslatedCells(entry)
      const lineTexts = this._buildLineTexts(entry)

      return {
        blockId: entry.blockId,
        translatedText: entry.isStructured
          ? normalizeStructuredTranslatedText(lineTexts.join('\n'))
          : normalizeTranslatedText(lineTexts.join(' ')),
        translatedCells: translatedCells || undefined,
        status: entry.status,
        provider: entry.provider,
        sourceLanguage: entry.sourceLanguage,
        targetLanguage: entry.targetLanguage,
        sourceTextHash: entry.sourceTextHash,
        error: entry.error
      }
    })
  }

  _buildLineTexts(entry) {
    if (!entry.isStructured || entry.lineResults.size === 0) {
      return entry.parts || []
    }

    const sortedIndices = [...entry.lineResults.keys()].sort((a, b) => a - b)
    return sortedIndices.map((lineIndex) => {
      const lr = entry.lineResults.get(lineIndex)
      if (lr.cells.length > 0) {
        return normalizeStructuredTranslatedText(lr.cells.filter(Boolean).join(' '))
      }
      return lr.lineText || ''
    })
  }

  _buildTranslatedCells(entry) {
    if (!entry.isStructured || entry.lineResults.size === 0) return null

    const hasAnyCells = [...entry.lineResults.values()].some((lr) => lr.cells.length > 0)
    if (!hasAnyCells) return null

    const sortedIndices = [...entry.lineResults.keys()].sort((a, b) => a - b)
    return sortedIndices.map((lineIndex) => {
      const lr = entry.lineResults.get(lineIndex)
      return {
        lineIndex,
        cells: lr.cells.length > 0
          ? lr.cells.map((c) => normalizeCellText(c || ''))
          : [normalizeCellText(lr.lineText || '')]
      }
    })
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
      if (!r?.blockId) continue
      if (!resultByBlockId.has(r.blockId)) {
        resultByBlockId.set(r.blockId, [])
      }
      resultByBlockId.get(r.blockId).push(r)
    }

    const itemsByBlockId = new Map()
    for (const item of batchItems) {
      if (!itemsByBlockId.has(item.blockId)) {
        itemsByBlockId.set(item.blockId, [])
      }
      itemsByBlockId.get(item.blockId).push(item)
    }

    return [...resultByBlockId.entries()].map(([blockId, results]) => {
      const blockItems = itemsByBlockId.get(blockId) || []
      const representativeItem = blockItems[0]
      const isStructured = representativeItem?.isStructured === true

      if (results.length === 1 && !isStructured) {
        const direct = results[0]
        const translatedText = normalizeTranslatedText(direct.t || direct.text || direct.translatedText || '')
        return {
          blockId,
          translatedText,
          status: translatedText ? 'translated' : 'error',
          provider: direct.provider || provider || '',
          sourceLanguage: direct.sourceLanguage || sourceLanguage || '',
          targetLanguage: direct.targetLanguage || targetLanguage || '',
          sourceTextHash: representativeItem?.sourceTextHash || '',
          error: translatedText ? null : 'Empty translation result'
        }
      }

      if (isStructured) {
        return this._mergeStructuredDirectResults(blockId, blockItems, results, {
          provider, sourceLanguage, targetLanguage
        })
      }

      const translatedText = normalizeStructuredTranslatedText(
        results.map((r) => extractTranslatedString(r.t || r.text || r.translatedText)).join('\n')
      )
      const lastResult = results[results.length - 1] || {}
      return {
        blockId,
        translatedText,
        status: translatedText ? 'translated' : 'error',
        provider: lastResult.provider || provider || '',
        sourceLanguage: lastResult.sourceLanguage || sourceLanguage || '',
        targetLanguage: lastResult.targetLanguage || targetLanguage || '',
        sourceTextHash: representativeItem?.sourceTextHash || '',
        error: translatedText ? null : 'Empty translation result'
      }
    })
  }

  _mergeStructuredDirectResults(blockId, blockItems, results, {
    provider,
    sourceLanguage,
    targetLanguage
  } = {}) {
    const lineResults = new Map()

    for (let i = 0; i < blockItems.length; i++) {
      const item = blockItems[i]
      const lineIndex = item.lineIndex
      if (lineIndex == null) continue

      if (!lineResults.has(lineIndex)) {
        lineResults.set(lineIndex, { cells: [], lineText: '' })
      }
      const lr = lineResults.get(lineIndex)
      const text = results[i] ? extractTranslatedString(results[i].t || results[i].text || results[i].translatedText) : ''

      if (item.cellIndex != null) {
        lr.cells[item.cellIndex] = text
      } else if (!lr.lineText) {
        lr.lineText = text
      }
    }

    const sortedIndices = [...lineResults.keys()].sort((a, b) => a - b)
    const lineTexts = sortedIndices.map((idx) => {
      const lr = lineResults.get(idx)
      if (lr.cells.length > 0) {
        return normalizeStructuredTranslatedText(lr.cells.filter(Boolean).join(' '))
      }
      return lr.lineText || ''
    })

    const hasAnyCells = [...lineResults.values()].some((lr) => lr.cells.length > 0)
    const translatedCells = hasAnyCells
      ? sortedIndices.map((idx) => {
        const lr = lineResults.get(idx)
        return {
          lineIndex: idx,
          cells: lr.cells.length > 0
            ? lr.cells.map((c) => normalizeCellText(c || ''))
            : [normalizeCellText(lr.lineText || '')]
        }
      })
      : undefined

    const lastResult = results[results.length - 1] || {}
    const translatedText = normalizeStructuredTranslatedText(lineTexts.join('\n'))

    return {
      blockId,
      translatedText,
      translatedCells,
      status: translatedText ? 'translated' : 'error',
      provider: lastResult.provider || provider || '',
      sourceLanguage: lastResult.sourceLanguage || sourceLanguage || '',
      targetLanguage: lastResult.targetLanguage || targetLanguage || '',
      sourceTextHash: blockItems[0]?.sourceTextHash || '',
      error: translatedText ? null : 'Empty translation result'
    }
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
