import { describe, expect, it, vi } from 'vitest'
import { createDefaultPdfTranslationState, PdfTranslationState } from './PdfTranslationState.js'

describe('PdfTranslationState', () => {
  it('creates default state', () => {
    expect(createDefaultPdfTranslationState('block-1')).toEqual({
      blockId: 'block-1',
      translatedText: '',
      translatedCells: null,
      status: 'idle',
      provider: '',
      sourceLanguage: '',
      targetLanguage: '',
      sourceTextHash: '',
      translationSettingsHash: '',
      updatedAt: 0,
      error: null
    })
  })

  it('returns default state for missing block', () => {
    const state = new PdfTranslationState()

    expect(state.getBlockTranslationState('missing')).toMatchObject({
      blockId: 'missing',
      status: 'idle',
      translatedText: ''
    })
  })

  it('sets block translation state', () => {
    const state = new PdfTranslationState()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    const next = state.setBlockTranslationState('block-1', {
      translatedText: 'Bonjour',
      status: 'translated',
      provider: 'test-provider'
    })

    expect(next).toMatchObject({
      blockId: 'block-1',
      translatedText: 'Bonjour',
      status: 'translated',
      provider: 'test-provider'
    })
    expect(next.updatedAt).toBe(Date.now())
    expect(state.map.get('block-1')).toBe(next)

    vi.useRealTimers()
  })

  it('preserves explicit updatedAt', () => {
    const state = new PdfTranslationState()

    const next = state.setBlockTranslationState('block-1', {
      status: 'translated',
      updatedAt: 123
    })

    expect(next.updatedAt).toBe(123)
  })

  it('updates multiple states and skips invalid entries', () => {
    const state = new PdfTranslationState()

    const updated = state.updateBlockTranslationStates([
      { blockId: 'block-1', status: 'translated', translatedText: 'One' },
      { status: 'translated', translatedText: 'Invalid' },
      { blockId: 'block-2', status: 'error', error: 'Failed' }
    ])

    expect(updated).toHaveLength(2)
    expect(state.map.size).toBe(2)
    expect(state.getBlockTranslationState('block-1').translatedText).toBe('One')
    expect(state.getBlockTranslationState('block-2').error).toBe('Failed')
  })

  it('resets translation states', () => {
    const state = new PdfTranslationState()
    state.setBlockTranslationState('block-1', { status: 'translated' })

    state.resetTranslationStates()

    expect(state.map.size).toBe(0)
  })

  it('supports map compatibility and iteration helpers', () => {
    const state = new PdfTranslationState()
    state.map = new Map([
      ['block-1', { blockId: 'block-1', status: 'translated' }],
      ['block-2', { blockId: 'block-2', status: 'error' }]
    ])

    expect([...state.entries()].map(([blockId]) => blockId)).toEqual(['block-1', 'block-2'])
    expect([...state.values()].map((entry) => entry.status)).toEqual(['translated', 'error'])
    expect(state.hasAnyTranslated()).toBe(true)
    expect(state.getStats()).toEqual({
      totalCount: 2,
      translatedCount: 1,
      failedCount: 1,
      hasTranslatedBlocks: true
    })
  })

  it('normalizes invalid map assignment to an empty map', () => {
    const state = new PdfTranslationState()

    state.map = null

    expect(state.map).toBeInstanceOf(Map)
    expect(state.map.size).toBe(0)
  })
})
