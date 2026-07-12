import { TranslationMode, getProviderOptimizationLevelAsync, getSourceLanguageAsync, getTargetLanguageAsync, getTranslationApiAsync, getModeProvidersAsync } from '@/shared/config/config.js'
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js'
import { PdfTranslationAdapter } from './PdfTranslationAdapter.js'
import { PdfTranslationBatchPlanner } from './PdfTranslationBatchPlanner.js'
import { enrichBlocksWithTableMetadata } from './TableRegionAnalyzer.js'

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function cloneStructuredValue(value) {
  if (value == null) return value

  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value))
}

function cloneTranslatedCellLine(line = null) {
  if (!line || typeof line !== 'object') return null

  const nextLine = {
    lineIndex: line.lineIndex,
    cells: Array.isArray(line.cells) ? [...line.cells] : []
  }

  const metadataKeys = ['cellIds', 'columnIndices', 'rowIndices', 'colSpanCandidates', 'estimatedColSpans']
  for (const key of metadataKeys) {
    if (line[key] == null) continue
    nextLine[key] = Array.isArray(line[key]) ? [...line[key]] : []
  }

  if (line.structuredCells != null) {
    nextLine.structuredCells = Array.isArray(line.structuredCells)
      ? line.structuredCells.map((cell) => (cell == null ? null : cloneStructuredValue(cell)))
      : []
  }

  return nextLine
}

function cloneTranslatedCells(translatedCells = null) {
  if (!Array.isArray(translatedCells) || translatedCells.length === 0) {
    return null
  }

  const cloned = translatedCells.map((line) => cloneTranslatedCellLine(line)).filter(Boolean)
  return cloned.length > 0 ? cloned : null
}

function mergeStructuredTranslatedCells(existingCells = null, incomingCells = null) {
  const current = Array.isArray(existingCells) ? existingCells : []
  const next = Array.isArray(incomingCells) ? incomingCells : []

  if (current.length === 0) {
    return cloneTranslatedCells(next)
  }

  if (next.length === 0) {
    return cloneTranslatedCells(current)
  }

  const allHaveLineIndex = [...current, ...next].every((line) => line && isFiniteNumber(line.lineIndex))

  if (allHaveLineIndex) {
    const mergedByLineIndex = new Map()

    for (const line of current) {
      const cloned = cloneTranslatedCellLine(line)
      if (!cloned) continue
      mergedByLineIndex.set(cloned.lineIndex, cloned)
    }

    for (const line of next) {
      const cloned = cloneTranslatedCellLine(line)
      if (!cloned) continue
      mergedByLineIndex.set(cloned.lineIndex, cloned)
    }

    return [...mergedByLineIndex.keys()]
      .sort((a, b) => a - b)
      .map((lineIndex) => mergedByLineIndex.get(lineIndex))
      .filter(Boolean)
  }

  if (current.length === next.length) {
    const merged = cloneTranslatedCells(current) || []
    for (let i = 0; i < next.length; i++) {
      const cloned = cloneTranslatedCellLine(next[i])
      if (cloned) {
        merged[i] = cloned
      }
    }
    return merged.length > 0 ? merged : null
  }

  return cloneTranslatedCells(next)
}

function deriveStructuredTranslatedText(translatedCells = null) {
  if (!Array.isArray(translatedCells) || translatedCells.length === 0) return ''

  const lines = []
  for (const line of translatedCells) {
    if (!line || typeof line !== 'object' || !Array.isArray(line.cells)) continue
    const cells = line.cells.filter((cell) => typeof cell === 'string' && cell.length > 0)
    lines.push(cells.join(' '))
  }

  return lines.join('\n').trim()
}

export class PdfTranslationCoordinator {
  constructor(session, {
    adapter = new PdfTranslationAdapter(),
    batchPlanner = new PdfTranslationBatchPlanner(adapter),
    onStateChange = null
  } = {}) {
    this.session = session
    this.adapter = adapter
    this.batchPlanner = batchPlanner
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : null
    this.isTranslating = false
    this.activeRunId = 0
    this.activeRequestIds = new Set()
    this.lastSummary = {
      status: 'idle',
      translatedCount: 0,
      failedCount: 0,
      totalCount: 0,
      translationOccurrenceId: 0
    }
  }

