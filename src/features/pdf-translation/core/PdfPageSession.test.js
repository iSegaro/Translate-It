import { describe, expect, it, vi } from 'vitest'
import { PAGE_CONTENT_SOURCE, PdfPageSession } from './PdfPageSession.js'

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
    expect(page.getTextContent).toHaveBeenCalledWith({
      includeMarkedContent: true,
      disableCombineTextItems: false,
      disableNormalization: true
    })
    expect(session.getTextLines()).toHaveLength(1)
    expect(session.getLogicalBlocks()).toHaveLength(1)
    expect(session.getLogicalBlocks()[0].text).toBe('Hello world')
    expect(session.getLogicalBlocks()[0].documentIdentity).toBe('fingerprint-1')
  })

  it('does not extract again after an empty page has loaded', async () => {
    const page = {
      pageNumber: 1,
      getTextContent: vi.fn().mockResolvedValue({ items: [], styles: null })
    }
    const session = new PdfPageSession({ documentIdentity: 'fingerprint-1', pageNumber: 1 })

    await session.hydrate(page, { naturalWidth: 500, naturalHeight: 700 })
    await session.hydrate(page, { naturalWidth: 500, naturalHeight: 700, scale: 1.5 })

    expect(session.loaded).toBe(true)
    expect(session.getLogicalBlocks()).toHaveLength(0)
    expect(session.displayScale).toBe(1.5)
    expect(page.getTextContent).toHaveBeenCalledOnce()
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

  it('replaces the committed OCR state for success, errors, and clear', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    const initialState = session.getCommittedOcrState()
    const blocks = [{ id: 'ocr-1' }]

    session.setOcrBlocks(blocks, 'eng', 1234)
    const completedState = session.getCommittedOcrState()
    session.setOcrError('OCR failed')
    const errorState = session.getCommittedOcrState()
    session.clearOcrBlocks()
    const clearedState = session.getCommittedOcrState()

    expect(completedState).not.toBe(initialState)
    expect(completedState).toMatchObject({ ocrBlocks: blocks, ocrLanguage: 'eng', ocrCompletedAt: 1234, ocrError: null })
    expect(errorState).not.toBe(completedState)
    expect(errorState).toMatchObject({ ocrBlocks: blocks, ocrLanguage: 'eng', ocrCompletedAt: 1234, ocrError: 'OCR failed' })
    expect(clearedState).not.toBe(errorState)
    expect(clearedState).toMatchObject({ ocrBlocks: [], ocrLanguage: null, ocrCompletedAt: 0, ocrError: null })
  })

  it('replaces committed OCR state when restoring a persisted timestamp', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    const initialState = session.getCommittedOcrState()

    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng', 1234)

    const restoredState = session.getCommittedOcrState()
    expect(restoredState).not.toBe(initialState)
    expect(restoredState.ocrCompletedAt).toBe(1234)
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

  it('reports OCR as page content source when OCR blocks are selected', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng')

    expect(session.getPageContentSource()).toBe(PAGE_CONTENT_SOURCE.OCR)
  })

  it('getLogicalBlocks returns text-layer blocks when they exist', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    session.logicalBlocks = [{ id: 'text-1', text: 'Text layer' }]
    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng')

    const blocks = session.getLogicalBlocks()

    expect(blocks).toHaveLength(1)
    expect(blocks[0].id).toBe('text-1')
  })

  it('reports PDF text as page content source when text-layer blocks are selected', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    session.logicalBlocks = [{ id: 'text-1' }]
    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng')

    expect(session.getPageContentSource()).toBe(PAGE_CONTENT_SOURCE.PDF_TEXT)
  })

  it('reports no page content source when no blocks are selected', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })

    expect(session.getPageContentSource()).toBe(PAGE_CONTENT_SOURCE.NONE)
  })

  it('exports MIXED for future source selection', () => {
    expect(PAGE_CONTENT_SOURCE.MIXED).toBe('mixed')
  })

  it('allBlocks returns both text-layer and OCR blocks', () => {
    const session = new PdfPageSession({ documentIdentity: 'doc-1', pageNumber: 1 })
    session.logicalBlocks = [{ id: 'text-1' }]
    session.setOcrBlocks([{ id: 'ocr-1' }], 'eng')

    expect(session.allBlocks).toHaveLength(2)
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

})
