import { beforeEach, describe, expect, it, vi } from 'vitest'

const { PdfBlockTargetAdapter } = await import('./PdfBlockTargetAdapter.js')

describe('PdfBlockTargetAdapter', () => {
  let session

  beforeEach(() => {
    session = {
      pageSessions: new Map()
    }
  })

  function setupPageSession(pageNumber, blocks) {
    session.pageSessions.set(pageNumber, {
      getLogicalBlocks: () => blocks
    })
  }

  it('finds a block at a point within its bounding box', () => {
    setupPageSession(1, [
      {
        id: 'b1',
        pageNumber: 1,
        boundingBox: { x: 10, y: 20, width: 100, height: 30 }
      }
    ])

    const adapter = new PdfBlockTargetAdapter(session)
    const block = adapter.findBlockAtPoint({ pageNumber: 1, x: 50, y: 35 })

    expect(block).not.toBeNull()
    expect(block.id).toBe('b1')
  })

  it('returns null when no block matches', () => {
    setupPageSession(1, [
      {
        id: 'b1',
        pageNumber: 1,
        boundingBox: { x: 10, y: 20, width: 100, height: 30 }
      }
    ])

    const adapter = new PdfBlockTargetAdapter(session)
    const block = adapter.findBlockAtPoint({ pageNumber: 1, x: 500, y: 500 })

    expect(block).toBeNull()
  })

  it('returns null for non-existent page', () => {
    const adapter = new PdfBlockTargetAdapter(session)
    const block = adapter.findBlockAtPoint({ pageNumber: 99, x: 50, y: 35 })

    expect(block).toBeNull()
  })

  it('applies hit tolerance around bounding box edges', () => {
    setupPageSession(1, [
      {
        id: 'b1',
        pageNumber: 1,
        boundingBox: { x: 10, y: 20, width: 100, height: 30 }
      }
    ])

    const adapter = new PdfBlockTargetAdapter(session)

    const insideTolerance = adapter.findBlockAtPoint({ pageNumber: 1, x: 4, y: 35 })
    expect(insideTolerance).not.toBeNull()

    const farOutside = adapter.findBlockAtPoint({ pageNumber: 1, x: -10, y: 35 })
    expect(farOutside).toBeNull()
  })

  it('returns smallest block when multiple overlap', () => {
    setupPageSession(1, [
      {
        id: 'b-large',
        pageNumber: 1,
        boundingBox: { x: 0, y: 0, width: 200, height: 200 }
      },
      {
        id: 'b-small',
        pageNumber: 1,
        boundingBox: { x: 50, y: 50, width: 40, height: 20 }
      }
    ])

    const adapter = new PdfBlockTargetAdapter(session)
    const block = adapter.findBlockAtPoint({ pageNumber: 1, x: 60, y: 55 })

    expect(block.id).toBe('b-small')
  })

  it('getBlockBounds returns bounds for a known block', () => {
    setupPageSession(1, [
      {
        id: 'b1',
        pageNumber: 1,
        boundingBox: { x: 10, y: 20, width: 100, height: 30 }
      }
    ])

    const adapter = new PdfBlockTargetAdapter(session)
    const bounds = adapter.getBlockBounds('b1')

    expect(bounds).toEqual({
      pageNumber: 1,
      x: 10,
      y: 20,
      width: 100,
      height: 30
    })
  })

  it('getBlockBounds returns null for unknown block', () => {
    const adapter = new PdfBlockTargetAdapter(session)
    const bounds = adapter.getBlockBounds('unknown')

    expect(bounds).toBeNull()
  })
})
