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

    it('emits per-cell items for single-line multi-item table-cell blocks', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlockWithCells('tc-1', ['Key performance indicator  Annual target'], [
        [
          { text: 'Key performance indicator', x: 116.48, y: 676.9, width: 114.03, height: 9 },
          { text: 'Annual target', x: 432.6, y: 676.9, width: 58.01, height: 9 }
        ]
      ])
      block.role = 'table-cell'

      const items = adapter.toProviderItems([block])

      expect(items).toHaveLength(2)
      expect(items[0]).toMatchObject({ blockId: 'tc-1', lineIndex: 0, cellIndex: 0, t: 'Key performance indicator', isStructured: true })
      expect(items[1]).toMatchObject({ blockId: 'tc-1', lineIndex: 0, cellIndex: 1, t: 'Annual target', isStructured: true })
    })

    it('maps single-line multi-item table-cell response to translatedCells', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlockWithCells('tc-2', ['Objective  Target'], [
        [
          { text: 'Objective', x: 217.34, y: 323, width: 45.05, height: 10 },
          { text: 'Target', x: 483.12, y: 323, width: 30.58, height: 10 }
        ]
      ])
      block.role = 'table-cell'

      const items = adapter.toProviderItems([block])
      expect(items).toHaveLength(2)

      const response = {
        success: true,
        streaming: true,
        results: [
          { blockId: 'tc-2', t: 'هدف' },
          { blockId: 'tc-2', t: 'هدف سالانه' }
        ]
      }

      const mapped = adapter.mapBatchResponse(items, response)

      expect(mapped).toHaveLength(1)
      expect(mapped[0].translatedCells).toBeDefined()
      expect(mapped[0].translatedCells).toHaveLength(1)
      expect(mapped[0].translatedCells[0]).toEqual({ lineIndex: 0, cells: ['هدف', 'هدف سالانه'] })
      expect(mapped[0].translatedText).toBe('هدف هدف سالانه')
    })

    it('still emits flat text for single-line paragraph blocks with single item', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('p-single', 'Just a paragraph')

      const items = adapter.toProviderItems([block])

      expect(items).toHaveLength(1)
      expect(items[0].cellIndex).toBeUndefined()
      expect(items[0].isStructured).toBeUndefined()
    })

    it('still emits per-cell items for multi-line structured blocks', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlockWithCells('sched-7', ['Header', 'A  B'], [
        [{ text: 'Header', x: 40, y: 200, width: 300, height: 14 }],
        [
          { text: 'A', x: 40, y: 218, width: 130, height: 14 },
          { text: 'B', x: 180, y: 218, width: 130, height: 14 }
        ]
      ])

      const items = adapter.toProviderItems([block])

      expect(items).toHaveLength(3)
      expect(items[0]).toMatchObject({ lineIndex: 0, isStructured: true })
      expect(items[0].cellIndex).toBeUndefined()
      expect(items[1]).toMatchObject({ lineIndex: 1, cellIndex: 0, isStructured: true })
      expect(items[2]).toMatchObject({ lineIndex: 1, cellIndex: 1, isStructured: true })
    })

    it('line cap still applies to single-line multi-item blocks exceeding max', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlock('big-single', ['Just one line'])
      block.roleMetadata.isStructured = true

      const items = adapter.toProviderItems([block])

      expect(items).toHaveLength(1)
      expect(items[0].cellIndex).toBeUndefined()
    })

    it('max cells per line cap applies to single-line blocks', () => {
      const adapter = new PdfTranslationAdapter()
      const manyItems = Array.from({ length: 12 }, (_, i) => ({
        text: `Cell${i}`, x: 40 + i * 25, y: 200, width: 25, height: 14
      }))
      const block = makeStructuredBlockWithCells('tc-many', ['Wide row'], [manyItems])

      const items = adapter.toProviderItems([block])

      expect(items).toHaveLength(1)
      expect(items[0].cellIndex).toBeUndefined()
    })
  })

  describe('translatedCells metadata arrays', () => {
    it('includes cellIds when metadata exists', () => {
      const adapter = new PdfTranslationAdapter()
      const block = {
        id: 'blk-1',
        text: 'Header Value',
        role: 'table-region',
        sourceTextHash: 'h1',
        pageNumber: 1,
        columnIndex: 0,
        readingOrderIndex: 0,
        roleMetadata: { isStructured: true, fontSize: 10 },
        lines: [
          {
            text: 'Header Value',
            boundingBox: { x: 40, y: 200, width: 300, height: 14 },
            fontSize: 10,
            direction: 'ltr',
            items: [
              { text: 'Header', x: 40, y: 200, width: 60, height: 14, cellId: 'p1-r0-r0-c0-i0', rowIndex: 0, columnIndex: 0 },
              { text: 'Value', x: 180, y: 200, width: 60, height: 14, cellId: 'p1-r0-r0-c1-i1', rowIndex: 0, columnIndex: 1 }
            ],
            roleMetadata: {}
          }
        ]
      }

      const items = adapter.toProviderItems([block])

      expect(items[0].cellId).toBe('p1-r0-r0-c0-i0')
      expect(items[0].tableRowIndex).toBe(0)
      expect(items[0].tableColumnIndex).toBe(0)
      expect(items[1].cellId).toBe('p1-r0-r0-c1-i1')
      expect(items[1].tableColumnIndex).toBe(1)

      const response = {
        success: true,
        translatedText: JSON.stringify(['تمرين', 'قيمة'])
      }

      const mapped = adapter.mapBatchResponse(items, response)

      expect(mapped[0].translatedCells).toBeDefined()
      expect(mapped[0].translatedCells[0].cellIds).toEqual(['p1-r0-r0-c0-i0', 'p1-r0-r0-c1-i1'])
      expect(mapped[0].translatedCells[0].columnIndices).toEqual([0, 1])
      expect(mapped[0].translatedCells[0].rowIndices).toEqual([0, 0])
    })

    it('metadata arrays align with cells array', () => {
      const adapter = new PdfTranslationAdapter()
      const block = {
        id: 'blk-1',
        text: 'A B',
        role: 'table-region',
        sourceTextHash: 'h1',
        pageNumber: 1,
        columnIndex: 0,
        readingOrderIndex: 0,
        roleMetadata: { isStructured: true, fontSize: 10 },
        lines: [
          {
            text: 'A B',
            boundingBox: { x: 40, y: 200, width: 300, height: 14 },
            fontSize: 10,
            direction: 'ltr',
            items: [
              { text: 'A', x: 40, y: 200, width: 60, height: 14, cellId: 'p1-r0-r0-c0-i0', rowIndex: 0, columnIndex: 0 },
              { text: 'B', x: 180, y: 200, width: 60, height: 14, cellId: 'p1-r0-r0-c1-i1', rowIndex: 0, columnIndex: 1 }
            ],
            roleMetadata: {}
          }
        ]
      }

      const items = adapter.toProviderItems([block])
      const response = { success: true, translatedText: JSON.stringify(['X', 'Y']) }
      const mapped = adapter.mapBatchResponse(items, response)
      const tc = mapped[0].translatedCells[0]

      expect(tc.cells).toHaveLength(2)
      expect(tc.cellIds).toHaveLength(2)
      expect(tc.columnIndices).toHaveLength(2)
      expect(tc.rowIndices).toHaveLength(2)
    })

    it('missing metadata falls back to old shape', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlockWithCells('blk-no-meta', ['A B'], [[
        { text: 'A', x: 40, y: 200, width: 60, height: 14 },
        { text: 'B', x: 180, y: 200, width: 60, height: 14 }
      ]])

      const items = adapter.toProviderItems([block])
      const response = { success: true, translatedText: JSON.stringify(['X', 'Y']) }
      const mapped = adapter.mapBatchResponse(items, response)

      expect(mapped[0].translatedCells).toBeDefined()
      expect(mapped[0].translatedCells[0].cells).toEqual(['X', 'Y'])
      expect(mapped[0].translatedCells[0].cellIds).toBeUndefined()
      expect(mapped[0].translatedCells[0].columnIndices).toBeUndefined()
    })

    it('colSpanCandidate and estimatedColSpan are preserved', () => {
      const adapter = new PdfTranslationAdapter()
      const block = {
        id: 'blk-span',
        text: 'Wide Header Normal',
        role: 'table-region',
        sourceTextHash: 'h1',
        pageNumber: 1,
        columnIndex: 0,
        readingOrderIndex: 0,
        roleMetadata: { isStructured: true, fontSize: 10 },
        lines: [
          {
            text: 'Wide Header Normal',
            boundingBox: { x: 40, y: 200, width: 300, height: 14 },
            fontSize: 10,
            direction: 'ltr',
            items: [
              { text: 'Wide Header', x: 40, y: 200, width: 180, height: 14, cellId: 'p1-r0-r0-c0-i0', rowIndex: 0, columnIndex: 0, colSpanCandidate: true, estimatedColSpan: 2 },
              { text: 'Normal', x: 240, y: 200, width: 60, height: 14, cellId: 'p1-r0-r0-c1-i1', rowIndex: 0, columnIndex: 1, colSpanCandidate: false, estimatedColSpan: 1 }
            ],
            roleMetadata: {}
          }
        ]
      }

      const items = adapter.toProviderItems([block])
      const response = { success: true, translatedText: JSON.stringify(['عنوان واسع', 'عادي']) }
      const mapped = adapter.mapBatchResponse(items, response)

      expect(mapped[0].translatedCells[0].colSpanCandidates).toEqual([true, false])
      expect(mapped[0].translatedCells[0].estimatedColSpans).toEqual([2, 1])
    })

    it('existing overlay-compatible format unchanged', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeStructuredBlockWithCells('blk-compat', ['Name Age'], [[
        { text: 'Name', x: 40, y: 200, width: 60, height: 14 },
        { text: 'Age', x: 180, y: 200, width: 60, height: 14 }
      ]])

      const items = adapter.toProviderItems([block])
      const response = { success: true, translatedText: JSON.stringify(['اسم', 'عمر']) }
      const mapped = adapter.mapBatchResponse(items, response)

      expect(mapped[0].translatedCells).toHaveLength(1)
      expect(mapped[0].translatedCells[0].lineIndex).toBe(0)
      expect(mapped[0].translatedCells[0].cells).toEqual(['اسم', 'عمر'])
      expect(mapped[0].translatedText).toBe('اسم عمر')
    })
  })

  describe('semantic context mapping', () => {
    it('KPI block receives regionType', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-kpi', 'Revenue')
      block.roleMetadata.regionId = 'region-kpi'
      const semanticRegions = [{
        id: 'region-kpi',
        boundingBox: { x: 40, y: 100, width: 200, height: 60 },
        childRegionIds: [],
        blockIds: ['blk-kpi'],
        metadata: {
          semantic: {
            type: 'kpi-candidate',
            confidence: 0.85,
            signals: {},
            metrics: []
          }
        }
      }]

      const items = adapter.toProviderItems([block], semanticRegions)

      expect(items).toHaveLength(1)
      expect(items[0].semanticContext).toBeDefined()
      expect(items[0].semanticContext.regionType).toBe('kpi-candidate')
    })

    it('Financial metric receives financialSubtype', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-fin', '$12.5B')
      block.roleMetadata.regionId = 'region-fin'
      const semanticRegions = [{
        id: 'region-fin',
        boundingBox: { x: 40, y: 100, width: 200, height: 60 },
        childRegionIds: [],
        blockIds: ['blk-fin'],
        metadata: {
          semantic: {
            type: 'kpi-candidate',
            confidence: 0.9,
            signals: {},
            metrics: [{
              label: 'Revenue',
              value: '$12.5B',
              unit: 'currency',
              financial: { subtype: 'metric-with-delta', magnitude: 'B', polarity: 'neutral' }
            }]
          }
        }
      }]

      const items = adapter.toProviderItems([block], semanticRegions)

      expect(items[0].semanticContext).toBeDefined()
      expect(items[0].semanticContext.financialSubtype).toBe('metric-with-delta')
    })

    it('Statement fragment sets statementFragment=true', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-stmt', 'Revenue: $12.3B')
      block.roleMetadata.regionId = 'region-stmt'
      const semanticRegions = [{
        id: 'region-stmt',
        boundingBox: { x: 40, y: 100, width: 400, height: 100 },
        childRegionIds: [],
        blockIds: ['blk-stmt'],
        metadata: {
          semantic: {
            type: 'key-value-candidate',
            confidence: 0.8,
            signals: {},
            pairs: [],
            financialStatement: {
              type: 'statement-fragment',
              confidence: 0.8,
              rowCount: 4,
              totalRowCount: 1,
              negativeRowCount: 0,
              hasConsistentCurrency: true,
              primaryCurrency: '$',
              sourceLineIndices: [0, 1, 2, 3],
              signals: {}
            }
          }
        }
      }]

      const items = adapter.toProviderItems([block], semanticRegions)

      expect(items[0].semanticContext).toBeDefined()
      expect(items[0].semanticContext.statementFragment).toBe(true)
    })

    it('Dashboard member sets dashboardGroup=true', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-dash', '12,300')
      block.roleMetadata.regionId = 'region-dash'
      const semanticRegions = [{
        id: 'region-dash',
        boundingBox: { x: 40, y: 100, width: 100, height: 50 },
        childRegionIds: [],
        blockIds: ['blk-dash'],
        metadata: {
          semantic: {
            type: 'kpi-candidate',
            confidence: 0.9,
            signals: {},
            metrics: [],
            dashboardGroup: {
              groupId: 'dashboard-p1-r0',
              layout: 'row',
              confidence: 0.85,
              regionIds: ['region-dash', 'region-dash2'],
              role: 'member'
            }
          }
        }
      }]

      const items = adapter.toProviderItems([block], semanticRegions)

      expect(items[0].semanticContext).toBeDefined()
      expect(items[0].semanticContext.dashboardGroup).toBe(true)
    })

    it('Parent/child relationships map correctly', () => {
      const adapter = new PdfTranslationAdapter()
      const blockChild = makeParagraphBlock('blk-child', 'Revenue')
      blockChild.roleMetadata.regionId = 'region-child'
      const blockParent = makeParagraphBlock('blk-parent', 'Total $100B')
      blockParent.roleMetadata.regionId = 'region-parent'

      const semanticRegions = [
        {
          id: 'region-parent',
          boundingBox: { x: 40, y: 100, width: 500, height: 200 },
          childRegionIds: ['region-child'],
          blockIds: ['blk-parent'],
          metadata: {
            semantic: {
              type: 'kpi-candidate',
              confidence: 0.8,
              signals: {},
              metrics: [],
              relationships: {
                parentRegionId: null,
                childRegionIds: ['region-child'],
                previousRegionId: null,
                nextRegionId: null,
                dashboardGroupId: null
              }
            }
          }
        },
        {
          id: 'region-child',
          boundingBox: { x: 60, y: 120, width: 200, height: 80 },
          childRegionIds: [],
          blockIds: ['blk-child'],
          metadata: {
            semantic: {
              type: 'kpi-candidate',
              confidence: 0.9,
              signals: {},
              metrics: [],
              relationships: {
                parentRegionId: 'region-parent',
                childRegionIds: [],
                previousRegionId: null,
                nextRegionId: null,
                dashboardGroupId: null
              }
            }
          }
        }
      ]

      const items = adapter.toProviderItems([blockChild, blockParent], semanticRegions)

      const childItem = items.find((it) => it.blockId === 'blk-child')
      const parentItem = items.find((it) => it.blockId === 'blk-parent')

      expect(childItem.semanticContext).toBeDefined()
      expect(childItem.semanticContext.relationshipRole).toBe('child')

      expect(parentItem.semanticContext).toBeDefined()
      expect(parentItem.semanticContext.relationshipRole).toBe('parent')
    })

    it('Standalone region maps relationshipRole=standalone', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-stand', 'Hello')
      block.roleMetadata.regionId = 'region-stand'
      const semanticRegions = [{
        id: 'region-stand',
        boundingBox: { x: 40, y: 100, width: 200, height: 60 },
        childRegionIds: [],
        blockIds: ['blk-stand'],
        metadata: {
          semantic: {
            type: 'kpi-candidate',
            confidence: 0.7,
            signals: {},
            metrics: [],
            relationships: {
              parentRegionId: null,
              childRegionIds: [],
              previousRegionId: null,
              nextRegionId: null,
              dashboardGroupId: null
            }
          }
        }
      }]

      const items = adapter.toProviderItems([block], semanticRegions)

      expect(items[0].semanticContext).toBeDefined()
      expect(items[0].semanticContext.relationshipRole).toBe('standalone')
    })

    it('Missing semantic metadata omits semanticContext', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-no-sem', 'Hello world')

      const items = adapter.toProviderItems([block])

      expect(items[0].semanticContext).toBeUndefined()
    })

    it('Block with no regionId omits semanticContext', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-no-region', 'Hello')
      const semanticRegions = [{
        id: 'other-region',
        boundingBox: { x: 40, y: 100, width: 200, height: 60 },
        childRegionIds: [],
        blockIds: [],
        metadata: {
          semantic: {
            type: 'kpi-candidate',
            confidence: 0.8,
            signals: {},
            metrics: []
          }
        }
      }]

      const items = adapter.toProviderItems([block], semanticRegions)

      expect(items[0].semanticContext).toBeUndefined()
    })

    it('Provider items remain frozen', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-frozen', '$12.5B')
      block.roleMetadata.regionId = 'region-frozen'
      const semanticRegions = [{
        id: 'region-frozen',
        boundingBox: { x: 40, y: 100, width: 200, height: 60 },
        childRegionIds: [],
        blockIds: ['blk-frozen'],
        metadata: {
          semantic: {
            type: 'kpi-candidate',
            confidence: 0.9,
            signals: {},
            metrics: [{
              label: 'Revenue',
              value: '$12.5B',
              unit: 'currency',
              financial: { subtype: 'summary-row', magnitude: 'B', polarity: 'neutral' }
            }],
            relationships: {
              parentRegionId: null,
              childRegionIds: [],
              previousRegionId: null,
              nextRegionId: null,
              dashboardGroupId: null
            }
          }
        }
      }]

      const items = adapter.toProviderItems([block], semanticRegions)

      expect(Object.isFrozen(items[0].semanticContext)).toBe(true)
    })

    it('Existing adapter output unchanged except additive semanticContext', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-additive', 'Revenue: $12.3B')
      block.roleMetadata.regionId = 'region-add'
      const semanticRegions = [{
        id: 'region-add',
        boundingBox: { x: 40, y: 100, width: 300, height: 60 },
        childRegionIds: [],
        blockIds: ['blk-additive'],
        metadata: {
          semantic: {
            type: 'key-value-candidate',
            confidence: 0.8,
            signals: {},
            pairs: [],
            financialStatement: { type: 'statement-fragment', confidence: 0.8, rowCount: 3, totalRowCount: 0, negativeRowCount: 0, hasConsistentCurrency: true, primaryCurrency: '$', sourceLineIndices: [0, 1, 2], signals: {} },
            relationships: { parentRegionId: null, childRegionIds: [], previousRegionId: null, nextRegionId: null, dashboardGroupId: null }
          }
        }
      }]

      const itemsWithout = adapter.toProviderItems([block])
      const itemsWith = adapter.toProviderItems([block], semanticRegions)

      const withoutCtx = itemsWithout[0]
      const withCtx = itemsWith[0]

      expect(withCtx.i).toBe(withoutCtx.i)
      expect(withCtx.b).toBe(withoutCtx.b)
      expect(withCtx.blockId).toBe(withoutCtx.blockId)
      expect(withCtx.r).toBe(withoutCtx.r)
      expect(withCtx.t).toBe(withoutCtx.t)
      expect(withCtx.text).toBe(withoutCtx.text)
      expect(withCtx.sourceTextHash).toBe(withoutCtx.sourceTextHash)
      expect(withCtx.pageNumber).toBe(withoutCtx.pageNumber)
      expect(withCtx.columnIndex).toBe(withoutCtx.columnIndex)
      expect(withCtx.readingOrderIndex).toBe(withoutCtx.readingOrderIndex)
      expect(withCtx.position).toBe(withoutCtx.position)

      expect(withCtx.semanticContext).toBeDefined()
      expect(withCtx.semanticContext.regionType).toBe('key-value-candidate')
      expect(withCtx.semanticContext.statementFragment).toBe(true)
      expect(withCtx.semanticContext.relationshipRole).toBe('standalone')
      expect(withoutCtx.semanticContext).toBeUndefined()
    })

    it('readingRole is metric for single-metric KPI', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-rr-metric', '$12.5B')
      block.roleMetadata.regionId = 'region-rr'
      const semanticRegions = [{
        id: 'region-rr',
        boundingBox: { x: 40, y: 100, width: 200, height: 60 },
        childRegionIds: [],
        blockIds: ['blk-rr-metric'],
        metadata: {
          semantic: {
            type: 'kpi-candidate',
            confidence: 0.9,
            signals: {},
            metrics: [{ label: 'Revenue', value: '$12.5B', unit: 'currency' }]
          }
        }
      }]

      const items = adapter.toProviderItems([block], semanticRegions)

      expect(items[0].semanticContext.readingRole).toBe('metric')
    })

    it('readingRole is summary for key-value-candidate', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-rr-kv', 'Revenue: $12.3B')
      block.roleMetadata.regionId = 'region-rr-kv'
      const semanticRegions = [{
        id: 'region-rr-kv',
        boundingBox: { x: 40, y: 100, width: 300, height: 60 },
        childRegionIds: [],
        blockIds: ['blk-rr-kv'],
        metadata: {
          semantic: {
            type: 'key-value-candidate',
            confidence: 0.8,
            signals: {},
            pairs: [
              { label: 'Revenue', value: '$12.3B', separator: 'colon', financial: null },
              { label: 'Assets', value: '$8.2B', separator: 'colon', financial: null }
            ]
          }
        }
      }]

      const items = adapter.toProviderItems([block], semanticRegions)

      expect(items[0].semanticContext.readingRole).toBe('summary')
    })

    it('financialSubtype unified across key-value pairs', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-kv-fin', 'Revenue: $12.3B')
      block.roleMetadata.regionId = 'region-kv-fin'
      const semanticRegions = [{
        id: 'region-kv-fin',
        boundingBox: { x: 40, y: 100, width: 300, height: 60 },
        childRegionIds: [],
        blockIds: ['blk-kv-fin'],
        metadata: {
          semantic: {
            type: 'key-value-candidate',
            confidence: 0.8,
            signals: {},
            pairs: [
              { label: 'Revenue', value: '$12.3B', separator: 'colon', financial: { subtype: 'summary-row', magnitude: 'B', polarity: 'neutral' } },
              { label: 'Assets', value: '$8.2B', separator: 'colon', financial: { subtype: 'summary-row', magnitude: 'B', polarity: 'neutral' } }
            ]
          }
        }
      }]

      const items = adapter.toProviderItems([block], semanticRegions)

      expect(items[0].semanticContext.financialSubtype).toBe('summary-row')
    })

    it('financialSubtype omitted when pairs have mixed subtypes', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-kv-mix', 'Revenue: $12.3B')
      block.roleMetadata.regionId = 'region-kv-mix'
      const semanticRegions = [{
        id: 'region-kv-mix',
        boundingBox: { x: 40, y: 100, width: 300, height: 60 },
        childRegionIds: [],
        blockIds: ['blk-kv-mix'],
        metadata: {
          semantic: {
            type: 'key-value-candidate',
            confidence: 0.8,
            signals: {},
            pairs: [
              { label: 'Revenue', value: '$12.3B', separator: 'colon', financial: { subtype: 'summary-row', magnitude: 'B', polarity: 'neutral' } },
              { label: 'Loss', value: '($5B)', separator: 'colon', financial: { subtype: 'total-row', polarity: 'negative' } }
            ]
          }
        }
      }]

      const items = adapter.toProviderItems([block], semanticRegions)

      expect(items[0].semanticContext.financialSubtype).toBeUndefined()
    })

    it('toProviderItems works without semanticRegions parameter', () => {
      const adapter = new PdfTranslationAdapter()
      const block = makeParagraphBlock('blk-no-param', 'Revenue')

      const items = adapter.toProviderItems([block])

      expect(items).toHaveLength(1)
      expect(items[0].semanticContext).toBeUndefined()
    })
  })
})
