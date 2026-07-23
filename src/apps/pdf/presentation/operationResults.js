export const EXPORT_RESULTS = Object.freeze({
  COMPLETED: 'export-completed',
  FAILED: 'export-failed'
})

export const COMPARISON_RESULTS = Object.freeze({
  COMPLETED: 'comparison-completed',
  FAILED: 'comparison-failed',
  PROGRESS: 'comparison-progress'
})

export const OCR_RESULTS = Object.freeze({
  COMPLETED: 'ocr-completed',
  FAILED: 'ocr-failed',
  LANGUAGE_MISSING: 'ocr-language-missing',
  PROGRESS: 'ocr-progress'
})

export const REGION_OCR_RESULTS = Object.freeze({
  COMPLETED: 'region-ocr-completed',
  FAILED: 'region-ocr-failed',
  NO_TEXT: 'region-ocr-no-text',
  PROGRESS: 'region-ocr-progress'
})

export const TRANSLATION_RESULTS = Object.freeze({
  PROGRESS: 'translation-progress',
  PARTIAL: 'translation-partial'
})

export const LOCAL_RESULTS = Object.freeze({
  PANE_EMPTY: 'pane-empty',
  PAGE_OCR_COMPLETE: 'page-ocr-complete',
  BLOCK_LOADING: 'block-translation-loading',
  BLOCK_ERROR: 'block-translation-error'
})
