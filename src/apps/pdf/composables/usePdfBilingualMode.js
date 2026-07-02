import { computed, ref } from 'vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.PDF, 'usePdfBilingualMode')

const VIEWER_MODES = Object.freeze({
  ORIGINAL: 'original',
  BILINGUAL: 'bilingual',
  TRANSLATED: 'translated',
  TRANSLATED_PDF: 'translated-pdf'
})

const MODE_ORDER = [VIEWER_MODES.ORIGINAL, VIEWER_MODES.BILINGUAL, VIEWER_MODES.TRANSLATED, VIEWER_MODES.TRANSLATED_PDF]

export function usePdfBilingualMode() {
  const viewerMode = ref(VIEWER_MODES.ORIGINAL)

  const isOriginalOnly = computed(() => viewerMode.value === VIEWER_MODES.ORIGINAL)
  const isBilingual = computed(() => viewerMode.value === VIEWER_MODES.BILINGUAL)
  const isTranslatedOnly = computed(() => viewerMode.value === VIEWER_MODES.TRANSLATED)
  const isTranslatedPdf = computed(() => viewerMode.value === VIEWER_MODES.TRANSLATED_PDF)
  const showOriginalPane = computed(() => viewerMode.value !== VIEWER_MODES.TRANSLATED)
  const showTranslatedPane = computed(() => viewerMode.value !== VIEWER_MODES.ORIGINAL && viewerMode.value !== VIEWER_MODES.TRANSLATED_PDF)
  const showOverlayLayer = computed(() => viewerMode.value === VIEWER_MODES.TRANSLATED_PDF)

  function setMode(mode) {
    if (!MODE_ORDER.includes(mode)) {
      logger.warn('Invalid viewer mode:', mode)
      return
    }

    viewerMode.value = mode
    logger.info('Viewer mode changed:', { mode })
  }

  function cycleMode() {
    const currentIndex = MODE_ORDER.indexOf(viewerMode.value)
    const nextIndex = (currentIndex + 1) % MODE_ORDER.length
    setMode(MODE_ORDER[nextIndex])
  }

  function reset() {
    viewerMode.value = VIEWER_MODES.ORIGINAL
  }

  return {
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
