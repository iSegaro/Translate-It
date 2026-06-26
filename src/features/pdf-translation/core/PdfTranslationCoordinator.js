import { TranslationMode, getProviderOptimizationLevelAsync, getSourceLanguageAsync, getTargetLanguageAsync, getTranslationApiAsync, getModeProvidersAsync } from '@/shared/config/config.js'
import { sendRegularMessage } from '@/shared/messaging/core/UnifiedMessaging.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js'
import { PdfTranslationAdapter } from './PdfTranslationAdapter.js'
import { PdfTranslationBatchPlanner } from './PdfTranslationBatchPlanner.js'
import { enrichBlocksWithTableMetadata } from './TableRegionAnalyzer.js'

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
      totalCount: 0
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
          totalCount: translatedCount
        }
        return this.lastSummary
      }

      const pageLayout = this.session.getPageLayout?.() || null
      const enrichedBlocks = enrichBlocksWithTableMetadata(visibleBlocks, pageLayout)

      const provider = await this._resolveProvider()
      const sourceLanguage = await getSourceLanguageAsync()
      const targetLanguage = await getTargetLanguageAsync()
      const optimizationLevel = await getProviderOptimizationLevelAsync(provider)
      const batches = this.batchPlanner.plan(enrichedBlocks, {
        providerName: provider,
        optimizationLevel
      })

      let translatedCount = 0
      let failedCount = 0

      for (const batch of batches) {
        if (!this._isRunCurrent(runId)) {
          break
        }

        this._markBlocksLoading(batch.blocks)

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
              pageNumbers: batch.blocks.map((block) => block.pageNumber)
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
          totalCount: translatedCount + failedCount
        }
        return this.lastSummary
      }

      this.lastSummary = {
        status: failedCount > 0 ? 'partial' : 'translated',
        translatedCount,
        failedCount,
        totalCount: translatedCount + failedCount
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
    this._notifyStateChange()
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
      this.session.setBlockTranslationState(result.blockId, {
        translatedText: result.translatedText,
        translatedCells: result.translatedCells || null,
        status: 'translated',
        provider: result.provider || '',
        sourceLanguage: result.sourceLanguage || '',
        targetLanguage: result.targetLanguage || '',
        sourceTextHash: result.sourceTextHash || '',
        error: null
      })
    }

    this._notifyStateChange()
    return { translatedCount, failedCount }
  }

  _notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange()
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
