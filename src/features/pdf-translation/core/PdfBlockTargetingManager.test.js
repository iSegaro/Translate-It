import { beforeEach, describe, expect, it, vi } from 'vitest'

const { PdfBlockTargetingManager } = await import('./PdfBlockTargetingManager.js')

describe('PdfBlockTargetingManager', () => {
  let session

  beforeEach(() => {
    session = {
      pageSessions: new Map(),
      targetedBlockId: null,
      setTargetedBlock: vi.fn((blockId) => {
        session.targetedBlockId = blockId
      }),
      clearTargetedBlock: vi.fn(() => {
        session.targetedBlockId = null
      })
    }

    session.pageSessions.set(1, {
      getLogicalBlocks: () => [
        {
          id: 'b1',
          pageNumber: 1,
          boundingBox: { x: 10, y: 20, width: 100, height: 30 },
          text: 'Hello world'
        }
      ]
    })
  })

  it('starts inactive', () => {
    const manager = new PdfBlockTargetingManager(session)

    expect(manager.isActive).toBe(false)
    expect(manager.highlightedBlockId).toBeNull()
    expect(manager.targetedBlockId).toBeNull()
  })

  it('activates and deactivates', () => {
    const manager = new PdfBlockTargetingManager(session)

    manager.activate()
    expect(manager.isActive).toBe(true)

    manager.deactivate()
    expect(manager.isActive).toBe(false)
    expect(manager.highlightedBlockId).toBeNull()
  })

  it('does not double-activate', () => {
    const manager = new PdfBlockTargetingManager(session)
    const onStateChange = vi.fn()
    manager.onStateChange = onStateChange

    manager.activate()
    manager.activate()

    expect(onStateChange).toHaveBeenCalledTimes(1)
  })

  it('handlePointerMove updates highlightedBlockId', () => {
    const manager = new PdfBlockTargetingManager(session)
    manager.activate()

    manager.handlePointerMove({ pageNumber: 1, x: 50, y: 35 })
    expect(manager.highlightedBlockId).toBe('b1')

    manager.handlePointerMove({ pageNumber: 1, x: 500, y: 500 })
    expect(manager.highlightedBlockId).toBeNull()
  })

  it('handlePointerMove does nothing when inactive', () => {
    const manager = new PdfBlockTargetingManager(session)

    manager.handlePointerMove({ pageNumber: 1, x: 50, y: 35 })
    expect(manager.highlightedBlockId).toBeNull()
  })

  it('handleClick sets targetedBlockId and deactivates', () => {
    const manager = new PdfBlockTargetingManager(session)
    manager.activate()

    manager.handleClick({ pageNumber: 1, x: 50, y: 35 })

    expect(manager.targetedBlockId).toBe('b1')
    expect(manager.isActive).toBe(false)
    expect(manager.highlightedBlockId).toBeNull()
    expect(session.setTargetedBlock).toHaveBeenCalledWith('b1')
  })

  it('handleClick does nothing when inactive', () => {
    const manager = new PdfBlockTargetingManager(session)

    manager.handleClick({ pageNumber: 1, x: 50, y: 35 })
    expect(session.setTargetedBlock).not.toHaveBeenCalled()
  })

  it('handleClick with no block clears highlight', () => {
    const manager = new PdfBlockTargetingManager(session)
    manager.activate()
    manager.handlePointerMove({ pageNumber: 1, x: 50, y: 35 })
    expect(manager.highlightedBlockId).toBe('b1')

    manager.handleClick({ pageNumber: 1, x: 500, y: 500 })
    expect(manager.highlightedBlockId).toBeNull()
    expect(manager.isActive).toBe(true)
  })

  it('clearHighlight resets highlightedBlockId', () => {
    const manager = new PdfBlockTargetingManager(session)
    manager.activate()
    manager.handlePointerMove({ pageNumber: 1, x: 50, y: 35 })
    expect(manager.highlightedBlockId).toBe('b1')

    manager.clearHighlight()
    expect(manager.highlightedBlockId).toBeNull()
  })

  it('calls onStateChange callback', () => {
    const onStateChange = vi.fn()
    const manager = new PdfBlockTargetingManager(session, { onStateChange })

    manager.activate()
    expect(onStateChange).toHaveBeenCalledTimes(1)

    manager.handlePointerMove({ pageNumber: 1, x: 50, y: 35 })
    expect(onStateChange).toHaveBeenCalledTimes(2)

    manager.handleClick({ pageNumber: 1, x: 50, y: 35 })
    expect(onStateChange).toHaveBeenCalledTimes(3)
  })

  it('does not trigger translation', () => {
    const manager = new PdfBlockTargetingManager(session)
    manager.activate()

    manager.handleClick({ pageNumber: 1, x: 50, y: 35 })

    expect(session.setTargetedBlock).toHaveBeenCalled()
  })

  it('getBlockBounds delegates to adapter', () => {
    const manager = new PdfBlockTargetingManager(session)
    const bounds = manager.getBlockBounds('b1')

    expect(bounds).toEqual({
      pageNumber: 1,
      x: 10,
      y: 20,
      width: 100,
      height: 30
    })
  })
})
