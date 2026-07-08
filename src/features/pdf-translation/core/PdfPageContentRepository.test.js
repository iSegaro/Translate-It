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

  it('releasePageSession removes index entries and releases session memory', async () => {
    const pageSession = await repository.getPageSession({ ...context, pageNumber: 1 })
    const [block] = pageSession.getLogicalBlocks()

    expect(repository.findSourceBlock(block.id)).toBe(block)

    repository.releasePageSession(1)

    expect(pageSession.loaded).toBe(false)
    expect(pageSession.textContent).toBeNull()
    expect(pageSession.logicalBlocks).toEqual([])
    expect(repository.findSourceBlock(block.id)).toBeNull()
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
})
