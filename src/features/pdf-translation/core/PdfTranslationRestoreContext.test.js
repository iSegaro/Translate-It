import { describe, expect, it, vi } from 'vitest'
import { createTranslationRestoreContext } from './PdfTranslationRestoreContext.js'

describe('createTranslationRestoreContext', () => {
  it('prevents duplicate same-page restore and allows different pages', () => {
    const context = createTranslationRestoreContext({
      documentGeneration: 1,
      getDocumentGeneration: () => 1,
      resolveSettings: () => ({ translationSettingsHash: 'h' })
    })

    expect(context.tryBeginPageRestore(12)).toBe(true)
    expect(context.tryBeginPageRestore(12)).toBe(false)
    expect(context.tryBeginPageRestore(18)).toBe(true)
    expect(context.pendingPageCount).toBe(2)

    context.finishPageRestore(12)
    context.finishPageRestore(18)
    expect(context.pendingPageCount).toBe(0)
  })

  it('marks stale contexts after document or settings changes', () => {
    let generation = 1
    let settingsVersion = 1
    const context = createTranslationRestoreContext({
      documentGeneration: generation,
      getDocumentGeneration: () => generation,
      getSettingsVersion: () => settingsVersion,
      resolveSettings: () => ({ translationSettingsHash: 'h' })
    })

    expect(context.isCurrent()).toBe(true)
    generation = 2
    expect(context.isCurrent()).toBe(false)

    const nextContext = createTranslationRestoreContext({
      documentGeneration: generation,
      getDocumentGeneration: () => generation,
      getSettingsVersion: () => settingsVersion,
      resolveSettings: () => ({ translationSettingsHash: 'h' })
    })
    settingsVersion = 2
    expect(nextContext.isCurrent()).toBe(false)
  })

  it('requires exactly one finish after successful begin', () => {
    const context = createTranslationRestoreContext({
      documentGeneration: 1,
      getDocumentGeneration: () => 1,
      resolveSettings: () => ({ translationSettingsHash: 'h' })
    })

    expect(context.tryBeginPageRestore(1)).toBe(true)
    try {
      throw new Error('restore failed')
    } catch {}
    finally {
      context.finishPageRestore(1)
    }

    expect(context.pendingPageCount).toBe(0)
    expect(context.tryBeginPageRestore(1)).toBe(true)
  })

  it('does not require finish when begin returns false', () => {
    const context = createTranslationRestoreContext({
      documentGeneration: 1,
      getDocumentGeneration: () => 2,
      resolveSettings: vi.fn()
    })

    expect(context.tryBeginPageRestore(1)).toBe(false)
    expect(context.pendingPageCount).toBe(0)
  })
})
