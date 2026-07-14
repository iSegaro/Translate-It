import { describe, expect, it, vi } from 'vitest'
import { restoreCachedPdfTranslations } from './PdfTranslationCacheRestore.js'

function createSession(initialState = {}) {
  const states = new Map(Object.entries(initialState))
  return {
    getBlockTranslationState: vi.fn((blockId) => states.get(blockId) || { blockId, status: 'idle' }),
    setBlockTranslationState: vi.fn((blockId, patch) => {
      states.set(blockId, { ...states.get(blockId), ...patch, blockId })
    })
  }
}

const settings = {
  translationSettingsHash: 'settings-hash',
  provider: 'googlev2',
  sourceLanguage: 'auto',
  targetLanguage: 'fa'
}

const block = { id: 'block-1', sourceTextHash: 'source-hash' }

function entry(overrides = {}) {
  return {
    blockId: block.id,
    translatedText: 'ترجمه',
    sourceTextHash: block.sourceTextHash,
    ...settings,
    ...overrides
  }
}

describe('restoreCachedPdfTranslations', () => {
  it('restores valid cache entries', () => {
    const session = createSession()

    const result = restoreCachedPdfTranslations({
      session,
      cacheTranslations: { [block.id]: entry() },
      sourceBlocks: [block],
      settings
    })

    expect(result.restoredBlockIds).toEqual([block.id])
    expect(session.setBlockTranslationState).toHaveBeenCalledWith(block.id, expect.objectContaining({
      translatedText: 'ترجمه',
      status: 'translated',
      translationSettingsHash: settings.translationSettingsHash
    }))
  })

  it('skips mismatched settings, provider, language, and source hash', () => {
    for (const badEntry of [
      entry({ translationSettingsHash: 'old' }),
      entry({ provider: 'openai' }),
      entry({ sourceLanguage: 'en' }),
      entry({ targetLanguage: 'de' }),
      entry({ sourceTextHash: 'other' })
    ]) {
      const session = createSession()
      restoreCachedPdfTranslations({ session, cacheTranslations: { [block.id]: badEntry }, sourceBlocks: [block], settings })
      expect(session.setBlockTranslationState).not.toHaveBeenCalled()
    }
  })

  it('is idempotent for translated and loading states', () => {
    for (const status of ['translated', 'loading']) {
      const session = createSession({ [block.id]: { blockId: block.id, status } })
      restoreCachedPdfTranslations({ session, cacheTranslations: { [block.id]: entry() }, sourceBlocks: [block], settings })
      expect(session.setBlockTranslationState).not.toHaveBeenCalled()
    }
  })

  it('restores text-only when translatedCells are invalid but text is valid', () => {
    const session = createSession()
    restoreCachedPdfTranslations({
      session,
      cacheTranslations: { [block.id]: entry({ translatedCells: [{ lineIndex: 0, cells: ['x'], structuredCells: [{ id: 'bad' }] }] }) },
      sourceBlocks: [block],
      settings
    })

    expect(session.setBlockTranslationState).toHaveBeenCalledWith(block.id, expect.not.objectContaining({ translatedCells: expect.anything() }))
  })
})
