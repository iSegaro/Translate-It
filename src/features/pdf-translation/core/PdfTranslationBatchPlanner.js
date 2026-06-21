import { getProviderConfiguration } from '@/features/translation/core/ProviderConfigurations.js'
import { TranslationMode } from '@/shared/config/config.js'
import { TranslationBatcher } from '@/features/translation/core/utils/TranslationBatcher.js'
import { PdfTranslationAdapter } from './PdfTranslationAdapter.js'

export class PdfTranslationBatchPlanner {
  constructor(adapter = new PdfTranslationAdapter()) {
    this.adapter = adapter
  }

  plan(blocks = [], {
    providerName,
    optimizationLevel = 3
  } = {}) {
    const providerConfig = getProviderConfiguration(providerName, optimizationLevel)
    const items = this.adapter.toProviderItems(blocks)
    const batchConfig = providerConfig?.batching?.modeOverrides?.[TranslationMode.PDF] || {}
    const baseBatchSize = batchConfig.optimalSize || providerConfig?.batching?.optimalSize || providerConfig?.batching?.maxChunksPerBatch || 8
    const characterLimit = batchConfig.characterLimit || providerConfig?.batching?.characterLimit || providerConfig?.batching?.maxChars || 5000
    const rawBatches = TranslationBatcher.createIntelligentBatches(items, baseBatchSize, characterLimit)
    const blockById = new Map(blocks.map((block) => [block.id, block]))

    return rawBatches.map((itemsInBatch, batchIndex) => ({
      batchId: `pdf-batch-${batchIndex}`,
      items: itemsInBatch,
      blocks: this._resolveBatchBlocks(itemsInBatch, blockById)
    }))
  }

  _resolveBatchBlocks(itemsInBatch, blockById) {
    const blockIds = []
    for (const item of itemsInBatch) {
      const blockId = item.blockId || item.b || item.i
      if (blockId && !blockIds.includes(blockId)) {
        blockIds.push(blockId)
      }
    }

    return blockIds.map((blockId) => blockById.get(blockId)).filter(Boolean)
  }
}
