import { describe, expect, it } from 'vitest'
import { PdfTranslationAdapter } from './PdfTranslationAdapter.js'

function makeStructuredBlock(id, lines, extra = {}) {
  return {
    id,
    text: lines.join(' '),
    role: 'table-region',
    sourceTextHash: `hash-${id}`,
    pageNumber: 1,
    columnIndex: 0,
    readingOrderIndex: 0,
    roleMetadata: {
      isStructured: true,
      fontSize: 10
    },
    lines: lines.map((text, i) => ({
      text,
      boundingBox: { x: 40, y: 200 + i * 18, width: 300, height: 14 },
      fontSize: 10,
      direction: 'ltr',
      items: [],
      roleMetadata: {}
    })),
    ...extra
  }
}

function makeStructuredBlockWithCells(id, lineTexts, lineItems) {
  return {
    id,
    text: lineTexts.join(' '),
    role: 'table-region',
    sourceTextHash: `hash-${id}`,
    pageNumber: 1,
    columnIndex: 0,
    readingOrderIndex: 0,
    roleMetadata: {
      isStructured: true,
      fontSize: 10
    },
    lines: lineTexts.map((text, i) => ({
      text,
      boundingBox: { x: 40, y: 200 + i * 18, width: 300, height: 14 },
      fontSize: 10,
      direction: 'ltr',
      items: lineItems[i] || [],
      roleMetadata: {}
    }))
  }
}

function makeParagraphBlock(id, text, extra = {}) {
  return {
    id,
    text,
    role: 'paragraph',
    sourceTextHash: `hash-${id}`,
    pageNumber: 1,
    columnIndex: 0,
    readingOrderIndex: 0,
    roleMetadata: {},
    lines: [{ text, boundingBox: { x: 40, y: 100, width: 300, height: 14 }, fontSize: 10, direction: 'ltr', items: [], roleMetadata: {} }],
    ...extra
  }
}

