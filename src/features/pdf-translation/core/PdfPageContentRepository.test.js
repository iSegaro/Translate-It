import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfPageContentRepository } from './PdfPageContentRepository.js'

function createPage(pageNumber = 1, text = `Page ${pageNumber} text`) {
  return {
    pageNumber,
    cleanup: vi.fn(),
    getTextContent: vi.fn().mockResolvedValue({
      items: [
        {
          str: text,
          transform: [1, 0, 0, 14, 40, 650],
          width: 100,
          height: 14,
          dir: 'ltr'
        }
      ],
      styles: null
    })
  }
}

function createContext(overrides = {}) {
  const pdfDocument = {
    getPage: vi.fn(async (pageNumber) => createPage(pageNumber))
  }

  return {
    pdfDocument,
    pageMetrics: [
      { pageNumber: 1, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 },
      { pageNumber: 2, width: 100, height: 200, naturalWidth: 100, naturalHeight: 200, scale: 1 }
    ],
    documentIdentity: 'doc-1',
    visiblePageNumbers: new Set([1, 2]),
    ...overrides
  }
}

describe('PdfPageContentRepository', () => {
  let repository
  let context

  beforeEach(() => {
    repository = new PdfPageContentRepository()
    context = createContext()
  })

  it('hydrates a page session', async () => {
    const pageSession = await repository.getPageSession({
      ...context,
      pageNumber: 1
    })

    expect(pageSession).toBeTruthy()
    expect(pageSession.loaded).toBe(true)
    expect(pageSession.documentIdentity).toBe('doc-1')
    expect(pageSession.getLogicalBlocks()).toHaveLength(1)
    expect(repository.pageSessions.get(1)).toBe(pageSession)
  })

  it('dedupes pending hydration for the same page', async () => {
    let resolveTextContent
    const page = createPage(1)
    page.getTextContent = vi.fn(() => new Promise((resolve) => {
      resolveTextContent = () => resolve({
        items: [{ str: 'Delayed text', transform: [1, 0, 0, 14, 40, 650], width: 100, height: 14, dir: 'ltr' }],
        styles: null
      })
    }))
    context.pdfDocument.getPage = vi.fn(async () => page)

    const first = repository.getPageSession({ ...context, pageNumber: 1 })
    const second = repository.getPageSession({ ...context, pageNumber: 1 })

    await Promise.resolve()
    expect(context.pdfDocument.getPage).toHaveBeenCalledTimes(1)

    resolveTextContent()
    const pageSession = await first

    expect(await second).toBe(pageSession)
    expect(repository.pendingHydrations?.size ?? 0).toBe(0)
  })

  it('preserves pending dedupe with generation validation', async () => {
    let currentGeneration = 1
    let resolveTextContent
    const page = createPage(1)
    page.getTextContent = vi.fn(() => new Promise((resolve) => {
      resolveTextContent = () => resolve({
        items: [{ str: 'Delayed text', transform: [1, 0, 0, 14, 40, 650], width: 100, height: 14, dir: 'ltr' }],
        styles: null
      })
    }))
    context.pdfDocument.getPage = vi.fn(async () => page)

    const guardedContext = {
      ...context,
      documentGeneration: currentGeneration,
      isDocumentGenerationCurrent: (generation) => generation === currentGeneration
    }
    const first = repository.getPageSession({ ...guardedContext, pageNumber: 1 })
    const second = repository.getPageSession({ ...guardedContext, pageNumber: 1 })

    await Promise.resolve()
    expect(context.pdfDocument.getPage).toHaveBeenCalledTimes(1)

    resolveTextContent()
    const pageSession = await first

    expect(await second).toBe(pageSession)
    expect(repository.pageSessions.get(1)).toBe(pageSession)
    expect(repository.pendingHydrations?.size ?? 0).toBe(0)
  })

  it('discards stale hydration before commit', async () => {
    let currentGeneration = 1
    let resolveTextContent
    const page = createPage(1)
    page.getTextContent = vi.fn(() => new Promise((resolve) => {
      resolveTextContent = () => resolve({
        items: [{ str: 'Stale text', transform: [1, 0, 0, 14, 40, 650], width: 100, height: 14, dir: 'ltr' }],
        styles: null
      })
    }))
    context.pdfDocument.getPage = vi.fn(async () => page)

    const hydration = repository.getPageSession({
      ...context,
      pageNumber: 1,
      documentGeneration: currentGeneration,
      isDocumentGenerationCurrent: (generation) => generation === currentGeneration
    })

    await Promise.resolve()
    repository.reset()
    currentGeneration += 1
    resolveTextContent()

    expect(await hydration).toBeNull()
    expect(repository.pageSessions.size).toBe(0)
    expect(repository.blockIndex.size).toBe(0)
  })

  it('does not let stale pending cleanup remove newer pending hydration', async () => {
    let currentGeneration = 1
    let resolveOldTextContent
    let resolveNewTextContent
    const oldPage = createPage(1)
    oldPage.getTextContent = vi.fn(() => new Promise((resolve) => {
      resolveOldTextContent = () => resolve({ items: [{ str: 'Old', transform: [1, 0, 0, 14, 40, 650], width: 100, height: 14, dir: 'ltr' }], styles: null })
    }))
    const newPage = createPage(1)
    newPage.getTextContent = vi.fn(() => new Promise((resolve) => {
      resolveNewTextContent = () => resolve({ items: [{ str: 'New', transform: [1, 0, 0, 14, 40, 650], width: 100, height: 14, dir: 'ltr' }], styles: null })
    }))
    context.pdfDocument.getPage = vi.fn()
      .mockResolvedValueOnce(oldPage)
      .mockResolvedValueOnce(newPage)

    const oldHydration = repository.getPageSession({
      ...context,
      pageNumber: 1,
      documentGeneration: currentGeneration,
      isDocumentGenerationCurrent: (generation) => generation === currentGeneration
    })

    await Promise.resolve()
    repository.reset()
    currentGeneration += 1

    const newHydration = repository.getPageSession({
      ...context,
      pageNumber: 1,
      documentGeneration: currentGeneration,
      isDocumentGenerationCurrent: (generation) => generation === currentGeneration
    })

    await Promise.resolve()
    resolveOldTextContent()
    expect(await oldHydration).toBeNull()
    expect(repository.pendingHydrations?.has(1)).toBe(true)

    resolveNewTextContent()
    expect(await newHydration).toBeTruthy()
    expect(repository.pendingHydrations?.size ?? 0).toBe(0)
  })

  it('creates block index entries during hydration', async () => {
    const pageSession = await repository.getPageSession({ ...context, pageNumber: 1 })
    const [block] = pageSession.getLogicalBlocks()

    expect(repository.blockIndex.size).toBe(1)
    expect(repository.findSourceBlock(block.id)).toBe(block)
  })

  it('returns visible logical blocks in page order', async () => {
    const blocks = await repository.getVisibleLogicalBlocks(context)

    expect(blocks).toHaveLength(2)
    expect(blocks[0].pageNumber).toBe(1)
    expect(blocks[1].pageNumber).toBe(2)
  })

  it('updates OCR blocks and indexes them', async () => {
    await repository.getPageSession({ ...context, pageNumber: 1 })
    const ocrBlock = {
      id: 'ocr-1',
      text: 'OCR text',
      pageNumber: 1,
      boundingBox: null
    }

    repository.setPageOcrBlocks(1, [ocrBlock], 'eng')

    const pageSession = repository.pageSessions.get(1)
    expect(pageSession.ocrBlocks).toEqual([ocrBlock])
    expect(pageSession.ocrLanguage).toBe('eng')
    expect(repository.findSourceBlock('ocr-1')).toBe(ocrBlock)
  })

  it('reset clears sessions, pending hydrations, and block index', async () => {
    const page = createPage(1)
    page.getTextContent = vi.fn(() => new Promise(() => {}))
    context.pdfDocument.getPage = vi.fn(async () => page)

    repository.getPageSession({ ...context, pageNumber: 1 })
    expect(repository.pendingHydrations?.size).toBe(1)

    repository.blockIndex.set('block-1', { id: 'block-1' })
    repository.pageSessions.set(1, { pageNumber: 1 })

    repository.reset()

    expect(repository.pageSessions.size).toBe(0)
    expect(repository.pendingHydrations).toBeNull()
    expect(repository.blockIndex.size).toBe(0)
  })

  it('clears pending state after hydration failure', async () => {
    context.pdfDocument.getPage = vi.fn(async () => {
      throw new Error('getPage failed')
    })

    await expect(repository.getPageSession({ ...context, pageNumber: 1 })).rejects.toThrow('getPage failed')

    expect(repository.pendingHydrations?.size ?? 0).toBe(0)
    expect(repository.pageSessions.size).toBe(0)
    expect(repository.blockIndex.size).toBe(0)
  })
})
