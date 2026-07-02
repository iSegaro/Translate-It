import { computed, ref, watch } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfBilingualMode')

// ───────────────────────────────────────────────────────────
// Domain model — architectural contract
// ───────────────────────────────────────────────────────────

/**
 * @readonly
 * @enum {string}
 *
 * contentView — WHAT content to display in the viewer.
 *
 * | Value            | Meaning                                  |
 * |------------------|------------------------------------------|
 * | 'original'       | Show the original PDF document           |
 * | 'translation'    | Show the translated text content         |
 * | 'translated-pdf' | Show the translated PDF overlay          |
 */
const CONTENT_VIEW = Object.freeze({
  ORIGINAL: 'original',
  TRANSLATION: 'translation',
  TRANSLATED_PDF: 'translated-pdf'
})
export { CONTENT_VIEW }

const VALID_CONTENT_VIEWS = new Set(Object.values(CONTENT_VIEW))

/**
 * @readonly
 * @enum {string}
 *
 * layoutMode — HOW to arrange the visible panes.
 *
 * | Value           | Meaning                                    |
 * |-----------------|--------------------------------------------|
 * | 'single'        | Single-pane layout (one column)            |
 * | 'side-by-side'  | Two-pane layout (side-by-side columns)     |
 */
const LAYOUT_MODE = Object.freeze({
  SINGLE: 'single',
  SIDE_BY_SIDE: 'side-by-side'
})
export { LAYOUT_MODE }

const VALID_LAYOUT_MODES = new Set(Object.values(LAYOUT_MODE))

/**
 * Valid combinations of (contentView, layoutMode).
 *
 * ┌──────────────────┬──────────────┬───────┬────────────────────────┐
 * │ contentView      │ layoutMode   │ valid │ note                   │
 * ├──────────────────┼──────────────┼───────┼────────────────────────┤
 * │ original         │ single       │ ✅    │ Original PDF only      │
 * │ translation      │ single       │ ✅    │ Translation text only  │
 * │ translation      │ side-by-side │ ✅    │ Original + translation │
 * │ translated-pdf   │ single       │ ✅    │ Translated PDF overlay │
 * │ original         │ side-by-side │ ❌    │ Not meaningful         │
 * │ translated-pdf   │ side-by-side │ 🚧    │ Planned for later      │
 * └──────────────────┴──────────────┴───────┴────────────────────────┘
 *
 * Invariants:
 *   1. If contentView !== 'translation', layoutMode MUST be 'single'.
 *   2. If layoutMode is 'side-by-side', contentView MUST be 'translation'.
 *
 * Transition rules:
 *   1. Setting contentView to anything other than 'translation' while
 *      layoutMode is 'side-by-side' automatically resets layoutMode → 'single'.
 *   2. Setting layoutMode to 'side-by-side' while contentView !== 'translation'
 *      is rejected (silent no-op with a warning).
 *
 * Note: 'translated-pdf' + 'side-by-side' is explicitly invalid for now.
 *       Remove this restriction when the Translated PDF side-by-side feature
 *       is implemented.
 */

// ──────────────────────────────────────────
// Legacy constants (migration compat)
// ──────────────────────────────────────────

const VIEWER_MODES = Object.freeze({
  ORIGINAL: 'original',
  BILINGUAL: 'bilingual',
  TRANSLATED: 'translated',
  TRANSLATED_PDF: 'translated-pdf'
})

const MODE_ORDER = [
  VIEWER_MODES.ORIGINAL,
  VIEWER_MODES.BILINGUAL,
  VIEWER_MODES.TRANSLATED,
  VIEWER_MODES.TRANSLATED_PDF
]

// ──────────────────────────────────────────
// Mapping: (contentView, layoutMode) ↔ viewerMode
// ──────────────────────────────────────────

function deriveViewerMode(contentView, layoutMode) {
  if (contentView === CONTENT_VIEW.ORIGINAL) return VIEWER_MODES.ORIGINAL
  if (contentView === CONTENT_VIEW.TRANSLATED_PDF) return VIEWER_MODES.TRANSLATED_PDF

  return layoutMode === LAYOUT_MODE.SIDE_BY_SIDE
    ? VIEWER_MODES.BILINGUAL
    : VIEWER_MODES.TRANSLATED
}

function parseLegacyMode(mode) {
  switch (mode) {
    case VIEWER_MODES.ORIGINAL:
      return { contentView: CONTENT_VIEW.ORIGINAL, layoutMode: LAYOUT_MODE.SINGLE }
    case VIEWER_MODES.TRANSLATED:
      return { contentView: CONTENT_VIEW.TRANSLATION, layoutMode: LAYOUT_MODE.SINGLE }
    case VIEWER_MODES.BILINGUAL:
      return { contentView: CONTENT_VIEW.TRANSLATION, layoutMode: LAYOUT_MODE.SIDE_BY_SIDE }
    case VIEWER_MODES.TRANSLATED_PDF:
      return { contentView: CONTENT_VIEW.TRANSLATED_PDF, layoutMode: LAYOUT_MODE.SINGLE }
    default:
      return null
  }
}