describe('PdfTranslationAdapter', () => {
  it('maps JSON payload results back to their original block IDs', () => {
    const adapter = new PdfTranslationAdapter()
    const batchItems = adapter.toProviderItems([
      { id: 'block-a', text: 'Hello', sourceTextHash: 'hash-a' },
      { id: 'block-b', text: 'World', sourceTextHash: 'hash-b' }
    ])

    const response = {
      success: true,
      translatedText: JSON.stringify([
        { blockId: 'block-a', text: 'Hola' },
        { blockId: 'block-b', text: 'Mundo' }
      ]),
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    }

    const mapped = adapter.mapBatchResponse(batchItems, response, {
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })

    expect(mapped).toEqual([
      expect.objectContaining({
        blockId: 'block-a',
        translatedText: 'Hola',
        status: 'translated',
        sourceTextHash: 'hash-a'
      }),
      expect.objectContaining({
        blockId: 'block-b',
        translatedText: 'Mundo',
        status: 'translated',
        sourceTextHash: 'hash-b'
      })
    ])
  })

  it('keeps multiple translated parts grouped under the same block ID', () => {
    const adapter = new PdfTranslationAdapter()
    const batchItems = adapter.toProviderItems([
      { id: 'block-a', text: 'Line 1', sourceTextHash: 'hash-a' },
      { id: 'block-a', text: 'Line 2', sourceTextHash: 'hash-a' }
    ])

    const response = {
      success: true,
      translatedText: JSON.stringify([
        { blockId: 'block-a', text: 'Línea 1' },
        { blockId: 'block-a', text: 'Línea 2' }
      ])
    }

    const mapped = adapter.mapBatchResponse(batchItems, response, {
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })

    expect(mapped).toHaveLength(1)
    expect(mapped[0]).toEqual(expect.objectContaining({
      blockId: 'block-a',
      translatedText: 'Línea 1 Línea 2',
      status: 'translated'
    }))
  })

  it('builds a PDF-specific translation request without select-element mode', () => {
    const adapter = new PdfTranslationAdapter()

    const request = adapter.buildTranslationRequest([
      { blockId: 'block-a', text: 'Hello', sourceTextHash: 'hash-a' }
    ], {
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es',
      messageId: 'msg-1',
      sessionId: 'session-1',
      documentIdentity: 'pdf-123',
      pageNumbers: [1]
    })

    expect(request).toEqual(expect.objectContaining({
      action: 'TRANSLATE',
      context: 'pdf-translation',
      data: expect.objectContaining({
        mode: 'pdf-translation',
        pdfTranslation: true,
        documentIdentity: 'pdf-123'
      })
    }))
    expect(request.data.mode).not.toBe('select-element')
  })

  it('sends structured array as data.text, not a string', () => {
    const adapter = new PdfTranslationAdapter()
    const items = [
      { blockId: 'b1', text: 'Hello', sourceTextHash: 'h1' },
      { blockId: 'b2', text: 'World', sourceTextHash: 'h2' }
    ]

    const request = adapter.buildTranslationRequest(items, {
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es',
      messageId: 'msg-1',
      sessionId: 's1'
    })

    expect(Array.isArray(request.data.text)).toBe(true)
    expect(request.data.text).toHaveLength(2)
    expect(typeof request.data.text).not.toBe('string')
  })

  it('consumes direct results from OptimizedJsonHandler with blockId + t fields', () => {
    const adapter = new PdfTranslationAdapter()
    const batchItems = adapter.toProviderItems([
      { id: 'block-a', text: 'Hello', sourceTextHash: 'hash-a' },
      { id: 'block-b', text: 'World', sourceTextHash: 'hash-b' }
    ])

    const response = {
      success: true,
      streaming: true,
      results: [
        { blockId: 'block-a', t: 'Hola', text: 'Hola', status: 'translated', provider: 'google' },
        { blockId: 'block-b', t: 'Mundo', text: 'Mundo', status: 'translated', provider: 'google' }
      ],
      metadata: { batchCount: 1 }
    }

    const mapped = adapter.mapBatchResponse(batchItems, response, {
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })

    expect(mapped).toEqual([
      expect.objectContaining({
        blockId: 'block-a',
        translatedText: 'Hola',
        status: 'translated'
      }),
      expect.objectContaining({
        blockId: 'block-b',
        translatedText: 'Mundo',
        status: 'translated'
      })
    ])
  })

  it('marks empty translated text as error in direct results', () => {
    const adapter = new PdfTranslationAdapter()
    const batchItems = adapter.toProviderItems([
      { id: 'block-a', text: 'Hello', sourceTextHash: 'hash-a' }
    ])

    const response = {
      success: true,
      streaming: true,
      results: [
        { blockId: 'block-a', t: '', text: '', status: 'translated', provider: 'google' }
      ],
      metadata: { batchCount: 1 }
    }

    const mapped = adapter.mapBatchResponse(batchItems, response, {
      provider: 'google',
      sourceLanguage: 'en',
      targetLanguage: 'es'
    })

    expect(mapped).toEqual([
      expect.objectContaining({
        blockId: 'block-a',
        translatedText: '',
        status: 'error',
        error: 'Empty translation result'
      })
    ])
  })

  describe('structured block cell-aware translation', () => {
    it('emits per-cell items for multi-item structured lines', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlockWithCells('sched-1', [
        'Low-Intermediate Level (A2+)',
        'Mon 30 Mar 6.00-8.15pm Classes'
      ], [
        [{ text: 'Low-Intermediate Level (A2+)', x: 40, y: 200, width: 300, height: 14 }],
        [
          { text: 'Mon 30 Mar', x: 40, y: 218, width: 100, height: 14 },
          { text: '6.00-8.15pm', x: 160, y: 218, width: 100, height: 14 },
          { text: 'Classes', x: 270, y: 218, width: 60, height: 14 }
        ]
      ])

      const items = adapter.toProviderItems([block])

      expect(items).toHaveLength(4)
      expect(items[0]).toMatchObject({ blockId: 'sched-1', lineIndex: 0, t: 'Low-Intermediate Level (A2+)', isStructured: true })
      expect(items[0].cellIndex).toBeUndefined()
      expect(items[1]).toMatchObject({ blockId: 'sched-1', lineIndex: 1, cellIndex: 0, t: 'Mon 30 Mar', isStructured: true })
      expect(items[2]).toMatchObject({ blockId: 'sched-1', lineIndex: 1, cellIndex: 1, t: '6.00-8.15pm', isStructured: true })
      expect(items[3]).toMatchObject({ blockId: 'sched-1', lineIndex: 1, cellIndex: 2, t: 'Classes', isStructured: true })
    })

    it('emits per-line items for structured single-item lines', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlock('sched-2', ['Row 1', 'Row 2', 'Row 3'])

      const items = adapter.toProviderItems([block])

      expect(items).toHaveLength(3)
      expect(items.every((i) => i.isStructured === true)).toBe(true)
      expect(items.every((i) => i.cellIndex == null)).toBe(true)
    })

    it('returns translatedCells for structured blocks with multi-item lines', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlockWithCells('sched-3', ['Header', 'Row A  Col B'], [
        [{ text: 'Header', x: 40, y: 200, width: 300, height: 14 }],
        [
          { text: 'Row A', x: 40, y: 218, width: 130, height: 14 },
          { text: 'Col B', x: 180, y: 218, width: 130, height: 14 }
        ]
      ])
      const items = adapter.toProviderItems([block])

      const response = {
        success: true,
        streaming: true,
        results: [
          { blockId: 'sched-3', t: 'هدر' },
          { blockId: 'sched-3', t: 'ردیف الف' },
          { blockId: 'sched-3', t: 'ستون ب' }
        ]
      }

      const mapped = adapter.mapBatchResponse(items, response)

      expect(mapped).toHaveLength(1)
      expect(mapped[0].translatedCells).toBeDefined()
      expect(mapped[0].translatedCells).toHaveLength(2)
      expect(mapped[0].translatedCells[0]).toEqual({ lineIndex: 0, cells: ['هدر'] })
      expect(mapped[0].translatedCells[1]).toEqual({ lineIndex: 1, cells: ['ردیف الف', 'ستون ب'] })
      expect(mapped[0].translatedText).toBe('هدر\nردیف الف ستون ب')
    })

    it('reassembles structured cell translations with newlines via grouped path', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlockWithCells('sched-4', ['Row 1', 'Row 2  Col 2'], [
        [{ text: 'Row 1', x: 40, y: 200, width: 300, height: 14 }],
        [
          { text: 'Row 2', x: 40, y: 218, width: 130, height: 14 },
          { text: 'Col 2', x: 180, y: 218, width: 130, height: 14 }
        ]
      ])
      const items = adapter.toProviderItems([block])

      const response = {
        success: true,
        translatedText: JSON.stringify([
          { text: 'سطر 1' },
          { text: 'سطر 2' },
          { text: 'ستون 2' }
        ])
      }

      const mapped = adapter.mapBatchResponse(items, response)

      expect(mapped).toHaveLength(1)
      expect(mapped[0].blockId).toBe('sched-4')
      expect(mapped[0].translatedText).toBe('سطر 1\nسطر 2 ستون 2')
      expect(mapped[0].translatedCells).toHaveLength(2)
    })

    it('keeps normal block parts joined with space', () => {
      const adapter = new PdfTranslationAdapter()
      const batchItems = adapter.toProviderItems([
        makeParagraphBlock('p1', 'Part A'),
        makeParagraphBlock('p1', 'Part B')
      ])

      const response = {
        success: true,
        translatedText: JSON.stringify([
          { text: 'Parte A' },
          { text: 'Parte B' }
        ])
      }

      const mapped = adapter.mapBatchResponse(batchItems, response)

      expect(mapped).toHaveLength(1)
      expect(mapped[0].translatedText).toBe('Parte A Parte B')
      expect(mapped[0].translatedCells).toBeUndefined()
    })

    it('falls back safely when structured response is incomplete', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlockWithCells('sched-5', ['Line A', 'Line B  Line C'], [
        [{ text: 'Line A', x: 40, y: 200, width: 300, height: 14 }],
        [
          { text: 'Line B', x: 40, y: 218, width: 130, height: 14 },
          { text: 'Line C', x: 180, y: 218, width: 130, height: 14 }
        ]
      ])
      const items = adapter.toProviderItems([block])

      const response = {
        success: true,
        streaming: true,
        results: [
          { blockId: 'sched-5', t: 'فقط خط اول' }
        ]
      }

      const mapped = adapter.mapBatchResponse(items, response)

      expect(mapped).toHaveLength(1)
      expect(mapped[0].blockId).toBe('sched-5')
      expect(mapped[0].translatedText).toContain('فقط خط اول')
      expect(mapped[0].status).toBe('translated')
    })

    it('does not emit per-cell items when cell count exceeds cap', () => {
      const adapter = new PdfTranslationAdapter()
      const manyItems = Array.from({ length: 12 }, (_, i) => ({
        text: `Cell${i}`, x: 40 + i * 25, y: 200, width: 25, height: 14
      }))
      const block = makeStructuredBlockWithCells('big-cells', ['Wide row'], [manyItems])

      const items = adapter.toProviderItems([block])

      expect(items).toHaveLength(1)
      expect(items[0].cellIndex).toBeUndefined()
    })

    it('preserves sourceTextHash on per-cell items', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlockWithCells('sched-6', ['A  B'], [
        [
          { text: 'A', x: 40, y: 200, width: 130, height: 14 },
          { text: 'B', x: 180, y: 200, width: 130, height: 14 }
        ]
      ])

      const items = adapter.toProviderItems([block])

      expect(items.every((item) => item.sourceTextHash === 'hash-sched-6')).toBe(true)
    })

    it('mixed structured and paragraph blocks emit correct item counts', () => {
      const adapter = new PdfTranslationAdapter()
      const blocks = [
        makeParagraphBlock('p1', 'Normal text'),
        makeStructuredBlock('s1', ['Row 1', 'Row 2']),
        makeParagraphBlock('p2', 'More text')
      ]

      const items = adapter.toProviderItems(blocks)

      expect(items).toHaveLength(4)
      expect(items.filter((i) => i.blockId === 'p1')).toHaveLength(1)
      expect(items.filter((i) => i.blockId === 's1')).toHaveLength(2)
      expect(items.filter((i) => i.blockId === 'p2')).toHaveLength(1)
    })

    it('does not emit per-line items for structured blocks exceeding line count cap', () => {
      const adapter = new PdfTranslationAdapter()
      const longLines = Array.from({ length: 35 }, (_, i) => `Line ${i}`)
      const block = makeStructuredBlock('big-block', longLines)

      const items = adapter.toProviderItems([block])

      expect(items).toHaveLength(1)
      expect(items[0].isStructured).toBeUndefined()
      expect(items[0].t).toBe(longLines.join(' '))
    })

    it('returns undefined translatedCells for single-item structured blocks', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlock('simple', ['Row A', 'Row B'])
      const items = adapter.toProviderItems([block])

      const response = {
        success: true,
        streaming: true,
        results: [
          { blockId: 'simple', t: 'ردیف الف' },
          { blockId: 'simple', t: 'ردیف ب' }
        ]
      }

      const mapped = adapter.mapBatchResponse(items, response)

      expect(mapped).toHaveLength(1)
      expect(mapped[0].translatedCells).toBeUndefined()
    })
  })
})
