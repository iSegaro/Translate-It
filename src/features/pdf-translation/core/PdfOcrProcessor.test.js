import { describe, expect, it, vi } from 'vitest'
import { PdfOcrProcessor } from './PdfOcrProcessor.js'

vi.mock('@/features/screen-capture/services/ocrEngine.js', () => ({
  recognizeStructured: vi.fn()
}))

vi.mock('@/features/screen-capture/utils/ocrLanguageMap.js', () => ({
  toTesseractLanguageCode: vi.fn((language) => language)
}))

const { recognizeStructured } = await import('@/features/screen-capture/services/ocrEngine.js')

function createSession() {
  return {
    documentIdentity: 'doc-1',
    setPageOcrBlocks: vi.fn(),
    getCommittedOcrState: vi.fn(() => null),
    recordPageOcrError: vi.fn(() => false),
    pdfDocument: {
      getPage: vi.fn(async () => ({
        cleanup: vi.fn(),
        getViewport: vi.fn(() => ({ width: 200, height: 100 })),
        render: vi.fn(() => ({ promise: Promise.resolve() }))
      }))
    }
  }
}

function mockCanvas() {
  vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
    if (tagName !== 'canvas') return document.createElement(tagName)
    return {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({}))
    }
  })
}

function expectRealBlocks(blocks, expectedTexts) {
  expect(blocks).toHaveLength(expectedTexts.length)
  for (let i = 0; i < blocks.length; i++) {
    expect(blocks[i]).not.toBeInstanceOf(Promise)
    expect(blocks[i].id).toBeTruthy()
    expect(blocks[i].text).toBe(expectedTexts[i])
    expect(blocks[i].pageNumber).toBe(1)
  }
}

describe('PdfOcrProcessor', () => {
  it('reuses committed OCR blocks for the requested language', async () => {
    const session = createSession()
    const blocks = [{ id: 'ocr-1' }]
    session.getCommittedOcrState.mockReturnValue({ ocrBlocks: blocks, ocrLanguage: 'eng' })

    const result = await new PdfOcrProcessor(session).processPage(1, { language: 'eng' })

    expect(result).toBe(blocks)
    expect(session.pdfDocument.getPage).not.toHaveBeenCalled()
  })

  it('awaits structured-line OCR logical block creation before storing blocks', async () => {
    mockCanvas()
    recognizeStructured.mockResolvedValue({
      text: 'Alpha\nBeta',
      confidence: 90,
      lines: [
        { text: 'Alpha', confidence: 91, bbox: { x0: 0, y0: 0, x1: 100, y1: 20 } },
        { text: 'Beta', confidence: 88, bbox: { x0: 0, y0: 20, x1: 100, y1: 40 } }
      ]
    })
    const session = createSession()
    const processor = new PdfOcrProcessor(session)

    const blocks = await processor.processPage(1, { language: 'eng' })

    expectRealBlocks(blocks, ['Alpha', 'Beta'])
    expect(session.setPageOcrBlocks).toHaveBeenCalledWith(1, blocks, 'eng')
  })

  it('awaits plain-text fallback OCR logical block creation before storing blocks', async () => {
    mockCanvas()
    recognizeStructured.mockResolvedValue({
      text: 'One\nTwo',
      confidence: 80,
      lines: []
    })
    const session = createSession()
    const processor = new PdfOcrProcessor(session)

    const blocks = await processor.processPage(1, { language: 'eng' })

    expectRealBlocks(blocks, ['One', 'Two'])
    expect(session.setPageOcrBlocks).toHaveBeenCalledWith(1, blocks, 'eng')
  })

  it('records OCR errors through the session facade', async () => {
    mockCanvas()
    recognizeStructured.mockRejectedValue(new Error('OCR failed'))
    const session = createSession()

    await expect(new PdfOcrProcessor(session).processPage(1)).rejects.toThrow('OCR failed')

    expect(session.recordPageOcrError).toHaveBeenCalledWith(1, expect.any(Error))
  })
})
