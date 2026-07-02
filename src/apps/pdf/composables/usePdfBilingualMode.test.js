import { describe, expect, it, vi } from 'vitest'
import { usePdfBilingualMode } from './usePdfBilingualMode.js'

describe('usePdfBilingualMode', () => {
  // ── Legacy API backward compat ────────────────────────────────

  it('defaults to original content view and single layout', () => {
    const { contentView, layoutMode } = usePdfBilingualMode()

    expect(contentView.value).toBe('original')
    expect(layoutMode.value).toBe('single')
  })

  it('defaults to original viewer mode (legacy compat)', () => {
    const { viewerMode, isOriginalOnly, isBilingual } = usePdfBilingualMode()

    expect(viewerMode.value).toBe('original')
    expect(isOriginalOnly.value).toBe(true)
    expect(isBilingual.value).toBe(false)
  })

  it('sets viewer mode correctly (legacy compat)', () => {
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

  it('ignores invalid viewer modes', () => {
    const { viewerMode, setMode } = usePdfBilingualMode()
    const loggerWarn = vi.fn()

    vi.stubGlobal('console', { warn: loggerWarn })

    setMode('invalid')
    expect(viewerMode.value).toBe('original')
  })

  it('cycles through modes in order (legacy compat)', () => {
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

  it('resets to original mode (legacy compat)', () => {
    const { viewerMode, setMode, reset } = usePdfBilingualMode()

    setMode('translated')
    expect(viewerMode.value).toBe('translated')

    reset()
    expect(viewerMode.value).toBe('original')
  })

  it('computes showOriginalPane and showTranslatedPane (legacy compat)', () => {
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

  it('computes isTranslatedPdf and showOverlayLayer (legacy compat)', () => {
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

  // ── New domain model ──────────────────────────────────────────

  describe('contentView', () => {
    it('sets content view to original', () => {
      const { contentView, layoutMode, viewerMode, setContentView } = usePdfBilingualMode()

      setContentView('original')

      expect(contentView.value).toBe('original')
      expect(layoutMode.value).toBe('single')
      expect(viewerMode.value).toBe('original')
    })

    it('sets content view to translation', () => {
      const { contentView, viewerMode, setContentView } = usePdfBilingualMode()

      setContentView('translation')

      expect(contentView.value).toBe('translation')
      expect(viewerMode.value).toBe('translated')
    })

    it('sets content view to translated-pdf', () => {
      const { contentView, viewerMode, showOverlayLayer, setContentView } = usePdfBilingualMode()

      setContentView('translated-pdf')

      expect(contentView.value).toBe('translated-pdf')
      expect(viewerMode.value).toBe('translated-pdf')
      expect(showOverlayLayer.value).toBe(true)
    })

    it('ignores invalid content view values', () => {
      const { contentView, setContentView } = usePdfBilingualMode()
      const loggerWarn = vi.fn()
      vi.stubGlobal('console', { warn: loggerWarn })

      setContentView('invalid')

      expect(contentView.value).toBe('original')
    })

    it('auto-resets layout to single when leaving translation', () => {
      const { contentView, layoutMode, setContentView, setLayoutMode } = usePdfBilingualMode()

      setContentView('translation')
      setLayoutMode('side-by-side')
      expect(layoutMode.value).toBe('side-by-side')

      setContentView('original')

      expect(contentView.value).toBe('original')
      expect(layoutMode.value).toBe('single')
    })

    it('auto-resets layout to single when switching from translation to translated-pdf', () => {
      const { contentView, layoutMode, setContentView, setLayoutMode } = usePdfBilingualMode()

      setContentView('translation')
      setLayoutMode('side-by-side')
      expect(layoutMode.value).toBe('side-by-side')

      setContentView('translated-pdf')

      expect(contentView.value).toBe('translated-pdf')
      expect(layoutMode.value).toBe('single')
    })
  })

  describe('layoutMode', () => {
    it('sets layout mode to single', () => {
      const { layoutMode, setLayoutMode } = usePdfBilingualMode()

      setLayoutMode('single')

      expect(layoutMode.value).toBe('single')
    })

    it('sets layout mode to side-by-side when content view supports it', () => {
      const { contentView, layoutMode, isSideBySide, setContentView, setLayoutMode } = usePdfBilingualMode()

      setContentView('translation')
      setLayoutMode('side-by-side')

      expect(layoutMode.value).toBe('side-by-side')
      expect(isSideBySide.value).toBe(true)
    })

    it('rejects side-by-side when content view is original', () => {
      const { layoutMode, setLayoutMode } = usePdfBilingualMode()
      const loggerWarn = vi.fn()
      vi.stubGlobal('console', { warn: loggerWarn })

      setLayoutMode('side-by-side')

      expect(layoutMode.value).toBe('single')
    })

    it('rejects side-by-side when content view is translated-pdf', () => {
      const { contentView, layoutMode, setContentView, setLayoutMode } = usePdfBilingualMode()
      const loggerWarn = vi.fn()
      vi.stubGlobal('console', { warn: loggerWarn })

      setContentView('translated-pdf')
      setLayoutMode('side-by-side')

      expect(layoutMode.value).toBe('single')
    })

    it('ignores invalid layout mode values', () => {
      const { layoutMode, setLayoutMode } = usePdfBilingualMode()
      const loggerWarn = vi.fn()
      vi.stubGlobal('console', { warn: loggerWarn })

      setLayoutMode('triple')

      expect(layoutMode.value).toBe('single')
    })
  })

  describe('isSideBySide', () => {
    it('is true when layout is side-by-side', () => {
      const { isSideBySide, setContentView, setLayoutMode } = usePdfBilingualMode()

      setContentView('translation')
      setLayoutMode('side-by-side')

      expect(isSideBySide.value).toBe(true)
    })

    it('is false when layout is single', () => {
      const { isSideBySide } = usePdfBilingualMode()

      expect(isSideBySide.value).toBe(false)
    })
  })

  describe('invariant enforcement via legacy API', () => {
    it('bilingual mode maps to translation + side-by-side', () => {
      const { contentView, layoutMode, viewerMode, setMode } = usePdfBilingualMode()

      setMode('bilingual')

      expect(contentView.value).toBe('translation')
      expect(layoutMode.value).toBe('side-by-side')
      expect(viewerMode.value).toBe('bilingual')
    })

    it('translated mode maps to translation + single', () => {
      const { contentView, layoutMode, setMode } = usePdfBilingualMode()

      setMode('translated')

      expect(contentView.value).toBe('translation')
      expect(layoutMode.value).toBe('single')
    })
  })

  describe('reset', () => {
    it('resets both axes to defaults', () => {
      const { contentView, layoutMode, setContentView, setLayoutMode, reset } = usePdfBilingualMode()

      setContentView('translation')
      setLayoutMode('side-by-side')
      expect(contentView.value).toBe('translation')
      expect(layoutMode.value).toBe('side-by-side')

      reset()

      expect(contentView.value).toBe('original')
      expect(layoutMode.value).toBe('single')
    })
  })
})
