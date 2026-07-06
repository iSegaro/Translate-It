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

describe('PdfPageSession OCR state', () => {
  it('initializes OCR state to defaults', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })

    expect(session.ocrBlocks).toEqual([])
    expect(session.ocrLanguage).toBeNull()
    expect(session.ocrCompletedAt).toBe(0)
    expect(session.ocrError).toBeNull()
  })

  it('setOcrBlocks stores blocks and metadata', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    const blocks = [{ id: 'ocr-1', text: 'Hello' }]

    session.setOcrBlocks(blocks, 'eng')

    expect(session.ocrBlocks).toEqual(blocks)
    expect(session.ocrLanguage).toBe('eng')
    expect(session.ocrCompletedAt).toBeGreaterThan(0)
    expect(session.ocrError).toBeNull()
  })

  it('clearOcrBlocks resets OCR state', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng')

    session.clearOcrBlocks()

    expect(session.ocrBlocks).toEqual([])
    expect(session.ocrLanguage).toBeNull()
    expect(session.ocrCompletedAt).toBe(0)
    expect(session.ocrError).toBeNull()
  })

  it('hasOcrForLanguage returns true for matching language', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng')

    expect(session.hasOcrForLanguage('eng')).toBe(true)
    expect(session.hasOcrForLanguage('fas')).toBe(false)
  })

  it('hasOcrForLanguage returns false when no OCR blocks', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })

    expect(session.hasOcrForLanguage('eng')).toBe(false)
  })

  it('getLogicalBlocks returns OCR blocks when no text-layer blocks', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    const ocrBlocks = [{ id: 'ocr-1', text: 'OCR text' }]
    session.setOcrBlocks(ocrBlocks, 'eng')

    const blocks = session.getLogicalBlocks()

    expect(blocks).toHaveLength(1)
    expect(blocks[0].id).toBe('ocr-1')
  })

  it('getLogicalBlocks returns text-layer blocks when they exist', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    session.logicalBlocks = [{ id: 'text-1', text: 'Text layer' }]
    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng')

    const blocks = session.getLogicalBlocks()

    expect(blocks).toHaveLength(1)
    expect(blocks[0].id).toBe('text-1')
  })

  it('allBlocks returns both text-layer and OCR blocks', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    session.logicalBlocks = [{ id: 'text-1' }]
    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng')

    expect(session.allBlocks).toHaveLength(2)
  })

  it('reset clears OCR state', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng')
    session.ocrError = 'some error'

    session.reset()

    expect(session.ocrBlocks).toEqual([])
    expect(session.ocrLanguage).toBeNull()
    expect(session.ocrCompletedAt).toBe(0)
    expect(session.ocrError).toBeNull()
  })
})