  async translateVisibleBlocks() {
    if (this.isTranslating) {
      return this.lastSummary
    }

    const runId = ++this.activeRunId
    this.isTranslating = true
    this.activeRequestIds.clear()

    try {
      const allVisibleBlocks = await this.session.getVisibleLogicalBlocks()
      const visibleBlocks = allVisibleBlocks.filter((block) => {
        const state = this.session.getBlockTranslationState(block.id)
        return state.status !== 'translated'
      })

      if (visibleBlocks.length === 0) {
        const translatedCount = allVisibleBlocks.length
        this.lastSummary = {
          status: translatedCount > 0 ? 'translated' : 'idle',
          translatedCount,
          failedCount: 0,
          totalCount: translatedCount,
          translationOccurrenceId: runId
        }
        return this.lastSummary
      }

      const pageLayout = this.session.getPageLayout?.() || null
      const enrichedBlocks = enrichBlocksWithTableMetadata(visibleBlocks, pageLayout)
      const semanticRegions = pageLayout?.regions || []
      const structuredRegions = pageLayout?.metadata?.structured?.regions || []

      const provider = await this._resolveProvider()
      const sourceLanguage = await getSourceLanguageAsync()
      const targetLanguage = await getTargetLanguageAsync()
      const optimizationLevel = await getProviderOptimizationLevelAsync(provider)
      const batches = this.batchPlanner.plan(enrichedBlocks, {
        providerName: provider,
        optimizationLevel,
        semanticRegions,
        structuredRegions
      })

      let translatedCount = 0
      let failedCount = 0

      for (const batch of batches) {
        if (!this._isRunCurrent(runId)) {
          break
        }

        this._markBlocksLoading(batch.blocks)

        const semanticHint = this.adapter.buildSemanticBatchHint(batch.items)
        const messageId = this._buildMessageId(runId, batch.batchId)
        this.activeRequestIds.add(messageId)

        let response
        try {
          response = await sendRegularMessage(
            this.adapter.buildTranslationRequest(batch.items, {
              provider,
              sourceLanguage,
              targetLanguage,
              messageId,
              sessionId: String(runId),
              documentIdentity: this.session.documentIdentity,
              pageNumbers: batch.blocks.map((block) => block.pageNumber),
              semanticHint
            })
          )
        } catch (error) {
          response = {
            success: false,
            error: error?.message || 'PDF translation failed'
          }
        } finally {
          this.activeRequestIds.delete(messageId)
        }

        if (!this._isRunCurrent(runId)) {
          break
        }

        const mappedResults = this.adapter.mapBatchResponse(batch.items, response, {
          provider,
          sourceLanguage,
          targetLanguage
        })

        const batchCounts = this._applyBatchResults(mappedResults)
        translatedCount += batchCounts.translatedCount
        failedCount += batchCounts.failedCount
      }

      if (!this._isRunCurrent(runId)) {
        this.lastSummary = {
          status: 'cancelled',
          translatedCount,
          failedCount,
          totalCount: translatedCount + failedCount,
          translationOccurrenceId: runId
        }
        return this.lastSummary
      }

      this.lastSummary = {
        status: failedCount > 0 ? 'partial' : 'translated',
        translatedCount,
        failedCount,
        totalCount: translatedCount + failedCount,
        translationOccurrenceId: runId
      }

      return this.lastSummary
    } finally {
      if (this.activeRunId === runId) {
        this.isTranslating = false
      }
    }
  }

  async cancelActiveTranslation(reason = 'stale-run') {
    this.activeRunId += 1

    if (this.activeRequestIds.size === 0) {
      this.isTranslating = false
      return
    }

    const messageIds = [...this.activeRequestIds]
    this.activeRequestIds.clear()
    this.isTranslating = false

    try {
      await sendRegularMessage({
        action: MessageActions.CANCEL_TRANSLATION,
        context: MessageContexts.PDF_TRANSLATION,
        data: {
          cancelAll: true,
          context: MessageContexts.PDF_TRANSLATION,
          reason
        }
      }, { silent: true })
    } catch {
      // Best-effort cancellation only.
    }

    return messageIds
  }

  _markBlocksLoading(blocks = []) {
    for (const block of blocks) {
      this.session.setBlockTranslationState(block.id, {
        translatedText: '',
        status: 'loading',
        provider: '',
        sourceLanguage: '',
        targetLanguage: '',
        sourceTextHash: block.sourceTextHash || '',
        error: null
      })
    }

    const blockIds = blocks.map((block) => block.id).filter(Boolean)
    this._notifyStateChange(blockIds)
  }

  _applyBatchResults(batchResults = []) {
    let translatedCount = 0
    let failedCount = 0

    for (const result of batchResults) {
      if (!result?.blockId) continue

      if (result.status === 'error' || !result.translatedText) {
        failedCount += 1
        this.session.setBlockTranslationState(result.blockId, {
          translatedText: '',
          status: 'error',
          provider: result.provider || '',
          sourceLanguage: result.sourceLanguage || '',
          targetLanguage: result.targetLanguage || '',
          sourceTextHash: result.sourceTextHash || '',
          error: result.error || 'PDF translation failed'
        })
        continue
      }

      translatedCount += 1
      const currentState = this.session.getBlockTranslationState(result.blockId)
      const mergedTranslatedCells = mergeStructuredTranslatedCells(
        currentState?.translatedCells || null,
        result.translatedCells || null
      )
      const nextTranslatedText = mergedTranslatedCells
        ? deriveStructuredTranslatedText(mergedTranslatedCells)
        : result.translatedText

      this.session.setBlockTranslationState(result.blockId, {
        translatedText: nextTranslatedText,
        translatedCells: mergedTranslatedCells,
        status: 'translated',
        provider: result.provider || '',
        sourceLanguage: result.sourceLanguage || '',
        targetLanguage: result.targetLanguage || '',
        sourceTextHash: result.sourceTextHash || '',
        error: null
      })
    }

    const blockIds = batchResults.map((result) => result?.blockId).filter(Boolean)
    this._notifyStateChange(blockIds)
    return { translatedCount, failedCount }
  }

  _notifyStateChange(updatedBlockIds = []) {
    if (this.onStateChange) {
      this.onStateChange(updatedBlockIds)
    }
  }

  async _resolveProvider() {
    const modeProviders = await getModeProvidersAsync()
    const modeProvider = modeProviders?.[TranslationMode.PDF]
    if (modeProvider && modeProvider !== 'default') {
      return modeProvider
    }

    return await getTranslationApiAsync()
  }

  _buildMessageId(runId, batchId) {
    return `pdf-${runId}-${batchId}-${Date.now()}`
  }

  _isRunCurrent(runId) {
    return runId === this.activeRunId
  }
}
