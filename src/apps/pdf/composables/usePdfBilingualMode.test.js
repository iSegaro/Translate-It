import { describe, expect, it, vi } from 'vitest'
import { usePdfBilingualMode } from './usePdfBilingualMode.js'

describe('usePdfBilingualMode', () => {
  it('defaults to original mode', () => {
    const { viewerMode, isOriginalOnly, isBilingual } = usePdfBilingualMode()

    expect(viewerMode.value).toBe('original')
    expect(isOriginalOnly.value).toBe(true)
    expect(isBilingual.value).toBe(false)
  })

  it('sets viewer mode correctly', () => {
    const { viewerMode, setMode, isOriginalOnly, isTranslatedOnly } = usePdfBilingualMode()

    setMode('original')
    expect(viewerMode.value).toBe('original')
    expect(isOriginalOnly.value).toBe(true)
    expect(isTranslatedOnly.value).toBe(false)

    setMode('translated')
    expect(viewerMode.value).toBe('translated')
    expect(isTranslatedOnly.value).toBe(true)
    expect(isOriginalOnly.value).toBe(false)
  })

  it('ignores invalid modes', () => {
    const { viewerMode, setMode } = usePdfBilingualMode()
    const loggerWarn = vi.fn()

    vi.stubGlobal('console', { warn: loggerWarn })

    setMode('invalid')
    expect(viewerMode.value).toBe('original')
  })

  it('cycles through modes in order', () => {
    const { viewerMode, cycleMode } = usePdfBilingualMode()

    expect(viewerMode.value).toBe('original')
    cycleMode()
    expect(viewerMode.value).toBe('bilingual')
    cycleMode()
    expect(viewerMode.value).toBe('translated')
    cycleMode()
    expect(viewerMode.value).toBe('translated-pdf')
    cycleMode()
    expect(viewerMode.value).toBe('original')
  })

  it('resets to original mode', () => {
    const { viewerMode, setMode, reset } = usePdfBilingualMode()

    setMode('translated')
    expect(viewerMode.value).toBe('translated')

    reset()
    expect(viewerMode.value).toBe('original')
  })

  it('computes showOriginalPane and showTranslatedPane', () => {
    const { setMode, showOriginalPane, showTranslatedPane } = usePdfBilingualMode()

    setMode('original')
    expect(showOriginalPane.value).toBe(true)
    expect(showTranslatedPane.value).toBe(false)

    setMode('translated')
    expect(showOriginalPane.value).toBe(false)
    expect(showTranslatedPane.value).toBe(true)

    setMode('bilingual')
    expect(showOriginalPane.value).toBe(true)
    expect(showTranslatedPane.value).toBe(true)

    setMode('translated-pdf')
    expect(showOriginalPane.value).toBe(true)
    expect(showTranslatedPane.value).toBe(false)
  })

  it('computes isTranslatedPdf and showOverlayLayer', () => {
    const { setMode, isTranslatedPdf, showOverlayLayer } = usePdfBilingualMode()

    setMode('original')
    expect(isTranslatedPdf.value).toBe(false)
    expect(showOverlayLayer.value).toBe(false)

    setMode('bilingual')
    expect(isTranslatedPdf.value).toBe(false)
    expect(showOverlayLayer.value).toBe(false)

    setMode('translated')
    expect(isTranslatedPdf.value).toBe(false)
    expect(showOverlayLayer.value).toBe(false)

    setMode('translated-pdf')
    expect(isTranslatedPdf.value).toBe(true)
    expect(showOverlayLayer.value).toBe(true)
  })
})
