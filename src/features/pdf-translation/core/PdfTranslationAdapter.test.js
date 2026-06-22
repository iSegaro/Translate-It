import { describe, expect, it } from 'vitest'
import { PdfTranslationAdapter } from './PdfTranslationAdapter.js'

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
})
