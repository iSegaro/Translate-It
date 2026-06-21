import ResourceTracker from '@/core/memory/ResourceTracker.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { PdfBlockTargetAdapter } from './PdfBlockTargetAdapter.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'PdfBlockTargetingManager')

export class PdfBlockTargetingManager extends ResourceTracker {
  constructor(session, { onStateChange = null } = {}) {
    super('pdf-block-targeting')

    this.session = session
    this.adapter = new PdfBlockTargetAdapter(session)
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : null

    this.isActive = false
    this.highlightedBlockId = null
    this.targetedBlockId = null
  }

  activate() {
    if (this.isActive) return

    this.isActive = true
    this.highlightedBlockId = null
    this.targetedBlockId = null
    this._notifyStateChange()

    logger.info('Block targeting activated')
  }

  deactivate() {
    if (!this.isActive) return

    this.isActive = false
    this.highlightedBlockId = null
    this.targetedBlockId = null
    this._notifyStateChange()

    logger.info('Block targeting deactivated')
  }

  clearHighlight() {
    if (!this.highlightedBlockId) return

    this.highlightedBlockId = null
    this._notifyStateChange()
  }

  handlePointerMove({ pageNumber, x, y }) {
    if (!this.isActive) return

    const block = this.adapter.findBlockAtPoint({ pageNumber, x, y })
    const nextId = block?.id || null

    if (nextId === this.highlightedBlockId) return

    this.highlightedBlockId = nextId
    this._notifyStateChange()
  }

  handleClick({ pageNumber, x, y }) {
    if (!this.isActive) return

    const block = this.adapter.findBlockAtPoint({ pageNumber, x, y })
    if (!block) {
      this.clearHighlight()
      return
    }

    this.targetedBlockId = block.id
    this.highlightedBlockId = null
    this.session.setTargetedBlock(block.id)

    this.isActive = false
    this._notifyStateChange()

    logger.info('Block targeted:', { blockId: block.id, pageNumber })
  }

  getBlockBounds(blockId) {
    return this.adapter.getBlockBounds(blockId)
  }

  _notifyStateChange() {
    if (this.onStateChange) {
      this.onStateChange()
    }
  }

  destroy() {
    this.deactivate()
    super.destroy()
  }
}
