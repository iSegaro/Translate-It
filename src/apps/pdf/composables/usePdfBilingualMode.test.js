import { describe, expect, it, vi } from 'vitest'
import { usePdfBilingualMode } from './usePdfBilingualMode.js'

describe('usePdfBilingualMode', () => {
  // ── Initial state ────────────────────────────────────────────

  it('defaults to original content view and single layout', () => {
    const { contentView, layoutMode } = usePdfBilingualMode()

    expect(contentView.value).toBe('original')
    expect(layoutMode.value).toBe('single')
  })

  it('defaults visibility correctly', () => {
    const { showOriginalPane, showTranslatedPane, showOverlayLayer } = usePdfBilingualMode()

    expect(showOriginalPane.value).toBe(true)
    expect(showTranslatedPane.value).toBe(false)
    expect(showOverlayLayer.value).toBe(false)
  })

  // ── contentView ──────────────────────────────────────────────

  describe('contentView', () => {
    it('sets content view to original', () => {
      const { contentView, layoutMode, setContentView } = usePdfBilingualMode()

      setContentView('original')

      expect(contentView.value).toBe('original')
      expect(layoutMode.value).toBe('single')
    })

    it('sets content view to translation', () => {
      const { contentView, setContentView } = usePdfBilingualMode()

      setContentView('translation')

      expect(contentView.value).toBe('translation')
    })

    it('sets content view to translated-pdf', () => {
      const { contentView, showOverlayLayer, setContentView } = usePdfBilingualMode()

      setContentView('translated-pdf')

      expect(contentView.value).toBe('translated-pdf')
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

  // ── layoutMode ───────────────────────────────────────────────

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

  // ── isSideBySide ─────────────────────────────────────────────

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

  // ── Visibility ───────────────────────────────────────────────

  describe('visibility', () => {
    it('shows original pane when content is original', () => {
      const { showOriginalPane, showTranslatedPane, showOverlayLayer, setContentView } = usePdfBilingualMode()

      setContentView('original')

      expect(showOriginalPane.value).toBe(true)
      expect(showTranslatedPane.value).toBe(false)
      expect(showOverlayLayer.value).toBe(false)
    })

    it('shows both panes in translation + side-by-side', () => {
      const { showOriginalPane, showTranslatedPane, showOverlayLayer, setContentView, setLayoutMode } = usePdfBilingualMode()

      setContentView('translation')
      setLayoutMode('side-by-side')

      expect(showOriginalPane.value).toBe(true)
      expect(showTranslatedPane.value).toBe(true)
      expect(showOverlayLayer.value).toBe(false)
    })

    it('shows only translated pane in translation + single', () => {
      const { showOriginalPane, showTranslatedPane, showOverlayLayer, setContentView } = usePdfBilingualMode()

      setContentView('translation')

      expect(showOriginalPane.value).toBe(false)
      expect(showTranslatedPane.value).toBe(true)
      expect(showOverlayLayer.value).toBe(false)
    })

    it('shows original pane with overlay in translated-pdf', () => {
      const { showOriginalPane, showTranslatedPane, showOverlayLayer, setContentView } = usePdfBilingualMode()

      setContentView('translated-pdf')

      expect(showOriginalPane.value).toBe(true)
      expect(showTranslatedPane.value).toBe(false)
      expect(showOverlayLayer.value).toBe(true)
    })
  })

  // ── reset ────────────────────────────────────────────────────

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
