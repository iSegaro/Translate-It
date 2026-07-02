import { computed, ref, watch } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfViewerMode')

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

export function usePdfViewerMode() {
  const contentView = ref(CONTENT_VIEW.ORIGINAL)
  const layoutMode = ref(LAYOUT_MODE.SINGLE)

  // Safety net: enforce invariant at the reactivity level.
  // Sync flush ensures layoutMode is corrected immediately when
  // contentView changes, before any computed or watcher reads stale state.
  watch(contentView, (newVal) => {
    if (newVal !== CONTENT_VIEW.TRANSLATION && layoutMode.value === LAYOUT_MODE.SIDE_BY_SIDE) {
      layoutMode.value = LAYOUT_MODE.SINGLE
      logger.info('Layout reset to single (content view no longer supports side-by-side)', { contentView: newVal })
    }
  }, { flush: 'sync' })

  const showOriginalPane = computed(() => {
    return contentView.value !== CONTENT_VIEW.TRANSLATION || layoutMode.value === LAYOUT_MODE.SIDE_BY_SIDE
  })
  const showTranslatedPane = computed(() => contentView.value === CONTENT_VIEW.TRANSLATION)
  const showOverlayLayer = computed(() => contentView.value === CONTENT_VIEW.TRANSLATED_PDF)

  const isSideBySide = computed(() => layoutMode.value === LAYOUT_MODE.SIDE_BY_SIDE)

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

  function reset() {
    contentView.value = CONTENT_VIEW.ORIGINAL
    layoutMode.value = LAYOUT_MODE.SINGLE
  }

  return {
    contentView,
    layoutMode,
    setContentView,
    setLayoutMode,
    isSideBySide,
    showOriginalPane,
    showTranslatedPane,
    showOverlayLayer,
    reset
  }
}
