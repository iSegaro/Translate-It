import { describe, expect, it, vi } from 'vitest'
import { PdfPageSession } from './PdfPageSession.js'

describe('PdfPageSession', () => {
  it('hydrates from a PDF page and exposes logical blocks for the page', async () => {
    const page = {
      pageNumber: 1,
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          {
            str: 'Hello',
            transform: [1, 0, 0, 14, 40, 650],
            width: 30,
            height: 14,
            dir: 'ltr'
          },
          {
            str: 'world',
            transform: [1, 0, 0, 14, 80, 650],
            width: 40,
            height: 14,
            dir: 'ltr'
          }
        ]
      })
    }

    const session = new PdfPageSession({
      documentIdentity: 'fingerprint-1',
      pageNumber: 1
    })

    await session.hydrate(page, {
      naturalWidth: 500,
      naturalHeight: 700
    })

    expect(page.getTextContent).toHaveBeenCalledOnce()
    expect(session.getTextLines()).toHaveLength(1)
    expect(session.getLogicalBlocks()).toHaveLength(1)
    expect(session.getLogicalBlocks()[0].text).toBe('Hello world')
    expect(session.getLogicalBlocks()[0].documentIdentity).toBe('fingerprint-1')
  })

  it('keeps logical block identity stable across different page display scales', async () => {
    const page = {
      pageNumber: 1,
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          {
            str: 'Scale stable',
            transform: [1, 0, 0, 14, 40, 650],
            width: 80,
            height: 14,
            dir: 'ltr'
          }
        ]
      })
    }

    const firstSession = new PdfPageSession({
      documentIdentity: 'fingerprint-1',
      pageNumber: 1
    })
    const secondSession = new PdfPageSession({
      documentIdentity: 'fingerprint-1',
      pageNumber: 1
    })

    await firstSession.hydrate(page, {
      naturalWidth: 500,
      naturalHeight: 700,
      width: 500,
      height: 700,
      scale: 1
    })

    await secondSession.hydrate(page, {
      naturalWidth: 500,
      naturalHeight: 700,
      width: 900,
      height: 1260,
      scale: 1.8
    })

    expect(firstSession.getLogicalBlocks()[0].id).toBe(secondSession.getLogicalBlocks()[0].id)
    expect(firstSession.getLogicalBlocks()[0].sourceTextHash).toHaveLength(64)
    expect(secondSession.getLogicalBlocks()[0].normalizedBoundingBox).toEqual(firstSession.getLogicalBlocks()[0].normalizedBoundingBox)
  })
})