describe('PdfPageSession release', () => {
  it('clears heavy fields but preserves OCR data and identity', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    session.pageSize = { width: 500, height: 700 }
    session.textContent = { items: [{ str: 'hello' }] }
    session.lines = [{ text: 'hello' }]
    session.logicalBlocks = [{ id: 'block-1' }]
    session.pageMaskModel = { masks: [] }
    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng')
    session.loaded = true
    session.loadedAt = 1000
    session.displayScale = 1.5

    session.release()

    expect(session.pageNumber).toBe(1)
    expect(session.documentIdentity).toBe('doc-1')
    expect(session.pageSize).toEqual({ width: 500, height: 700 })
    expect(session.displayScale).toBe(1.5)
    expect(session.ocrBlocks).toEqual([{ id: 'ocr-1' }])
    expect(session.ocrLanguage).toBe('eng')

    expect(session.textContent).toBeNull()
    expect(session.lines).toEqual([])
    expect(session.logicalBlocks).toEqual([])
    expect(session.pageMaskModel).toBeNull()
    expect(session.loaded).toBe(false)
    expect(session.loadedAt).toBe(0)
  })

  it('supports hydrate → release → hydrate cycle', async () => {
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
          }
        ]
      })
    }

    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })

    await session.hydrate(page, { naturalWidth: 500, naturalHeight: 700 })
    expect(session.loaded).toBe(true)
    expect(session.getLogicalBlocks()).toHaveLength(1)
    expect(page.getTextContent).toHaveBeenCalledTimes(1)

    session.release()
    expect(session.loaded).toBe(false)
    expect(session.getLogicalBlocks()).toHaveLength(0)

    page.getTextContent.mockClear()
    await session.hydrate(page, { naturalWidth: 500, naturalHeight: 700 })
    expect(session.loaded).toBe(true)
    expect(session.getLogicalBlocks()).toHaveLength(1)
    expect(page.getTextContent).toHaveBeenCalledTimes(1)
  })

  it('preserves OCR data after release and hydration recovers text blocks', async () => {
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
          }
        ]
      })
    }

    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    await session.hydrate(page, { naturalWidth: 500, naturalHeight: 700 })
    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng')

    session.release()

    expect(session.ocrBlocks).toEqual([{ id: 'ocr-1' }])
    expect(session.ocrLanguage).toBe('eng')
  })

  it('is idempotent — second call is a no-op', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    session.loaded = true
    session.textContent = { items: [] }

    session.release()
    const firstState = {
      loaded: session.loaded,
      textContent: session.textContent,
      loadedAt: session.loadedAt
    }

    session.release()
    expect(session.loaded).toBe(firstState.loaded)
    expect(session.textContent).toBe(firstState.textContent)
    expect(session.loadedAt).toBe(firstState.loadedAt)
  })

  it('is a no-op when called on never-hydrated session', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    const initialState = {
      loaded: session.loaded,
      textContent: session.textContent,
      loadedAt: session.loadedAt
    }

    session.release()

    expect(session.loaded).toBe(initialState.loaded)
    expect(session.textContent).toBe(initialState.textContent)
    expect(session.loadedAt).toBe(initialState.loadedAt)
  })
})

describe('PdfPageSession pageMaskModel', () => {
  it('getPageMaskModel returns empty model before hydrate', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    const model = session.getPageMaskModel()

    expect(model.masks).toHaveLength(0)
    expect(model.metadata.totalMasks).toBe(0)
  })

  it('getPageMaskModel builds model from pageLayout', async () => {
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
          }
        ]
      })
    }

    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    await session.hydrate(page, { naturalWidth: 500, naturalHeight: 700 })

    const model = session.getPageMaskModel()

    expect(model).toBeDefined()
    expect(model.masks).toBeDefined()
    expect(model.metadata).toBeDefined()
  })

  it('getPageMaskModel returns same cached object on repeated calls', async () => {
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
          }
        ]
      })
    }

    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    await session.hydrate(page, { naturalWidth: 500, naturalHeight: 700 })

    const first = session.getPageMaskModel()
    const second = session.getPageMaskModel()

    expect(first).toBe(second)
  })

  it('hydrate clears stale pageMaskModel', async () => {
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
          }
        ]
      })
    }

    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    await session.hydrate(page, { naturalWidth: 500, naturalHeight: 700 })

    const first = session.getPageMaskModel()
    session.reset()
    await session.hydrate(page, { naturalWidth: 500, naturalHeight: 700 })
    const second = session.getPageMaskModel()

    expect(first).not.toBe(second)
  })

  it('pageLayout is not mutated with masks', async () => {
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
          }
        ]
      })
    }

    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    await session.hydrate(page, { naturalWidth: 500, naturalHeight: 700 })

    session.getPageMaskModel()

    expect(session.pageLayout.masks).toBeUndefined()
  })

  it('reset clears pageMaskModel cache', async () => {
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
          }
        ]
      })
    }

    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    await session.hydrate(page, { naturalWidth: 500, naturalHeight: 700 })

    const first = session.getPageMaskModel()
    session.reset()
    const second = session.getPageMaskModel()

    expect(first).not.toBe(second)
    expect(second.masks).toHaveLength(0)
  })
})
