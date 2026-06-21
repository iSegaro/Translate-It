import { onBeforeUnmount, ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { pdfDocumentSession } from '@/features/pdf-translation/core/PdfDocumentSession.js'
import { PdfBlockTargetingManager } from '@/features/pdf-translation/core/PdfBlockTargetingManager.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfBlockSelection')

export function usePdfBlockSelection() {
  const tick = ref(0)

  const targetingManager = new PdfBlockTargetingManager(pdfDocumentSession, {
    onStateChange: () => {
      tick.value += 1
    }
  })

  const isBlockTargetingActive = ref(false)
  const highlightedBlockId = ref(null)
  const targetedBlockId = ref(null)

  function syncState() {
    isBlockTargetingActive.value = targetingManager.isActive
    highlightedBlockId.value = targetingManager.highlightedBlockId
    targetedBlockId.value = targetingManager.targetedBlockId
  }

  function activateBlockTargeting() {
    targetingManager.activate()
    syncState()
    logger.info('Block targeting activated from UI')
  }

  function deactivateBlockTargeting() {
    targetingManager.deactivate()
    syncState()
    logger.info('Block targeting deactivated from UI')
  }

  function toggleBlockTargeting() {
    if (targetingManager.isActive) {
      deactivateBlockTargeting()
    } else {
      activateBlockTargeting()
    }
  }

  function handleBlockPointerMove(payload) {
    targetingManager.handlePointerMove(payload)
    syncState()
  }

  function handleBlockClick(payload) {
    targetingManager.handleClick(payload)
    syncState()
  }

  function clearTargetedBlock() {
    pdfDocumentSession.clearTargetedBlock()
    targetedBlockId.value = null
  }

  function getBlockBounds(blockId) {
    return targetingManager.getBlockBounds(blockId)
  }

  onBeforeUnmount(() => {
    targetingManager.destroy()
  })

  return {
    isBlockTargetingActive,
    highlightedBlockId,
    targetedBlockId,
    activateBlockTargeting,
    deactivateBlockTargeting,
    toggleBlockTargeting,
    handleBlockPointerMove,
    handleBlockClick,
    clearTargetedBlock,
    getBlockBounds
  }
}