export function usePdfBilingualMode() {
  // ── Internal state (single source of truth) ──────────────────
  const contentView = ref(CONTENT_VIEW.ORIGINAL)
  const layoutMode = ref(LAYOUT_MODE.SINGLE)

  // ── Safety net: enforce invariant at the reactivity level ───
  // Sync flush ensures layoutMode is corrected immediately when
  // contentView changes, before any computed or watcher reads stale state.
  watch(contentView, (newVal) => {
    if (newVal !== CONTENT_VIEW.TRANSLATION && layoutMode.value === LAYOUT_MODE.SIDE_BY_SIDE) {
      layoutMode.value = LAYOUT_MODE.SINGLE
      logger.info('Layout reset to single (content view no longer supports side-by-side)', { contentView: newVal })
    }
  }, { flush: 'sync' })

  // ── Derived: legacy viewerMode (migration compat) ───────────
  const viewerMode = computed(() => deriveViewerMode(contentView.value, layoutMode.value))

  // ── Legacy computed flags (migration compat) ────────────────
  const isOriginalOnly = computed(() => viewerMode.value === VIEWER_MODES.ORIGINAL)
  const isBilingual = computed(() => viewerMode.value === VIEWER_MODES.BILINGUAL)
  const isTranslatedOnly = computed(() => viewerMode.value === VIEWER_MODES.TRANSLATED)
  const isTranslatedPdf = computed(() => viewerMode.value === VIEWER_MODES.TRANSLATED_PDF)

  const showOriginalPane = computed(() => {
    return contentView.value !== CONTENT_VIEW.TRANSLATION || layoutMode.value === LAYOUT_MODE.SIDE_BY_SIDE
  })
  const showTranslatedPane = computed(() => contentView.value === CONTENT_VIEW.TRANSLATION)
  const showOverlayLayer = computed(() => contentView.value === CONTENT_VIEW.TRANSLATED_PDF)

  // ── New public API ──────────────────────────────────────────
  function setContentView(val) {
    if (!VALID_CONTENT_VIEWS.has(val)) {
      logger.warn('Invalid content view:', val)
      return
    }

    contentView.value = val
    logger.info('Content view changed:', { contentView: val })
  }

  function setLayoutMode(val) {
    if (!VALID_LAYOUT_MODES.has(val)) {
      logger.warn('Invalid layout mode:', val)
      return
    }

    if (val === LAYOUT_MODE.SIDE_BY_SIDE && contentView.value !== CONTENT_VIEW.TRANSLATION) {
      logger.warn('Side-by-side layout is not allowed with content view:', contentView.value)
      return
    }

    layoutMode.value = val
    logger.info('Layout mode changed:', { layoutMode: val })
  }

  const isSideBySide = computed(() => layoutMode.value === LAYOUT_MODE.SIDE_BY_SIDE)

  // ── Legacy public API (migration compat) ────────────────────
  // Uses direct ref assignment for atomic mode transitions.
  // This intentionally bypasses setContentView/setLayoutMode to:
  //   1. Avoid redundant log messages for a single mode switch
  //   2. Ensure both refs update in the same synchronous block
  // The sync watch on contentView still enforces invariants.
  function setMode(mode) {
    const parsed = parseLegacyMode(mode)

    if (!parsed) {
      logger.warn('Invalid viewer mode:', mode)
      return
    }

    contentView.value = parsed.contentView
    layoutMode.value = parsed.layoutMode
    logger.info('Viewer mode changed:', { mode, contentView: parsed.contentView, layoutMode: parsed.layoutMode })
  }

  function cycleMode() {
    const currentIndex = MODE_ORDER.indexOf(viewerMode.value)
    const nextIndex = (currentIndex + 1) % MODE_ORDER.length
    setMode(MODE_ORDER[nextIndex])
  }

  function reset() {
    contentView.value = CONTENT_VIEW.ORIGINAL
    layoutMode.value = LAYOUT_MODE.SINGLE
  }

  return {
    // New API
    contentView,
    layoutMode,
    setContentView,
    setLayoutMode,
    isSideBySide,

    // Legacy API (migration compat)
    viewerMode,
    isOriginalOnly,
    isBilingual,
    isTranslatedOnly,
    isTranslatedPdf,
    showOriginalPane,
    showTranslatedPane,
    showOverlayLayer,
    setMode,
    cycleMode,
    reset
  }
}
