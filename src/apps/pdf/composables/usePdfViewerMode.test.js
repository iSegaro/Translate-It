import { describe, expect, it, vi } from 'vitest'
import { usePdfViewerMode, VIEWER_ROLE } from './usePdfViewerMode.js'

describe('usePdfViewerMode', () => {
  // ── Constants ────────────────────────────────────────────────

  it('exports VIEWER_ROLE enum', () => {
    expect(VIEWER_ROLE).toEqual({
      ORIGINAL: 'original',
      OVERLAY: 'overlay'
    })
    expect(Object.freeze(VIEWER_ROLE)).toBe(VIEWER_ROLE)
  })

  // ── Initial state ────────────────────────────────────────────

  it('defaults to original content view and single layout', () => {
    const { contentView, layoutMode } = usePdfViewerMode()

    expect(contentView.value).toBe('original')
    expect(layoutMode.value).toBe('single')
  })

  it('defaults visibility correctly', () => {
    const { showOriginalPane, showTranslatedTextPane, showTranslatedPdfPane, showOverlayLayer } = usePdfViewerMode()

    expect(showOriginalPane.value).toBe(true)
    expect(showTranslatedTextPane.value).toBe(false)
    expect(showTranslatedPdfPane.value).toBe(false)
    expect(showOverlayLayer.value).toBe(false)
  })

  // ── contentView ──────────────────────────────────────────────

  describe('contentView', () => {
    it('sets content view to original', () => {
      const { contentView, layoutMode, setContentView } = usePdfViewerMode()

      setContentView('original')

      expect(contentView.value).toBe('original')
      expect(layoutMode.value).toBe('single')
    })

    it('sets content view to translation', () => {
      const { contentView, setContentView } = usePdfViewerMode()

      setContentView('translation')

      expect(contentView.value).toBe('translation')
    })

    it('sets content view to translated-pdf', () => {
      const { contentView, showOverlayLayer, setContentView } = usePdfViewerMode()

      setContentView('translated-pdf')

      expect(contentView.value).toBe('translated-pdf')
      expect(showOverlayLayer.value).toBe(true)
    })

    it('ignores invalid content view values', () => {
      const { contentView, setContentView } = usePdfViewerMode()
      const loggerWarn = vi.fn()
      vi.stubGlobal('console', { warn: loggerWarn })

      setContentView('invalid')

      expect(contentView.value).toBe('original')
    })

    it('auto-resets layout to single when switching to original', () => {
      const { contentView, layoutMode, setContentView, setLayoutMode } = usePdfViewerMode()

      setContentView('translation')
      setLayoutMode('side-by-side')
      expect(layoutMode.value).toBe('side-by-side')

      setContentView('original')

      expect(contentView.value).toBe('original')
      expect(layoutMode.value).toBe('single')
    })

    it('preserves side-by-side when switching from translation to translated-pdf', () => {
      const { contentView, layoutMode, setContentView, setLayoutMode } = usePdfViewerMode()

      setContentView('translation')
      setLayoutMode('side-by-side')
      expect(layoutMode.value).toBe('side-by-side')

      setContentView('translated-pdf')

      expect(contentView.value).toBe('translated-pdf')
      expect(layoutMode.value).toBe('side-by-side')
    })
  })

  // ── layoutMode ───────────────────────────────────────────────

  describe('layoutMode', () => {
    it('sets layout mode to single', () => {
      const { layoutMode, setLayoutMode } = usePdfViewerMode()

      setLayoutMode('single')

      expect(layoutMode.value).toBe('single')
    })

    it('sets layout mode to side-by-side when content is translation', () => {
      const { contentView, layoutMode, isSideBySide, setContentView, setLayoutMode } = usePdfViewerMode()

      setContentView('translation')
      setLayoutMode('side-by-side')

      expect(layoutMode.value).toBe('side-by-side')
      expect(isSideBySide.value).toBe(true)
    })

    it('sets layout mode to side-by-side when content is translated-pdf', () => {
      const { contentView, layoutMode, isSideBySide, setContentView, setLayoutMode } = usePdfViewerMode()

      setContentView('translated-pdf')
      setLayoutMode('side-by-side')

      expect(layoutMode.value).toBe('side-by-side')
      expect(isSideBySide.value).toBe(true)
    })

    it('rejects side-by-side when content view is original', () => {
      const { layoutMode, setLayoutMode } = usePdfViewerMode()
      const loggerWarn = vi.fn()
      vi.stubGlobal('console', { warn: loggerWarn })

      setLayoutMode('side-by-side')

      expect(layoutMode.value).toBe('single')
    })

    it('ignores invalid layout mode values', () => {
      const { layoutMode, setLayoutMode } = usePdfViewerMode()
      const loggerWarn = vi.fn()
      vi.stubGlobal('console', { warn: loggerWarn })

      setLayoutMode('triple')

      expect(layoutMode.value).toBe('single')
    })
  })

  // ── isSideBySide ─────────────────────────────────────────────

  describe('isSideBySide', () => {
    it('is true when layout is side-by-side', () => {
      const { isSideBySide, setContentView, setLayoutMode } = usePdfViewerMode()

      setContentView('translation')
      setLayoutMode('side-by-side')

      expect(isSideBySide.value).toBe(true)
    })

    it('is false when layout is single', () => {
      const { isSideBySide } = usePdfViewerMode()

      expect(isSideBySide.value).toBe(false)
    })
  })

  // ── Visibility ───────────────────────────────────────────────

  describe('visibility', () => {
    it('shows original pane when content is original', () => {
      const { showOriginalPane, showTranslatedTextPane, showTranslatedPdfPane, showOverlayLayer, setContentView } = usePdfViewerMode()

      setContentView('original')

      expect(showOriginalPane.value).toBe(true)
      expect(showTranslatedTextPane.value).toBe(false)
      expect(showTranslatedPdfPane.value).toBe(false)
      expect(showOverlayLayer.value).toBe(false)
    })

    it('shows translated text pane in translation + single', () => {
      const { showOriginalPane, showTranslatedTextPane, showTranslatedPdfPane, showOverlayLayer, setContentView } = usePdfViewerMode()

      setContentView('translation')

      expect(showOriginalPane.value).toBe(false)
      expect(showTranslatedTextPane.value).toBe(true)
      expect(showTranslatedPdfPane.value).toBe(false)
      expect(showOverlayLayer.value).toBe(false)
    })

    it('shows both panes in translation + side-by-side', () => {
      const { showOriginalPane, showTranslatedTextPane, showTranslatedPdfPane, showOverlayLayer, setContentView, setLayoutMode } = usePdfViewerMode()

      setContentView('translation')
      setLayoutMode('side-by-side')

      expect(showOriginalPane.value).toBe(true)
      expect(showTranslatedTextPane.value).toBe(true)
      expect(showTranslatedPdfPane.value).toBe(false)
      expect(showOverlayLayer.value).toBe(false)
    })

    it('shows original pane with overlay in translated-pdf + single', () => {
      const { showOriginalPane, showTranslatedTextPane, showTranslatedPdfPane, showOverlayLayer, setContentView } = usePdfViewerMode()

      setContentView('translated-pdf')

      expect(showOriginalPane.value).toBe(true)
      expect(showTranslatedTextPane.value).toBe(false)
      expect(showTranslatedPdfPane.value).toBe(false)
      expect(showOverlayLayer.value).toBe(true)
    })

    it('shows original and translated pdf pane in translated-pdf + side-by-side', () => {
      const { showOriginalPane, showTranslatedTextPane, showTranslatedPdfPane, showOverlayLayer, setContentView, setLayoutMode } = usePdfViewerMode()

      setContentView('translated-pdf')
      setLayoutMode('side-by-side')

      expect(showOriginalPane.value).toBe(true)
      expect(showTranslatedTextPane.value).toBe(false)
      expect(showTranslatedPdfPane.value).toBe(true)
      expect(showOverlayLayer.value).toBe(false)
    })
  })

  // ── reset ────────────────────────────────────────────────────

  describe('reset', () => {
    it('resets both axes to defaults', () => {
      const { contentView, layoutMode, setContentView, setLayoutMode, reset } = usePdfViewerMode()

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
